import { Prisma, ScaleCandidateStatus, ScaleSourceType } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { AuthUser } from '../../middlewares/auth';
import { HttpError } from '../../utils/httpError';
import { logAudit } from '../audit/audit.service';
import {
  calculateHash,
  compareScaleVersions,
  DetectedDocument,
  classifyDocumentConvention,
  detectDocumentsFromPage,
  documentMatchesConvention,
  downloadAndExtractText,
  ExtractedCategory,
  extractPeriodFromText,
  extractScalePeriods,
  ExtractionResult,
  summarizeNormativeChanges,
} from './scale-extraction.service';
import { categoryKeyFor, extractCctValues } from '../salary-scales/scale-helpers';

// validFrom debe usar UTC 00:00 para coincidir con getApprovedSalaryScale (que usa Date.UTC).
// Usar hora local desfasaría la comparación y la escala no se encontraría al liquidar.
function periodStartUtc(month: number, year: number) {
  return new Date(Date.UTC(year, month - 1, 1));
}

// Detecta conceptos adicionales (no son categorías del convenio): "Adic. Título", "Adicional X", "SNR", etc.
function isAdditionalConcept(name: string): boolean {
  return /^\s*(adic\b|adicional|suma|aporte|contribuc|snr|no\s*rem)/i.test(name.trim());
}

// slug crudo para conceptos que no mapean a una categoría del convenio
function rawSlug(name: string): string {
  return name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'concepto';
}

// Resuelve el categoryKey: normaliza categorías reales, deja crudos los adicionales para evitar colisiones.
// Para adicionales SIEMPRE deriva del nombre (no confía en proposedKey, que puede coincidir por error
// con una categoría real vía fuzzy matching y causar colisión).
function resolveCategoryKey(calculatorKey: string, categoryName: string, proposedKey?: string | null): string {
  if (isAdditionalConcept(categoryName)) {
    return rawSlug(categoryName);
  }
  return categoryKeyFor(calculatorKey, categoryName, proposedKey) ?? proposedKey ?? rawSlug(categoryName);
}

const SCALE_SUPERADMIN_EMAIL = 'otifuertes2@gmail.com';

// Delay entre llamadas a Gemini para no superar el rate limit (15 RPM free tier)
const GEMINI_INTER_CALL_DELAY_MS = 4500;
// Espera tras un 429 antes de reintentar
const GEMINI_RETRY_DELAY_MS = 65000;
// Máximo reintentos por documento
const GEMINI_MAX_RETRIES = 2;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function isRateLimitError(err: unknown): boolean {
  const msg = String(err);
  return msg.includes('429') || msg.toLowerCase().includes('quota') || msg.toLowerCase().includes('rate');
}

function assertSuperAdmin(user: AuthUser) {
  if (user.role !== 'SUPERADMIN' && user.email.toLowerCase() !== SCALE_SUPERADMIN_EMAIL) {
    throw new HttpError(403, 'Solo el super admin puede realizar esta acción.');
  }
}

function assertAdmin(user: AuthUser) {
  if (!['SUPERADMIN', 'ADMIN'].includes(user.role) && user.email.toLowerCase() !== SCALE_SUPERADMIN_EMAIL) {
    throw new HttpError(403, 'Se requiere rol de Admin o superior.');
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// SCALE SOURCES
// ──────────────────────────────────────────────────────────────────────────────

export async function listScaleSources() {
  return prisma.salaryScaleSource.findMany({
    orderBy: { createdAt: 'asc' },
    include: {
      _count: { select: { candidates: true, monitorRuns: true } },
    },
  });
}

export async function createScaleSource(
  user: AuthUser,
  data: {
    conventionId: string;
    calculatorKey: string;
    name: string;
    url: string;
    sourceType: ScaleSourceType;
    enabled: boolean;
    checkFrequency: number;
  },
) {
  assertAdmin(user);
  const source = await prisma.salaryScaleSource.create({ data });
  await logAudit({ userId: user.id, entity: 'SalaryScaleSource', entityId: source.id, action: 'CREATED', newValue: source });
  return source;
}

export async function updateScaleSource(user: AuthUser, id: string, data: Partial<{ name: string; url: string; sourceType: ScaleSourceType; enabled: boolean; checkFrequency: number }>) {
  assertAdmin(user);
  const source = await prisma.salaryScaleSource.update({ where: { id }, data });
  await logAudit({ userId: user.id, entity: 'SalaryScaleSource', entityId: id, action: 'UPDATED', newValue: data });
  return source;
}

export async function deleteScaleSource(user: AuthUser, id: string) {
  assertSuperAdmin(user);
  await prisma.salaryScaleSource.delete({ where: { id } });
  await logAudit({ userId: user.id, entity: 'SalaryScaleSource', entityId: id, action: 'DELETED' });
}

// ──────────────────────────────────────────────────────────────────────────────
// CCT NORMATIVE SOURCES
// ──────────────────────────────────────────────────────────────────────────────

export async function listCctSources() {
  return prisma.cctNormativeSource.findMany({ orderBy: { createdAt: 'asc' } });
}

export async function createCctSource(user: AuthUser, data: { conventionId: string; calculatorKey: string; name: string; url: string; enabled: boolean }) {
  assertAdmin(user);
  return prisma.cctNormativeSource.create({ data });
}

export async function updateCctSource(user: AuthUser, id: string, data: Partial<{ name: string; url: string; enabled: boolean }>) {
  assertAdmin(user);
  return prisma.cctNormativeSource.update({ where: { id }, data });
}

// ──────────────────────────────────────────────────────────────────────────────
// MONITOR RUN — single source
// ──────────────────────────────────────────────────────────────────────────────

export async function runSourceMonitor(sourceId: string, triggeredBy?: string): Promise<{ runId: string; found: number; error?: string }> {
  const source = await prisma.salaryScaleSource.findUnique({ where: { id: sourceId } });
  if (!source) throw new HttpError(404, 'Fuente no encontrada');

  const run = await prisma.salaryScaleMonitorRun.create({
    data: { sourceId, status: 'RUNNING', checkedAt: new Date() },
  });

  await logAudit({ userId: triggeredBy ?? null, entity: 'SalaryScaleMonitorRun', entityId: run.id, action: 'STARTED', newValue: { sourceId, sourceName: source.name } });

  try {
    await prisma.salaryScaleSource.update({ where: { id: sourceId }, data: { lastCheckedAt: new Date() } });

    let docs: DetectedDocument[] = [];
    let errorMsg: string | undefined;

    try {
      docs = await detectDocumentsFromPage(source.url);
    } catch (err) {
      errorMsg = String(err);
    }

    // ── Selección del documento correcto ──────────────────────────────────────
    //
    // 1. FILTRAR por convenio: una página puede tener varios convenios (ej: CEC Mendoza
    //    publica Comercio + Servicios de Contacto + Turismo). Descartar los de OTRO convenio.
    // 2. Ordenar por período desc → el primero es el más nuevo DEL CONVENIO ESPERADO.
    // 3. Si ya está en el sistema (hash) → nada que hacer.
    // 4. Si es nuevo → descargar y procesar.

    const classified = docs.map((d) => ({ doc: d, conv: classifyDocumentConvention(`${d.title} ${d.url}`, source.calculatorKey) }));
    const otherConvCount = classified.filter((c) => c.conv === 'other').length;
    // Quedarse con los que coinciden con el convenio; si ninguno coincide explícitamente,
    // usar los 'unknown' (no se pudo determinar) pero NUNCA los 'other' (claramente otro convenio).
    const matched = classified.filter((c) => c.conv === 'match').map((c) => c.doc);
    const unknown = classified.filter((c) => c.conv === 'unknown').map((c) => c.doc);
    const eligibleDocs = matched.length > 0 ? matched : unknown;

    if (otherConvCount > 0) {
      console.log(`[ScaleMonitor] Fuente "${source.name}": ${otherConvCount} documento(s) de otro convenio descartado(s). Elegibles: ${eligibleDocs.length}.`);
    }

    const docsWithPeriod = eligibleDocs
      .filter((d) => d.detectedPeriod)
      .sort((a, b) => {
        const pa = a.detectedPeriod!;
        const pb = b.detectedPeriod!;
        return pb.year !== pa.year ? pb.year - pa.year : pb.month - pa.month;
      });

    // Candidato principal: el doc del convenio esperado con período más reciente
    const candidate0 = docsWithPeriod[0] ?? eligibleDocs[0];

    if (!candidate0) {
      console.log(`[ScaleMonitor] Fuente "${source.name}": no se detectaron documentos en la página.`);
    } else {
      console.log(`[ScaleMonitor] Fuente "${source.name}": documento más reciente detectado: "${candidate0.title}" (${candidate0.detectedPeriod ? `${candidate0.detectedPeriod.month}/${candidate0.detectedPeriod.year}` : 'sin período'})`);
    }

    const prioritized = candidate0 ? [candidate0] : [];

    // Hashes ya procesados: si el PDF exacto (mismo hash) ya fue procesado,
    // significa que ya extrajimos todos sus meses → no hace falta reprocesar.
    // Esto es clave para PDFs multi-mes (Farmacia): el archivo no cambia entre corridas.
    const knownHashes = await prisma.salaryScaleCandidate
      .findMany({ where: { calculatorKey: source.calculatorKey, fileHash: { not: null } }, select: { fileHash: true } })
      .then((rows) => new Set(rows.map((r) => r.fileHash as string)));

    let newCount = 0;
    let aiCallsMade = 0;

    for (const doc of prioritized) {
      try {
        const { text, hash, contentType } = await downloadAndExtractText(doc.url);
        if (knownHashes.has(hash)) {
          console.log(`[ScaleMonitor] "${doc.title}": este PDF exacto ya fue procesado (hash conocido). Nada nuevo.`);
          continue;
        }
        knownHashes.add(hash);

        const urlPeriod = doc.detectedPeriod ?? extractPeriodFromText(doc.url + ' ' + doc.title);

        // Crear candidato base (será el mes más reciente; triggerAiExtraction crea los demás meses)
        const candidate = await prisma.salaryScaleCandidate.create({
          data: {
            conventionId: source.conventionId,
            calculatorKey: source.calculatorKey,
            sourceId: source.id,
            sourceName: source.name,
            sourceUrl: source.url,
            documentUrl: doc.url,
            fileName: doc.url.split('/').pop() ?? 'documento',
            fileHash: hash,
            title: doc.title,
            status: 'DETECTED',
            periodMonth: urlPeriod?.month ?? undefined,
            periodYear: urlPeriod?.year ?? undefined,
            extractedText: text.slice(0, 50000),
            extractedDataJson: { contentType, detectedAt: new Date().toISOString() },
          },
        });

        if (text.length > 100) {
          await triggerAiExtraction(candidate.id, source.calculatorKey, source.conventionId, text);
          aiCallsMade++;
        }

        newCount++;
        await logAudit({ userId: triggeredBy ?? null, entity: 'SalaryScaleCandidate', entityId: candidate.id, action: 'DETECTED', newValue: { url: doc.url, hash } });
      } catch {
        // skip individual doc errors
      }
    }

    await prisma.salaryScaleMonitorRun.update({
      where: { id: run.id },
      data: {
        status: errorMsg ? 'FAILED' : 'SUCCESS',
        foundDocumentsCount: newCount,
        errorMessage: errorMsg ?? null,
        rawResultJson: {
          totalDetected: docs.length,
          mostRecentDetected: candidate0 ? { title: candidate0.title, period: candidate0.detectedPeriod } : null,
          processed: prioritized.map((d) => ({ url: d.url, title: d.title, period: d.detectedPeriod })),
        },
      },
    });

    await prisma.salaryScaleSource.update({
      where: { id: sourceId },
      data: errorMsg ? { lastError: errorMsg } : { lastSuccessAt: new Date(), lastError: null },
    });

    return { runId: run.id, found: newCount, error: errorMsg };
  } catch (err) {
    const errorMsg = String(err);
    await prisma.salaryScaleMonitorRun.update({ where: { id: run.id }, data: { status: 'FAILED', errorMessage: errorMsg } });
    await prisma.salaryScaleSource.update({ where: { id: sourceId }, data: { lastError: errorMsg } });
    throw err;
  }
}

export async function runAllMonitors(triggeredBy?: string) {
  const sources = await prisma.salaryScaleSource.findMany({ where: { enabled: true } });
  const results: Array<{ sourceId: string; sourceName: string; found: number; error?: string }> = [];

  for (const source of sources) {
    const shouldRun = !source.lastCheckedAt || Date.now() - source.lastCheckedAt.getTime() >= source.checkFrequency * 3600000;
    if (!shouldRun) continue;
    try {
      const result = await runSourceMonitor(source.id, triggeredBy);
      results.push({ sourceId: source.id, sourceName: source.name, found: result.found });
    } catch (err) {
      results.push({ sourceId: source.id, sourceName: source.name, found: 0, error: String(err) });
    }
  }
  return results;
}

const CONVENTION_NAMES: Record<string, string> = {
  camioneros: 'Camioneros CCT 40/89',
  metalurgicos: 'Metalúrgicos CCT 260/75',
  comercio: 'Comercio CCT 130/75',
  uocra: 'UOCRA CCT 76/75',
  gastronomia: 'Gastronomía FEHGRA CCT 389/04',
  farmacia: 'Farmacia Mendoza CCT 429/05',
};

// Mes preferido: el mes ACTUAL. Es el que idealmente queremos cargar.
function minProcessablePeriod(): { month: number; year: number } {
  const now = new Date();
  return { month: now.getMonth() + 1, year: now.getFullYear() }; // getMonth() es 0-11 → +1 = mes actual
}

// Piso de EXTRACCIÓN: más amplio (3 meses atrás) para que la IA también lea la escala más reciente
// disponible aunque sea de un mes anterior (ej: Camioneros publica la planilla mensual con retraso).
function extractionFloorPeriod(): { month: number; year: number } {
  const now = new Date();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 3, 1));
  return { month: d.getUTCMonth() + 1, year: d.getUTCFullYear() };
}

// Filtra los períodos extraídos: prefiere el mes actual en adelante; si no hay ninguno,
// devuelve solo el MÁS RECIENTE disponible (no descarta todo cuando la escala es de un mes anterior).
function selectRelevantPeriods(periods: ExtractionResult[], preferred: { month: number; year: number }): ExtractionResult[] {
  const sorted = [...periods].sort((a, b) => (b.periodYear! - a.periodYear!) || (b.periodMonth! - a.periodMonth!));
  const currentOrFuture = sorted.filter(
    (p) => (p.periodYear! > preferred.year) || (p.periodYear === preferred.year && p.periodMonth! >= preferred.month),
  );
  if (currentOrFuture.length > 0) return currentOrFuture;
  return sorted.length > 0 ? [sorted[0]] : [];
}

// Verifica si un período ya está activo en el sistema (aprobado o pendiente)
async function periodAlreadyActive(calculatorKey: string, month: number, year: number): Promise<{ id: string; status: string } | null> {
  const v = await prisma.salaryScaleVersion.findFirst({
    where: { calculatorKey, periodMonth: month, periodYear: year, status: { in: ['APROBADA', 'PENDIENTE_REVISION'] } },
    select: { id: true, status: true },
  });
  if (v) return v;
  const c = await prisma.salaryScaleCandidate.findFirst({
    where: { calculatorKey, periodMonth: month, periodYear: year, status: { in: ['PENDING_REVIEW', 'EXTRACTED', 'APPROVED'] } },
    select: { id: true, status: true },
  });
  return c;
}

// Construye el diff de un período contra la última versión aprobada
async function buildDiff(calculatorKey: string, result: ExtractionResult): Promise<{ diffJson: unknown; previousVersionId: string | null }> {
  const previousVersion = await prisma.salaryScaleVersion.findFirst({
    where: { calculatorKey, status: 'APROBADA' },
    orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }],
    include: { items: true },
  });
  if (!previousVersion || result.categories.length === 0) {
    return { diffJson: {}, previousVersionId: previousVersion?.id ?? null };
  }
  const prevCats: ExtractedCategory[] = previousVersion.items.map((item) => ({
    categoryKey: item.categoryKey ?? undefined,
    categoryName: item.categoryName,
    baseSalary: item.baseSalary ? Number(item.baseSalary) : null,
    nonRemunerativeAmount: item.nonRemunerativeAmount ? Number(item.nonRemunerativeAmount) : null,
    hourlyRate: item.hourlyWage ? Number(item.hourlyWage) : null,
  }));
  const prevPeriod = `${previousVersion.periodYear}-${String(previousVersion.periodMonth).padStart(2, '0')}`;
  const newPeriod = `${result.periodYear}-${String(result.periodMonth).padStart(2, '0')}`;
  return { diffJson: compareScaleVersions(prevCats, result.categories, prevPeriod, newPeriod), previousVersionId: previousVersion.id };
}

// Aplica fallback de Contribución Extraordinaria para Farmacia
function applyFarmaciaFallback(calculatorKey: string, result: ExtractionResult, text: string) {
  // Complemento por regex específico de cada convenio: extrae del rawText los valores CCT
  // que la IA no capturó (ej: Camioneros tiene comida/viático/permanencia/km en formato "ITEM 4.1.x").
  // Los valores de la IA se conservan; los del regex completan los que falten.
  try {
    const derived = extractCctValues(calculatorKey, text, result.periodMonth ?? undefined, result.periodYear ?? undefined);
    let added = 0;
    for (const [key, value] of Object.entries(derived)) {
      if (typeof value === 'number' && Number.isFinite(value) && value > 0 && result.cctValues[key] === undefined) {
        result.cctValues[key] = value;
        added++;
      }
    }
    if (added > 0) result.warnings.push(`${added} valor(es) CCT completados desde el texto del documento.`);
  } catch { /* el extractor regex es best-effort */ }

  // Fallback puntual de Farmacia (tabla de contribución al pie)
  if (calculatorKey === 'farmacia' && result.periodMonth && !result.cctValues.contribucionExtraordinaria) {
    const v = extractFarmaciaContribucionFallback(text, result.periodMonth, result.periodYear ?? new Date().getFullYear());
    if (v) {
      result.cctValues.contribucionExtraordinaria = v;
      result.warnings.push('Contribución Extraordinaria extraída por fallback regex.');
    }
  }
}

/**
 * Extrae la escala de un PDF y crea/actualiza candidatos por CADA mes no liquidado.
 * - El candidato base (candidateId) se usa para el mes MÁS RECIENTE.
 * - Los demás meses generan candidatos adicionales.
 * - Saltea meses ya aprobados/pendientes y meses históricos (anteriores al mes pasado).
 */
async function triggerAiExtraction(candidateId: string, calculatorKey: string, conventionId: string, text: string) {
  const conventionName = CONVENTION_NAMES[calculatorKey] ?? conventionId;
  const baseCandidate = await prisma.salaryScaleCandidate.findUnique({ where: { id: candidateId } });
  const preferred = minProcessablePeriod();          // mes actual (preferido)
  const { month: minMonth, year: minYear } = extractionFloorPeriod(); // piso amplio para la IA

  // VALIDACIÓN PREVIA (sin IA): si el texto del PDF declara otro número de CCT, rechazar sin gastar Gemini.
  const cctCheck = documentMatchesConvention(text, calculatorKey);
  if (!cctCheck.match) {
    console.warn(`[ScaleMonitor] Candidato ${candidateId}: el PDF declara "${cctCheck.detected}", no ${conventionName}. RECHAZADO (sin IA).`);
    await prisma.salaryScaleCandidate.update({
      where: { id: candidateId },
      data: {
        status: 'REJECTED',
        reviewNotes: `Descartado automáticamente: el documento es de "${cctCheck.detected}", no de ${conventionName}. Revisá la URL de la fuente.`,
        extractedDataJson: JSON.parse(JSON.stringify({ error: `Convenio incorrecto. Esperado: ${conventionName}. Detectado: ${cctCheck.detected}.`, detectedConvention: cctCheck.detected })) as Prisma.InputJsonValue,
      },
    });
    return;
  }

  for (let attempt = 0; attempt < GEMINI_MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`[ScaleMonitor] Reintentando extracción IA (intento ${attempt + 1}) para candidato ${candidateId}...`);
        await sleep(GEMINI_RETRY_DELAY_MS);
      }

      // Extraer TODOS los períodos del PDF desde el mes mínimo en adelante
      const extraction = await extractScalePeriods(calculatorKey, conventionName, text, minMonth, minYear);

      // VALIDACIÓN DE CONVENIO: si el documento es de otro convenio, descartar con aviso claro
      if (!extraction.conventionMatch) {
        const detected = extraction.detectedConvention ?? 'otro convenio';
        console.warn(`[ScaleMonitor] Candidato ${candidateId}: el documento NO es de ${conventionName}, es de "${detected}". Marcando RECHAZADO.`);
        await prisma.salaryScaleCandidate.update({
          where: { id: candidateId },
          data: {
            status: 'REJECTED',
            reviewNotes: `Descartado automáticamente: el documento es de "${detected}", no de ${conventionName}. Revisá la URL de la fuente.`,
            extractedDataJson: JSON.parse(JSON.stringify({
              error: `Convenio incorrecto. Esperado: ${conventionName}. Detectado: ${detected}.`,
              detectedConvention: detected,
            })) as Prisma.InputJsonValue,
          },
        });
        return;
      }

      // Preferir mes actual en adelante; si no hay, tomar el más reciente disponible (ej: Camioneros mayo)
      const periods = selectRelevantPeriods(extraction.periods, preferred);

      if (periods.length === 0) {
        // La IA no devolvió ningún período válido → dejar candidato como detectado sin datos
        await prisma.salaryScaleCandidate.update({
          where: { id: candidateId },
          data: {
            status: 'DETECTED',
            extractedDataJson: JSON.parse(JSON.stringify({
              error: 'La IA no pudo extraer ningún período válido del documento. Revisá manualmente.',
              lastAttempt: new Date().toISOString(),
            })) as Prisma.InputJsonValue,
          },
        });
        return;
      }

      // periods viene ordenado de más reciente a más antiguo
      let usedBaseCandidate = false;
      let createdCount = 0;

      for (const result of periods) {
        if (!result.periodMonth || !result.periodYear) continue;

        // Saltear si ese período ya está activo en el sistema
        const active = await periodAlreadyActive(calculatorKey, result.periodMonth, result.periodYear);
        if (active) {
          console.log(`[ScaleMonitor] ${result.periodMonth}/${result.periodYear} ya activo (${active.status}). Saltando.`);
          continue;
        }

        applyFarmaciaFallback(calculatorKey, result, text);
        const { diffJson, previousVersionId } = await buildDiff(calculatorKey, result);

        const dataJson = JSON.parse(JSON.stringify({
          categories: result.categories,
          cctValues: result.cctValues,
          warnings: result.warnings,
          sourceEvidence: result.sourceEvidence,
          previousVersionId,
        })) as Prisma.InputJsonValue;
        const diffSerialized = JSON.parse(JSON.stringify(diffJson)) as Prisma.InputJsonValue;

        if (!usedBaseCandidate) {
          // El mes más reciente reutiliza el candidato base ya creado
          await prisma.salaryScaleCandidate.update({
            where: { id: candidateId },
            data: {
              status: 'PENDING_REVIEW',
              periodMonth: result.periodMonth,
              periodYear: result.periodYear,
              aiConfidence: result.confidence,
              extractedDataJson: dataJson,
              diffJson: diffSerialized,
              previousVersionId,
            },
          });
          usedBaseCandidate = true;
        } else {
          // Meses adicionales: crear candidatos nuevos clonando metadatos del base
          await prisma.salaryScaleCandidate.create({
            data: {
              conventionId: baseCandidate?.conventionId ?? conventionId,
              calculatorKey,
              sourceId: baseCandidate?.sourceId ?? null,
              sourceName: baseCandidate?.sourceName ?? conventionName,
              sourceUrl: baseCandidate?.sourceUrl ?? null,
              documentUrl: baseCandidate?.documentUrl ?? null,
              fileName: baseCandidate?.fileName ?? null,
              fileHash: baseCandidate?.fileHash ?? null,
              title: `${baseCandidate?.title ?? conventionName} (${result.periodMonth}/${result.periodYear})`,
              status: 'PENDING_REVIEW',
              periodMonth: result.periodMonth,
              periodYear: result.periodYear,
              aiConfidence: result.confidence,
              extractedText: baseCandidate?.extractedText ?? null,
              extractedDataJson: dataJson,
              diffJson: diffSerialized,
              previousVersionId,
            },
          });
          createdCount++;
        }
      }

      if (!usedBaseCandidate) {
        // Todos los períodos ya estaban en el sistema → marcar el base como ignorado
        await prisma.salaryScaleCandidate.update({
          where: { id: candidateId },
          data: {
            status: 'IGNORED',
            extractedDataJson: JSON.parse(JSON.stringify({ ignoredReason: 'Todos los períodos del documento ya están en el sistema.' })) as Prisma.InputJsonValue,
          },
        });
      } else if (createdCount > 0) {
        console.log(`[ScaleMonitor] Documento multi-mes: 1 candidato base + ${createdCount} mes(es) adicional(es) creados.`);
      }

      return;
    } catch (err) {
      if (isRateLimitError(err) && attempt < GEMINI_MAX_RETRIES - 1) {
        console.warn(`[ScaleMonitor] Rate limit Gemini (429) para candidato ${candidateId}. Esperando ${GEMINI_RETRY_DELAY_MS / 1000}s antes de reintentar...`);
        continue;
      }
      const errorMsg = isRateLimitError(err)
        ? 'Límite de Gemini alcanzado (429). Usá "Re-analizar con pIA" cuando la cuota se recupere.'
        : String(err);
      await prisma.salaryScaleCandidate.update({
        where: { id: candidateId },
        data: {
          status: 'DETECTED',
          extractedDataJson: JSON.parse(JSON.stringify({ error: errorMsg, lastAttempt: new Date().toISOString() })) as Prisma.InputJsonValue,
        },
      });
      return;
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// DEDUP: limpiar candidatos duplicados (mismo hash, mismo convenio)
// ──────────────────────────────────────────────────────────────────────────────

export async function deduplicateCandidates(user: AuthUser): Promise<{ removed: number }> {
  assertAdmin(user);

  // Para cada hash duplicado, conservar el más reciente (mayor id lexicográfico o mayor createdAt)
  // y marcar como IGNORED los anteriores
  const duplicates = await prisma.$queryRaw<Array<{ fileHash: string; calculatorKey: string; ids: string[] }>>`
    SELECT "fileHash", "calculatorKey", array_agg(id ORDER BY "createdAt" DESC) as ids
    FROM "SalaryScaleCandidate"
    WHERE "fileHash" IS NOT NULL
      AND status NOT IN ('APPROVED', 'REJECTED')
    GROUP BY "fileHash", "calculatorKey"
    HAVING count(*) > 1
  `;

  let removed = 0;
  for (const dup of duplicates) {
    const toIgnore = (dup.ids as string[]).slice(1); // conservar el primero (más reciente)
    if (toIgnore.length) {
      await prisma.salaryScaleCandidate.updateMany({
        where: { id: { in: toIgnore } },
        data: { status: 'IGNORED' },
      });
      removed += toIgnore.length;
    }
  }

  return { removed };
}

// ──────────────────────────────────────────────────────────────────────────────
// PURGE: eliminar rechazados, ignorados y los que tienen error de IA
// ──────────────────────────────────────────────────────────────────────────────

export async function purgeCandidates(user: AuthUser, target: 'rejected' | 'errors' | 'pending' | 'all'): Promise<{ removed: number }> {
  assertAdmin(user);

  let count = 0;

  if (target === 'rejected' || target === 'all') {
    const { count: n } = await prisma.salaryScaleCandidate.deleteMany({
      where: { status: { in: ['REJECTED', 'IGNORED'] } },
    });
    count += n;
  }

  if (target === 'pending' || target === 'all') {
    // Candidatos pendientes o detectados (sin aprobar)
    const { count: n } = await prisma.salaryScaleCandidate.deleteMany({
      where: { status: { in: ['PENDING_REVIEW', 'EXTRACTED', 'DETECTED'] } },
    });
    count += n;
  }

  if (target === 'errors' || target === 'all') {
    // Candidatos DETECTED con error en extractedDataJson (por si quedaron tras el step anterior)
    const withError = await prisma.salaryScaleCandidate.findMany({
      where: { status: 'DETECTED' },
      select: { id: true, extractedDataJson: true },
    });
    const errorIds = withError
      .filter((c) => {
        const data = c.extractedDataJson as Record<string, unknown>;
        return typeof data?.error === 'string' && data.error.length > 0;
      })
      .map((c) => c.id);

    if (errorIds.length) {
      const { count: n } = await prisma.salaryScaleCandidate.deleteMany({
        where: { id: { in: errorIds } },
      });
      count += n;
    }
  }

  return { removed: count };
}

// ──────────────────────────────────────────────────────────────────────────────
// CANDIDATES
// ──────────────────────────────────────────────────────────────────────────────

export async function listCandidates(query: {
  calculatorKey?: string;
  status?: ScaleCandidateStatus;
  periodMonth?: number;
  periodYear?: number;
  page: number;
  limit: number;
}) {
  const where = {
    ...(query.calculatorKey ? { calculatorKey: query.calculatorKey } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.periodMonth ? { periodMonth: query.periodMonth } : {}),
    ...(query.periodYear ? { periodYear: query.periodYear } : {}),
  };
  const [total, items] = await Promise.all([
    prisma.salaryScaleCandidate.count({ where }),
    prisma.salaryScaleCandidate.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      include: {
        reviewedBy: { select: { id: true, name: true, email: true } },
        source: { select: { id: true, name: true, sourceType: true } },
      },
    }),
  ]);
  return { total, page: query.page, limit: query.limit, items };
}

export async function getCandidate(id: string) {
  const candidate = await prisma.salaryScaleCandidate.findUnique({
    where: { id },
    include: {
      reviewedBy: { select: { id: true, name: true, email: true } },
      source: true,
    },
  });
  if (!candidate) throw new HttpError(404, 'Candidato no encontrado');
  return candidate;
}

export async function approveCandidate(user: AuthUser, id: string, notes?: string, overrideLowConfidence = false) {
  assertSuperAdmin(user);

  const candidate = await prisma.salaryScaleCandidate.findUnique({ where: { id } });
  if (!candidate) throw new HttpError(404, 'Candidato no encontrado');
  if (candidate.status === 'APPROVED') throw new HttpError(400, 'Ya está aprobado');
  if (candidate.status === 'REJECTED') throw new HttpError(400, 'Fue rechazado previamente');

  const data = candidate.extractedDataJson as Record<string, unknown>;
  const categories = (data.categories as ExtractedCategory[]) ?? [];

  if (categories.length === 0) throw new HttpError(400, 'No se puede aprobar una escala sin categorías detectadas.');

  const hasCriticalNull = categories.some((c) => c.baseSalary === null && c.hourlyRate === null);
  if (hasCriticalNull && !overrideLowConfidence) {
    throw new HttpError(400, 'Hay categorías sin ningún valor salarial. Confirmá explícitamente para aprobar.');
  }

  if (candidate.aiConfidence < 60 && !overrideLowConfidence) {
    throw new HttpError(400, `Confianza IA baja (${candidate.aiConfidence}%). Confirmá explícitamente para aprobar.`);
  }

  const periodMonth = candidate.periodMonth ?? new Date().getMonth() + 1;
  const periodYear = candidate.periodYear ?? new Date().getFullYear();

  await prisma.$transaction(async (tx) => {
    await tx.salaryScaleVersion.updateMany({
      where: { calculatorKey: candidate.calculatorKey, periodMonth, periodYear, status: 'APROBADA' },
      data: { status: 'ARCHIVADA' },
    });

    const newVersion = await tx.salaryScaleVersion.create({
      data: {
        conventionId: candidate.conventionId,
        calculatorKey: candidate.calculatorKey,
        conventionName: candidate.sourceName,
        periodMonth,
        periodYear,
        // UTC para que getApprovedSalaryScale lo encuentre al liquidar (mismo criterio que monthStart)
        validFrom: periodStartUtc(periodMonth, periodYear),
        status: 'APROBADA',
        sourceLabel: candidate.sourceName,
        sourceUrl: candidate.documentUrl ?? candidate.sourceUrl ?? undefined,
        sourceFileName: candidate.fileName ?? undefined,
        rawText: candidate.extractedText ?? undefined,
        // Sin humanEdited: para comercio/farmacia, withCctValues re-deriva los cctValues del rawText
        // generando los keys específicos que las calculadoras esperan (contribucionExtraordinaria, etc.).
        // Los cctValues de la IA quedan como base y la re-derivación los completa.
        extractedByIAJson: JSON.parse(JSON.stringify({ ...(data as object), approvedFrom: 'scale_monitor', candidateId: id })) as Prisma.InputJsonValue,
        confidenceScore: candidate.aiConfidence,
        createdById: user.id,
        reviewedById: user.id,
        reviewedAt: new Date(),
        reviewNote: notes ?? null,
        items: {
          // Normalizar categoryKey al key canónico que esperan las calculadoras (maestranza_a, cajero_b, etc.).
          // Los ADICIONALES (Adic. Título, Adic. Bloqueo, etc.) NO son categorías del convenio:
          // se dejan con su key crudo para que no colisionen con una categoría real por fuzzy matching.
          create: categories.map((c) => ({
            categoryKey: resolveCategoryKey(candidate.calculatorKey, c.categoryName, c.categoryKey),
            categoryName: c.categoryName,
            baseSalary: c.baseSalary ?? undefined,
            hourlyWage: c.hourlyRate ?? undefined,
            nonRemunerativeAmount: c.nonRemunerativeAmount ?? undefined,
            additionalJson: JSON.parse(JSON.stringify(c.extraFields ?? {})) as Prisma.InputJsonValue,
          })),
        },
      },
    });

    await tx.salaryScaleCandidate.update({
      where: { id },
      data: { status: 'APPROVED', reviewedById: user.id, reviewedAt: new Date(), reviewNotes: notes ?? null },
    });

    return newVersion;
  });

  await logAudit({ userId: user.id, entity: 'SalaryScaleCandidate', entityId: id, action: 'APPROVED', newValue: { notes, periodMonth, periodYear } });
}

export async function rejectCandidate(user: AuthUser, id: string, notes?: string) {
  assertSuperAdmin(user);
  const candidate = await prisma.salaryScaleCandidate.findUnique({ where: { id } });
  if (!candidate) throw new HttpError(404, 'Candidato no encontrado');
  if (candidate.status === 'APPROVED') throw new HttpError(400, 'No se puede rechazar una escala aprobada.');

  await prisma.salaryScaleCandidate.update({
    where: { id },
    data: { status: 'REJECTED', reviewedById: user.id, reviewedAt: new Date(), reviewNotes: notes ?? null },
  });

  await logAudit({ userId: user.id, entity: 'SalaryScaleCandidate', entityId: id, action: 'REJECTED', newValue: { notes } });
}

export async function retriggerExtraction(user: AuthUser, id: string) {
  assertAdmin(user);
  const candidate = await prisma.salaryScaleCandidate.findUnique({ where: { id } });
  if (!candidate) throw new HttpError(404, 'Candidato no encontrado');
  if (!candidate.extractedText) throw new HttpError(400, 'No hay texto extraído para re-analizar.');

  if (candidate.periodMonth && candidate.periodYear) {
    // El candidato ya tiene un mes asignado: re-extraer SOLO ese mes (sin crear otros ni auto-bloquearse)
    await reExtractSingleCandidate(candidate.id, candidate.calculatorKey, candidate.conventionId, candidate.extractedText, candidate.periodMonth, candidate.periodYear);
  } else {
    // Candidato sin mes (falló la primera extracción): correr el flujo multi-mes
    await triggerAiExtraction(id, candidate.calculatorKey, candidate.conventionId, candidate.extractedText);
  }
  return prisma.salaryScaleCandidate.findUnique({ where: { id } });
}

// ──────────────────────────────────────────────────────────────────────────────
// CARGA MANUAL: subir un PDF y que entre al mismo flujo de candidatos que el scraping
// ──────────────────────────────────────────────────────────────────────────────

const CONVENTION_IDS: Record<string, string> = {
  camioneros: 'camioneros_cct_40_89',
  metalurgicos: 'metalurgicos_cct_260_75',
  comercio: 'comercio_cct_130_75',
  uocra: 'uocra_cct_76_75',
  gastronomia: 'gastronomia_cct_389_04',
  farmacia: 'farmacia_mendoza',
};

export async function uploadManualScale(
  user: AuthUser,
  calculatorKey: string,
  file: Express.Multer.File,
): Promise<{ candidateId: string; createdCount: number }> {
  assertAdmin(user);
  if (!file) throw new HttpError(400, 'No se recibió ningún archivo.');
  if (!CONVENTION_NAMES[calculatorKey]) throw new HttpError(400, 'Convenio no válido.');

  const { extractTextFromBuffer } = await import('./scale-extraction.service');
  const { text, hash } = await extractTextFromBuffer(file.buffer, file.originalname);

  if (!text || text.length < 50) {
    throw new HttpError(422, 'No se pudo leer texto del PDF. Puede ser una imagen escaneada sin texto. Cargá un PDF con texto seleccionable.');
  }

  // Si este PDF exacto ya fue cargado, reusar el candidato base existente (re-procesar)
  const existing = await prisma.salaryScaleCandidate.findFirst({
    where: { calculatorKey, fileHash: hash, status: { in: ['DETECTED', 'PENDING_REVIEW', 'EXTRACTED'] } },
    orderBy: { createdAt: 'desc' },
  });

  let candidateId: string;
  if (existing) {
    candidateId = existing.id;
  } else {
    const candidate = await prisma.salaryScaleCandidate.create({
      data: {
        conventionId: CONVENTION_IDS[calculatorKey] ?? calculatorKey,
        calculatorKey,
        sourceId: null,
        sourceName: 'Carga manual',
        sourceUrl: null,
        documentUrl: null,
        fileName: file.originalname,
        fileHash: hash,
        title: `Carga manual — ${file.originalname}`,
        status: 'DETECTED',
        extractedText: text.slice(0, 50000),
        extractedDataJson: { uploadedBy: user.email, uploadedAt: new Date().toISOString() },
      },
    });
    candidateId = candidate.id;
  }

  await logAudit({ userId: user.id, entity: 'SalaryScaleCandidate', entityId: candidateId, action: 'MANUAL_UPLOAD', newValue: { fileName: file.originalname, calculatorKey } });

  // Mismo flujo multi-mes que el scraping
  const before = await prisma.salaryScaleCandidate.count({ where: { calculatorKey, status: { in: ['PENDING_REVIEW', 'EXTRACTED'] } } });
  await triggerAiExtraction(candidateId, calculatorKey, CONVENTION_IDS[calculatorKey] ?? calculatorKey, text);
  const after = await prisma.salaryScaleCandidate.count({ where: { calculatorKey, status: { in: ['PENDING_REVIEW', 'EXTRACTED'] } } });

  return { candidateId, createdCount: Math.max(1, after - before) };
}

// Re-extrae UN período específico para un candidato existente (usado por "Re-analizar con pIA")
async function reExtractSingleCandidate(candidateId: string, calculatorKey: string, conventionId: string, text: string, month: number, year: number) {
  const conventionName = CONVENTION_NAMES[calculatorKey] ?? conventionId;
  for (let attempt = 0; attempt < GEMINI_MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) await sleep(GEMINI_RETRY_DELAY_MS);
      const extraction = await extractScalePeriods(calculatorKey, conventionName, text, month, year);

      // Validación de convenio también al re-analizar
      if (!extraction.conventionMatch) {
        const detected = extraction.detectedConvention ?? 'otro convenio';
        await prisma.salaryScaleCandidate.update({
          where: { id: candidateId },
          data: {
            status: 'REJECTED',
            reviewNotes: `Descartado: el documento es de "${detected}", no de ${conventionName}.`,
            extractedDataJson: JSON.parse(JSON.stringify({ error: `Convenio incorrecto. Detectado: ${detected}.`, detectedConvention: detected })) as Prisma.InputJsonValue,
          },
        });
        return;
      }

      const periods = extraction.periods;
      // Buscar el período exacto del candidato; si no, tomar el más cercano (más reciente)
      const result = periods.find((p) => p.periodMonth === month && p.periodYear === year) ?? periods[0];
      if (!result) {
        await prisma.salaryScaleCandidate.update({
          where: { id: candidateId },
          data: { extractedDataJson: JSON.parse(JSON.stringify({ error: 'La IA no devolvió datos para este período.' })) as Prisma.InputJsonValue },
        });
        return;
      }
      applyFarmaciaFallback(calculatorKey, result, text);
      const { diffJson, previousVersionId } = await buildDiff(calculatorKey, result);
      await prisma.salaryScaleCandidate.update({
        where: { id: candidateId },
        data: {
          status: 'PENDING_REVIEW',
          periodMonth: result.periodMonth ?? month,
          periodYear: result.periodYear ?? year,
          aiConfidence: result.confidence,
          extractedDataJson: JSON.parse(JSON.stringify({
            categories: result.categories,
            cctValues: result.cctValues,
            warnings: result.warnings,
            sourceEvidence: result.sourceEvidence,
            previousVersionId,
          })) as Prisma.InputJsonValue,
          diffJson: JSON.parse(JSON.stringify(diffJson)) as Prisma.InputJsonValue,
          previousVersionId,
        },
      });
      return;
    } catch (err) {
      if (isRateLimitError(err) && attempt < GEMINI_MAX_RETRIES - 1) continue;
      const errorMsg = isRateLimitError(err)
        ? 'Límite de Gemini alcanzado (429). Reintentá cuando la cuota se recupere.'
        : String(err);
      await prisma.salaryScaleCandidate.update({
        where: { id: candidateId },
        data: { extractedDataJson: JSON.parse(JSON.stringify({ error: errorMsg, lastAttempt: new Date().toISOString() })) as Prisma.InputJsonValue },
      });
      return;
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// SCALE VERSIONS
// ──────────────────────────────────────────────────────────────────────────────

export async function listScaleVersions(query: { calculatorKey?: string; periodYear?: number; page: number; limit: number }) {
  const where = {
    ...(query.calculatorKey ? { calculatorKey: query.calculatorKey } : {}),
    ...(query.periodYear ? { periodYear: query.periodYear } : {}),
  };
  const [total, items] = await Promise.all([
    prisma.salaryScaleVersion.count({ where }),
    prisma.salaryScaleVersion.findMany({
      where,
      orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      include: { items: true },
    }),
  ]);
  return { total, page: query.page, limit: query.limit, items };
}

export async function getScaleVersionHistory(calculatorKey: string) {
  return prisma.salaryScaleVersion.findMany({
    where: { calculatorKey },
    orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }],
    include: { items: true },
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// CCT NORMATIVE CANDIDATES
// ──────────────────────────────────────────────────────────────────────────────

export async function listCctChanges(query: {
  calculatorKey?: string;
  status?: 'DETECTED' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
  page: number;
  limit: number;
}) {
  const where = {
    ...(query.calculatorKey ? { calculatorKey: query.calculatorKey } : {}),
    ...(query.status ? { status: query.status } : {}),
  };
  const [total, items] = await Promise.all([
    prisma.cctNormativeCandidate.count({ where }),
    prisma.cctNormativeCandidate.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      include: { reviewedBy: { select: { id: true, name: true, email: true } }, source: { select: { id: true, name: true } } },
    }),
  ]);
  return { total, page: query.page, limit: query.limit, items };
}

export async function approveCctChange(user: AuthUser, id: string) {
  assertSuperAdmin(user);
  const candidate = await prisma.cctNormativeCandidate.findUnique({ where: { id } });
  if (!candidate) throw new HttpError(404, 'Cambio normativo no encontrado');
  await prisma.cctNormativeCandidate.update({ where: { id }, data: { status: 'APPROVED', reviewedById: user.id, reviewedAt: new Date() } });
  await logAudit({ userId: user.id, entity: 'CctNormativeCandidate', entityId: id, action: 'APPROVED' });
}

export async function rejectCctChange(user: AuthUser, id: string) {
  assertSuperAdmin(user);
  const candidate = await prisma.cctNormativeCandidate.findUnique({ where: { id } });
  if (!candidate) throw new HttpError(404, 'Cambio normativo no encontrado');
  await prisma.cctNormativeCandidate.update({ where: { id }, data: { status: 'REJECTED', reviewedById: user.id, reviewedAt: new Date() } });
  await logAudit({ userId: user.id, entity: 'CctNormativeCandidate', entityId: id, action: 'REJECTED' });
}

export async function runCctSourceMonitor(sourceId: string, triggeredBy?: string) {
  const source = await prisma.cctNormativeSource.findUnique({ where: { id: sourceId } });
  if (!source) throw new HttpError(404, 'Fuente CCT no encontrada');

  await prisma.cctNormativeSource.update({ where: { id: sourceId }, data: { lastCheckedAt: new Date() } });

  const docs = await detectDocumentsFromPage(source.url);
  const known = await prisma.cctNormativeCandidate
    .findMany({ where: { calculatorKey: source.calculatorKey, fileHash: { not: null } }, select: { fileHash: true } })
    .then((rows) => new Set(rows.map((r) => r.fileHash as string)));

  let newCount = 0;
  for (const doc of docs) {
    try {
      const { text, hash } = await downloadAndExtractText(doc.url);
      if (known.has(hash)) continue;
      known.add(hash);

      const prev = await prisma.cctNormativeCandidate.findFirst({
        where: { conventionId: source.conventionId, status: 'APPROVED' },
        orderBy: { createdAt: 'desc' },
      });

      const analysis = await summarizeNormativeChanges(source.name, prev?.extractedText ?? '', text);

      await prisma.cctNormativeCandidate.create({
        data: {
          conventionId: source.conventionId,
          calculatorKey: source.calculatorKey,
          sourceId: source.id,
          title: doc.title,
          documentUrl: doc.url,
          fileHash: hash,
          status: 'PENDING_REVIEW',
          extractedText: text.slice(0, 50000),
          summaryJson: JSON.parse(JSON.stringify(analysis)) as Prisma.InputJsonValue,
          riskLevel: analysis.riskLevel,
          aiConfidence: analysis.confidence,
        },
      });
      newCount++;
    } catch {
      // skip
    }
  }
  return { found: newCount };
}

// ──────────────────────────────────────────────────────────────────────────────
// MONITOR RUNS LOG
// ──────────────────────────────────────────────────────────────────────────────

export async function listMonitorRuns(sourceId?: string, limit = 20) {
  return prisma.salaryScaleMonitorRun.findMany({
    where: sourceId ? { sourceId } : undefined,
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { source: { select: { id: true, name: true, calculatorKey: true } } },
  });
}

export async function getSourceDiagnostic(sourceId: string) {
  const [source, lastRun, candidatesCount] = await Promise.all([
    prisma.salaryScaleSource.findUnique({ where: { id: sourceId } }),
    prisma.salaryScaleMonitorRun.findFirst({
      where: { sourceId },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.salaryScaleCandidate.groupBy({
      by: ['status'],
      where: { sourceId },
      _count: true,
    }),
  ]);
  if (!source) throw new HttpError(404, 'Fuente no encontrada');

  const { isGeminiConfigured } = await import('../ai/gemini.client');
  const geminiOk = isGeminiConfigured();

  return {
    source,
    lastRun,
    candidatesByStatus: Object.fromEntries(candidatesCount.map((r) => [r.status, r._count])),
    geminiConfigured: geminiOk,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// FALLBACK EXTRACTORS
// ──────────────────────────────────────────────────────────────────────────────

function normalizePdfMoney(s: string): number | null {
  // Convierte "7.479,52" → 7479.52 y "7,479.52" → 7479.52
  const clean = s.trim();
  const hasComma = clean.includes(',');
  const hasDot = clean.includes('.');
  let normalized = clean;
  if (hasComma && hasDot) {
    const lastComma = clean.lastIndexOf(',');
    const lastDot = clean.lastIndexOf('.');
    if (lastComma > lastDot) normalized = clean.replace(/\./g, '').replace(',', '.');
    else normalized = clean.replace(/,/g, '');
  } else if (hasComma) {
    normalized = clean.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(clean)) {
    normalized = clean.replace(/\./g, '');
  }
  const n = Number(normalized);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// Meses cortos en español para mapeo de columnas
const SHORT_MONTHS: Record<string, number> = {
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6,
  jul: 7, ago: 8, sep: 9, oct: 10, nov: 11, dic: 12,
};

function extractFarmaciaContribucionFallback(rawText: string, periodMonth: number, periodYear: number): number | null {
  // El PDF de Farmacia tiene una fila así al pie:
  // "Contribución Extraordinaria  oct-25  nov-25  dic-25  ene-26  feb-26  mar-26  abr-26  may-26  jun-26"
  // "  $ 6.125,00  $ 6.370,00  $ 6.492,50  $ 7.044,36  $ 7.206,68  $ 7.368,99  $ 7.479,52  $ 7.626,90  $ 7.774,28"

  const text = rawText.replace(/\r/g, '\n');
  const idx = text.search(/contribuci[oó]n\s+extraordinaria/i);
  if (idx < 0) return null;

  // Tomar los ~600 chars después del marcador
  const section = text.slice(idx, idx + 600);

  // Extraer los headers de mes (ej: "abr-26", "abr/26", "abr 26")
  const headerPattern = /\b(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)[\s\-\/](\d{2})\b/gi;
  const headers: Array<{ month: number; year: number; index: number }> = [];
  let hm: RegExpExecArray | null;
  while ((hm = headerPattern.exec(section)) !== null) {
    const mo = SHORT_MONTHS[hm[1].toLowerCase()];
    const yr = 2000 + Number(hm[2]);
    if (mo && yr >= 2020 && yr <= 2035) headers.push({ month: mo, year: yr, index: hm.index });
  }
  if (headers.length === 0) return null;

  // Extraer todos los montos que siguen a los headers
  const afterHeaders = section.slice(headers[0].index);
  const moneyPattern = /\$?\s*([\d.,]+)/g;
  const amounts: number[] = [];
  let mm: RegExpExecArray | null;
  while ((mm = moneyPattern.exec(afterHeaders)) !== null) {
    const val = normalizePdfMoney(mm[1]);
    if (val !== null && val > 100) amounts.push(val);
    if (amounts.length >= headers.length + 2) break;
  }

  // Buscar la columna que corresponde al período solicitado
  const targetYear = periodYear % 100;
  const colIdx = headers.findIndex((h) => h.month === periodMonth && h.year % 100 === targetYear);
  if (colIdx >= 0 && colIdx < amounts.length) return amounts[colIdx];

  // Fallback: tomar el último monto de la fila (el más reciente)
  return amounts[amounts.length - 1] ?? null;
}
