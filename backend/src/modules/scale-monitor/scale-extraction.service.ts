import { generateGeminiText, isGeminiConfigured } from '../ai/gemini.client';
import pdfParse from 'pdf-parse';
import axios from 'axios';
import crypto from 'crypto';

export interface ExtractedCategory {
  categoryKey?: string | null;
  categoryName: string;
  baseSalary?: number | null;
  nonRemunerativeAmount?: number | null;
  hourlyRate?: number | null;
  extraFields?: Record<string, unknown>;
}

export interface ExtractedCctValues {
  presentismoPct?: number;
  antiguedadPct?: number;
  comida?: number;
  viatico?: number;
  adicionales?: Record<string, number>;
  aportes?: Record<string, number>;
  contribuciones?: Record<string, number>;
  [key: string]: unknown;
}

export interface ExtractionResult {
  periodMonth: number | null;
  periodYear: number | null;
  categories: ExtractedCategory[];
  cctValues: ExtractedCctValues;
  confidence: number;
  warnings: string[];
  sourceEvidence: string;
}

export interface ScaleDiff {
  previousPeriod: string;
  newPeriod: string;
  categoriesModified: Array<{
    categoryKey: string;
    categoryName: string;
    previousBaseSalary: number | null;
    newBaseSalary: number | null;
    diffAmount: number | null;
    diffPct: number | null;
  }>;
  categoriesAdded: ExtractedCategory[];
  categoriesRemoved: ExtractedCategory[];
  cctChanges: Record<string, { previous: unknown; new: unknown }>;
  warnings: string[];
}

export async function downloadAndExtractText(url: string): Promise<{ text: string; buffer: Buffer; hash: string; contentType: string }> {
  const response = await axios.get<Buffer>(url, {
    responseType: 'arraybuffer',
    timeout: 30000,
    headers: {
      'User-Agent': 'Mi-ContadorIA-Monitor/1.0 (sistema de monitoreo de escalas salariales)',
      Accept: 'application/pdf,text/html,*/*',
    },
    maxRedirects: 5,
  });

  const buffer = Buffer.from(response.data);
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  const contentType = String(response.headers['content-type'] ?? '');

  let text = '';
  if (contentType.includes('pdf') || url.toLowerCase().endsWith('.pdf')) {
    try {
      const parsed = await pdfParse(buffer);
      text = parsed.text ?? '';
    } catch {
      text = '';
    }
  } else {
    text = buffer.toString('utf-8').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  return { text, buffer, hash, contentType };
}

export function calculateHash(data: Buffer | string): string {
  const buf = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;
  return crypto.createHash('sha256').update(buf).digest('hex');
}

// Extrae texto y hash de un archivo subido manualmente (PDF o texto)
export async function extractTextFromBuffer(buffer: Buffer, fileName: string): Promise<{ text: string; hash: string }> {
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  let text = '';
  if (fileName.toLowerCase().endsWith('.pdf')) {
    try {
      const parsed = await pdfParse(buffer);
      text = parsed.text ?? '';
    } catch {
      text = '';
    }
  } else {
    text = buffer.toString('utf-8').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  return { text, hash };
}

// Parsea la respuesta JSON de Gemini, tolerando JSON cortado (cuando se acaban los tokens).
// Si el JSON está incompleto, recupera todas las categorías completas que pueda.
function parsePartialScaleJson(raw: string): Partial<ExtractionResult> | null {
  let cleaned = raw
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  const start = cleaned.indexOf('{');
  if (start < 0) return null;
  cleaned = cleaned.slice(start);

  // Intento 1: parsear tal cual (JSON completo)
  try {
    return JSON.parse(cleaned);
  } catch { /* sigue al recovery */ }

  // Intento 2: el JSON se cortó. Recuperar campos y categorías completas.
  const result: Partial<ExtractionResult> = { categories: [], cctValues: {}, warnings: [] };

  // period
  const pm = cleaned.match(/"periodMonth"\s*:\s*(\d{1,2})/);
  const py = cleaned.match(/"periodYear"\s*:\s*(\d{4})/);
  if (pm) result.periodMonth = Number(pm[1]);
  if (py) result.periodYear = Number(py[1]);
  const conf = cleaned.match(/"confidence"\s*:\s*(\d{1,3})/);
  if (conf) result.confidence = Number(conf[1]);

  // Recuperar objetos de categoría completos { ... } dentro de "categories": [ ... ]
  const catsStart = cleaned.indexOf('"categories"');
  if (catsStart >= 0) {
    const arrStart = cleaned.indexOf('[', catsStart);
    if (arrStart >= 0) {
      const cats: ExtractedCategory[] = [];
      let depth = 0;
      let objStart = -1;
      for (let i = arrStart + 1; i < cleaned.length; i++) {
        const ch = cleaned[i];
        if (ch === '{') {
          if (depth === 0) objStart = i;
          depth++;
        } else if (ch === '}') {
          depth--;
          if (depth === 0 && objStart >= 0) {
            try {
              const obj = JSON.parse(cleaned.slice(objStart, i + 1));
              if (obj && typeof obj === 'object' && obj.categoryName) cats.push(obj);
            } catch { /* objeto incompleto, ignorar */ }
            objStart = -1;
          }
        } else if (ch === ']' && depth === 0) {
          break;
        }
      }
      result.categories = cats;
    }
  }

  // Recuperar cctValues si el objeto está completo
  const cctMatch = cleaned.match(/"cctValues"\s*:\s*(\{[^}]*\})/);
  if (cctMatch) {
    try { result.cctValues = JSON.parse(cctMatch[1]); } catch { /* ignore */ }
  }

  if (result.categories && result.categories.length > 0) {
    result.warnings = [...(result.warnings ?? []), 'Respuesta de IA recuperada parcialmente (se cortó por límite de tokens). Revisá que estén todas las categorías.'];
    if (!result.confidence) result.confidence = 55;
    return result;
  }

  return null;
}

export async function extractSalaryScaleFromText(conventionKey: string, conventionName: string, text: string): Promise<ExtractionResult> {
  if (!isGeminiConfigured()) {
    return {
      periodMonth: null,
      periodYear: null,
      categories: [],
      cctValues: {},
      confidence: 0,
      warnings: ['IA no configurada. Revisar manualmente.'],
      sourceEvidence: text.slice(0, 500),
    };
  }

  const prompt = `Sos un experto en convenios colectivos argentinos. Analizá el siguiente texto de una escala salarial del convenio "${conventionName}" (clave: ${conventionKey}).

IMPORTANTE: Muchos PDFs de escalas argentinas muestran una tabla con MÚLTIPLES COLUMNAS por mes (ej: Básico Oct/25, No Rem Nov/25, Básico Abr/26, No Rem May/26, etc.).
Tu tarea es identificar el PERÍODO MÁS RECIENTE del documento y extraer los valores de ESE período.

CÓMO IDENTIFICAR EL PERÍODO MÁS RECIENTE:
1. Buscá la columna de "BÁSICO" o "BÁSICO MENSUAL" más nueva (mayor año/mes).
2. Ese es el período principal. Extraé sus valores de básico y no remunerativo.
3. Los no remunerativos de ese mes son los acumulados hasta ese período.

TAMBIÉN EXTRAÉ:
- Adicionales especiales (ej: "Adic. Título Farmacéutico", "Adic. Adscripción", "Adic. Bloqueo") como categorías separadas con su básico y no remunerativo del período más reciente.
- Contribución Extraordinaria: suele aparecer en una tabla SEPARADA al pie del documento, con una fila por mes (oct-25, nov-25, dic-25, ene-26, feb-26, mar-26, abr-26, may-26, jun-26). Tomá el valor del mes más reciente del período principal y ponelo en cctValues como "contribucionExtraordinaria".

FORMATO DE RESPUESTA — SOLO JSON válido:
{
  "periodMonth": <número 1-12>,
  "periodYear": <año 4 dígitos>,
  "categories": [
    {
      "categoryKey": "<snake_case o null>",
      "categoryName": "<nombre exacto de la categoría>",
      "baseSalary": <básico mensual del período más reciente, número sin $ ni puntos de miles>,
      "nonRemunerativeAmount": <no remunerativo del período más reciente, número>,
      "hourlyRate": <valor hora si aplica, número o null>,
      "extraFields": {}
    }
  ],
  "cctValues": {
    "contribucionExtraordinaria": <número del período más reciente o null>,
    "<otraClave>": <número>
  },
  "confidence": <0-100>,
  "warnings": ["<advertencia>"],
  "sourceEvidence": "<texto que justifica qué columna tomaste como período principal>"
}

REGLAS:
- Nunca inventar valores. Si no podés determinar un número, dejarlo null.
- Los montos son números puros: 1235927.54 (no $1.235.927,54).
- Si ves "1.235.927,54" → convertir a 1235927.54
- Si ves "1,235,927.54" → es 1235927.54
- confidence alto (>80) solo si encontraste el básico del período más reciente con claridad.
- Si el documento tiene solo valores no-remunerativos sin básico para el período más reciente, incluirlos igual con baseSalary del período anterior.

TEXTO DEL DOCUMENTO:
${text.slice(0, 14000)}`;

  try {
    // 8000 tokens: las escalas grandes (Camioneros ~40 categorías) necesitan más espacio de salida
    const raw = await generateGeminiText({ system: 'Sos un experto en convenios colectivos argentinos. Respondé SOLO con JSON válido, sin texto adicional. Sé conciso en sourceEvidence y warnings para no exceder el límite de tokens.', prompt, maxOutputTokens: 8000 });
    const result = parsePartialScaleJson(raw);
    if (!result) throw new Error('No se pudo parsear JSON de la respuesta');
    return {
      periodMonth: result.periodMonth ?? null,
      periodYear: result.periodYear ?? null,
      categories: Array.isArray(result.categories) ? result.categories : [],
      cctValues: result.cctValues && typeof result.cctValues === 'object' ? result.cctValues : {},
      confidence: typeof result.confidence === 'number' ? Math.min(100, Math.max(0, result.confidence)) : 50,
      warnings: Array.isArray(result.warnings) ? result.warnings : [],
      sourceEvidence: result.sourceEvidence ?? '',
    };
  } catch (err) {
    return {
      periodMonth: null,
      periodYear: null,
      categories: [],
      cctValues: {},
      confidence: 0,
      warnings: [`Error en extracción IA: ${String(err)}`],
      sourceEvidence: '',
    };
  }
}

const MONTH_NAMES_ES = ['', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// Número de CCT esperado por convenio, para validar que el documento corresponda
const CONVENTION_CCT: Record<string, string> = {
  camioneros: '40/89',
  metalurgicos: '260/75',
  comercio: '130/75',
  uocra: '76/75',
  gastronomia: '389/04',
  farmacia: '429/05',
};

// Palabras clave por convenio para clasificar documentos cuando una página tiene VARIOS convenios
// (ej: el CEC Mendoza publica Comercio + Servicios de Contacto + Turismo en la misma página).
const CONVENTION_KEYWORDS: Record<string, { include: string[]; exclude: string[] }> = {
  comercio: {
    include: ['comercio', 'mercantil', 'empleados de comercio', '130/75', '130 75'],
    exclude: ['servicios de contacto', 'call center', 'contact center', '781/20', '781 20', 'turismo', 'viajante', 'gastronom', 'hotelero', 'maestranza y servicios'],
  },
  camioneros: {
    include: ['camioner', 'transporte de carga', '40/89', '40 89', 'fletes', 'recoleccion'],
    exclude: ['pasajeros', 'colectivo', 'larga distancia de pasajeros'],
  },
  farmacia: {
    include: ['farmac', '429/05', '429 05'],
    exclude: ['drogueria'],
  },
  gastronomia: {
    include: ['gastronom', 'fehgra', '389/04', '389 04', 'hotelero', 'hoteles', 'restaurant'],
    exclude: ['turismo de informacion', 'servicios de contacto'],
  },
  uocra: {
    include: ['uocra', 'construccion', '76/75', '76 75'],
    exclude: [],
  },
  metalurgicos: {
    include: ['metalurg', 'metalmecan', 'uom', '260/75', '260 75'],
    exclude: [],
  },
};

// Clasifica un documento (por su título/URL) respecto al convenio esperado:
// 'match' = pertenece al convenio, 'other' = es de OTRO convenio, 'unknown' = no se puede determinar.
export function classifyDocumentConvention(titleAndUrl: string, calculatorKey: string): 'match' | 'other' | 'unknown' {
  const cfg = CONVENTION_KEYWORDS[calculatorKey];
  if (!cfg) return 'unknown';
  const t = titleAndUrl.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ');
  if (cfg.exclude.some((kw) => t.includes(kw))) return 'other';
  if (cfg.include.some((kw) => t.includes(kw))) return 'match';
  return 'unknown';
}

// Validación barata por regex (sin IA): detecta el número de CCT en el texto del PDF.
// Primera línea de defensa contra documentos del convenio equivocado. Funciona aunque Gemini no tenga créditos.
export function documentMatchesConvention(text: string, conventionKey: string): { match: boolean; detected: string | null } {
  const expected = CONVENTION_CCT[conventionKey];
  if (!expected) return { match: true, detected: null };

  // Normalizar "130 / 75" → "130/75" para comparar de forma robusta
  const norm = text.replace(/(\d)\s*\/\s*(\d)/g, '$1/$2');

  // Si aparece el CCT esperado en el texto, coincide.
  if (norm.includes(expected)) return { match: true, detected: null };

  // No aparece el esperado: buscar otros números de CCT en el documento (formato NNN/NN)
  const foundCcts = Array.from(norm.matchAll(/\b(\d{2,4}\/\d{2})\b/g)).map((m) => m[1]);

  // ¿Alguno coincide con OTRO convenio conocido de nuestra lista?
  const otherKnown = Object.entries(CONVENTION_CCT).find(([key, cct]) => key !== conventionKey && foundCcts.includes(cct));
  if (otherKnown) return { match: false, detected: `CCT ${otherKnown[1]} (${otherKnown[0]})` };

  // ¿Hay un CCT distinto prominente y el esperado no aparece?
  const distinct = foundCcts.find((c) => c !== expected);
  if (distinct) return { match: false, detected: `CCT ${distinct}` };

  // No se detectó ningún CCT claro: no podemos descartar por regex, dejar que la IA decida.
  return { match: true, detected: null };
}

export interface ScalePeriodsResult {
  periods: ExtractionResult[];
  conventionMatch: boolean;
  detectedConvention: string | null;
}

/**
 * Extrae TODOS los períodos presentes en un PDF multi-mes (ej: Farmacia con columnas Oct/25..Jun/26),
 * desde minMonth/minYear en adelante. Valida que el documento sea del convenio esperado.
 */
export async function extractScalePeriods(
  conventionKey: string,
  conventionName: string,
  text: string,
  minMonth: number,
  minYear: number,
): Promise<ScalePeriodsResult> {
  if (!isGeminiConfigured()) return { periods: [], conventionMatch: true, detectedConvention: null };

  const sinceLabel = `${MONTH_NAMES_ES[minMonth]} ${minYear}`;
  const expectedCct = CONVENTION_CCT[conventionKey] ?? '';

  const prompt = `Sos un experto en convenios colectivos argentinos. Se esperaba un documento del convenio "${conventionName}"${expectedCct ? ` (CCT ${expectedCct})` : ''}.

PASO 1 — VALIDAR CONVENIO: Antes de extraer, verificá que el documento sea REALMENTE de "${conventionName}"${expectedCct ? ` / CCT ${expectedCct}` : ''}.
- Si el documento menciona OTRO número de CCT (ej: 781/20 cuando se esperaba 130/75) u OTRA actividad (ej: "Servicios de Contacto", "Call Center" cuando se esperaba Comercio), entonces NO corresponde.
- En ese caso devolvé "conventionMatch": false, "detectedConvention" con lo que encontraste, y "periods": [].

PASO 2 — Si el convenio coincide: muchos PDFs traen UNA TABLA con MÚLTIPLES COLUMNAS por mes (paritaria escalonada). Extraé los valores de CADA mes desde ${sinceLabel} en adelante. Ignorá meses anteriores.

Para cada período, armá la escala completa (básico + no remunerativo + adicionales + valores CCT como Contribución Extraordinaria).

RESPUESTA — SOLO JSON válido:
{
  "conventionMatch": <true|false>,
  "detectedConvention": "<qué convenio/CCT detectaste en el documento, o null si coincide>",
  "periods": [
    {
      "periodMonth": <1-12>,
      "periodYear": <año>,
      "categories": [
        { "categoryKey": "<snake_case o null>", "categoryName": "<nombre>", "baseSalary": <número>, "nonRemunerativeAmount": <número>, "hourlyRate": <número o null>, "extraFields": {} }
      ],
      "cctValues": { "contribucionExtraordinaria": <número o null>, "<otra>": <número> },
      "confidence": <0-100>
    }
  ],
  "warnings": ["<advertencia breve>"]
}

REGLAS:
- Si conventionMatch es false, periods debe ser [].
- Un objeto en "periods" por CADA mes desde ${sinceLabel} en adelante que tenga datos.
- Nunca inventar valores; si no está claro, null.
- Montos como números puros: "1.235.927,54" → 1235927.54
- Sé conciso para no exceder tokens.

TEXTO DEL DOCUMENTO:
${text.slice(0, 14000)}`;

  try {
    const raw = await generateGeminiText({
      system: 'Sos un experto en convenios colectivos argentinos. Respondé SOLO con JSON válido, sin texto adicional. Sé conciso.',
      prompt,
      maxOutputTokens: 8000,
    });

    let cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    const start = cleaned.indexOf('{');
    if (start >= 0) cleaned = cleaned.slice(start);

    let parsed: { periods?: unknown[]; warnings?: string[]; conventionMatch?: boolean; detectedConvention?: string | null } | null = null;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // Recovery: extraer objetos de período completos del array "periods"
      parsed = recoverPeriodsArray(cleaned);
    }

    // Validación de convenio: si la IA detectó que es otro convenio, no extraer
    const conventionMatch = parsed?.conventionMatch !== false; // default true si el campo no vino
    const detectedConvention = parsed?.detectedConvention ?? null;
    if (!conventionMatch) {
      return { periods: [], conventionMatch: false, detectedConvention };
    }

    const periodsRaw = Array.isArray(parsed?.periods) ? parsed!.periods : [];
    const warnings = Array.isArray(parsed?.warnings) ? parsed!.warnings! : [];

    const results: ExtractionResult[] = [];
    for (const p of periodsRaw) {
      const obj = p as Partial<ExtractionResult>;
      if (!obj || typeof obj !== 'object') continue;
      const pm = obj.periodMonth ?? null;
      const py = obj.periodYear ?? null;
      if (!pm || !py) continue;
      // Filtrar por mes mínimo
      if (py < minYear || (py === minYear && pm < minMonth)) continue;
      results.push({
        periodMonth: pm,
        periodYear: py,
        categories: Array.isArray(obj.categories) ? obj.categories : [],
        cctValues: obj.cctValues && typeof obj.cctValues === 'object' ? obj.cctValues : {},
        confidence: typeof obj.confidence === 'number' ? Math.min(100, Math.max(0, obj.confidence)) : 60,
        warnings: [...warnings],
        sourceEvidence: obj.sourceEvidence ?? '',
      });
    }

    results.sort((a, b) => (b.periodYear! - a.periodYear!) || (b.periodMonth! - a.periodMonth!));
    return { periods: results, conventionMatch: true, detectedConvention: null };
  } catch (err) {
    if (isRateLimitErrorMsg(String(err))) throw err; // propagar para que el caller maneje el 429
    return { periods: [], conventionMatch: true, detectedConvention: null };
  }
}

function isRateLimitErrorMsg(msg: string): boolean {
  return msg.includes('429') || msg.toLowerCase().includes('quota') || msg.toLowerCase().includes('rate');
}

// Recupera objetos de período de un JSON cortado: { "periods": [ {..}, {..}, {.. (cortado)
function recoverPeriodsArray(cleaned: string): { periods: unknown[]; warnings: string[] } {
  const periods: unknown[] = [];
  const arrStart = cleaned.indexOf('[', cleaned.indexOf('"periods"'));
  if (arrStart < 0) return { periods, warnings: [] };
  let depth = 0;
  let objStart = -1;
  for (let i = arrStart + 1; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (ch === '{') {
      if (depth === 0) objStart = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && objStart >= 0) {
        try {
          const obj = JSON.parse(cleaned.slice(objStart, i + 1));
          if (obj && obj.periodMonth) periods.push(obj);
        } catch { /* incompleto */ }
        objStart = -1;
      }
    }
  }
  return { periods, warnings: ['Respuesta de IA recuperada parcialmente (se cortó por límite de tokens).'] };
}

export async function summarizeNormativeChanges(
  conventionName: string,
  previousText: string,
  newText: string,
): Promise<{ summary: string; riskLevel: 'LOW' | 'MEDIUM' | 'HIGH'; confidence: number; changes: Record<string, unknown> }> {
  if (!isGeminiConfigured()) {
    return { summary: 'IA no configurada', riskLevel: 'LOW', confidence: 0, changes: {} };
  }

  const prompt = `Comparar dos versiones de texto normativo del convenio "${conventionName}".

TEXTO ANTERIOR:
${previousText.slice(0, 4000)}

TEXTO NUEVO:
${newText.slice(0, 4000)}

Responder SOLO con JSON:
{
  "summary": "<resumen en español de los cambios principales>",
  "riskLevel": "LOW|MEDIUM|HIGH",
  "confidence": <0-100>,
  "changes": {
    "salaryChanges": ["<cambio 1>"],
    "conditionChanges": ["<cambio 2>"],
    "newClauses": ["<cláusula nueva>"],
    "removedClauses": ["<cláusula eliminada>"]
  }
}

El riskLevel debe ser:
- HIGH: cambios en salarios base, despidos, jornada laboral, obligaciones patronales
- MEDIUM: cambios en adicionales, beneficios, procedimientos
- LOW: cambios menores, de redacción, aclaraciones`;

  try {
    const raw = await generateGeminiText({ system: 'Sos un experto en convenios colectivos argentinos. Respondé SOLO con JSON válido.', prompt });
    const cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start < 0) throw new Error('No JSON');
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return { summary: 'No se pudo analizar el cambio normativo', riskLevel: 'MEDIUM', confidence: 0, changes: {} };
  }
}

export function compareScaleVersions(
  previousCategories: ExtractedCategory[],
  newCategories: ExtractedCategory[],
  previousPeriod: string,
  newPeriod: string,
): ScaleDiff {
  const prevMap = new Map(previousCategories.map((c) => [c.categoryKey ?? c.categoryName, c]));
  const newMap = new Map(newCategories.map((c) => [c.categoryKey ?? c.categoryName, c]));

  const categoriesModified: ScaleDiff['categoriesModified'] = [];
  const categoriesAdded: ExtractedCategory[] = [];
  const categoriesRemoved: ExtractedCategory[] = [];

  for (const [key, newCat] of newMap.entries()) {
    const prev = prevMap.get(key);
    if (!prev) {
      categoriesAdded.push(newCat);
    } else {
      const prevBase = Number(prev.baseSalary ?? 0);
      const newBase = Number(newCat.baseSalary ?? 0);
      const diffAmount = prevBase && newBase ? newBase - prevBase : null;
      const diffPct = prevBase && diffAmount !== null ? (diffAmount / prevBase) * 100 : null;
      if (diffAmount !== null && Math.abs(diffAmount) > 0.01) {
        categoriesModified.push({
          categoryKey: key,
          categoryName: newCat.categoryName,
          previousBaseSalary: prev.baseSalary ?? null,
          newBaseSalary: newCat.baseSalary ?? null,
          diffAmount,
          diffPct: diffPct !== null ? Math.round(diffPct * 100) / 100 : null,
        });
      }
    }
  }

  for (const [key, prevCat] of prevMap.entries()) {
    if (!newMap.has(key)) categoriesRemoved.push(prevCat);
  }

  const warnings: string[] = [];
  if (categoriesAdded.length > 0) warnings.push(`${categoriesAdded.length} categoría(s) nueva(s)`);
  if (categoriesRemoved.length > 0) warnings.push(`${categoriesRemoved.length} categoría(s) eliminada(s)`);

  return {
    previousPeriod,
    newPeriod,
    categoriesModified,
    categoriesAdded,
    categoriesRemoved,
    cctChanges: {},
    warnings,
  };
}

export interface DetectedDocument {
  url: string;
  title: string;
  foundAt: string;
  detectedPeriod?: { month: number; year: number } | null;
}


export function extractPeriodFromText(text: string): { month: number; year: number } | null {
  let decoded = text;
  try { decoded = decodeURIComponent(text.replace(/\+/g, ' ')); } catch { /* ignore */ }
  const s = decoded.toLowerCase().replace(/[_\-\.+]/g, ' ').replace(/\s+/g, ' ');

  // ISO: "2026-06", "06/2026", "2026/06"
  let m = s.match(/\b(20\d\d)[\/\-](0?[1-9]|1[0-2])\b/) || s.match(/\b(0?[1-9]|1[0-2])[\/\-](20\d\d)\b/);
  if (m) {
    const y = Number(m[1]) > 99 ? Number(m[1]) : Number(m[2]);
    const mo = Number(m[1]) > 99 ? Number(m[2]) : Number(m[1]);
    if (y >= 2020 && y <= 2035 && mo >= 1 && mo <= 12) return { month: mo, year: y };
  }

  // Mes en texto + año. Permite "de" entre mes y año: "mayo de 2026", "diciembre de 2025".
  const matchers: Array<[RegExp, number]> = [
    [/\benero\s*(?:de\s*)?(\d\d(?:\d\d)?)\b/,   1],
    [/\bfebrero\s*(?:de\s*)?(\d\d(?:\d\d)?)\b/, 2],
    [/\bmarzo\s*(?:de\s*)?(\d\d(?:\d\d)?)\b/,   3],
    [/\babril\s*(?:de\s*)?(\d\d(?:\d\d)?)\b/,   4],
    [/\bmayo\s*(?:de\s*)?(\d\d(?:\d\d)?)\b/,    5],
    [/\bjunio\s*(?:de\s*)?(\d\d(?:\d\d)?)\b/,   6],
    [/\bjulio\s*(?:de\s*)?(\d\d(?:\d\d)?)\b/,   7],
    [/\bagosto\s*(?:de\s*)?(\d\d(?:\d\d)?)\b/,  8],
    [/\bseptiembre\s*(?:de\s*)?(\d\d(?:\d\d)?)\b/, 9],
    [/\bsetiembre\s*(?:de\s*)?(\d\d(?:\d\d)?)\b/,  9],
    [/\boctubre\s*(?:de\s*)?(\d\d(?:\d\d)?)\b/, 10],
    [/\bnoviembre\s*(?:de\s*)?(\d\d(?:\d\d)?)\b/, 11],
    [/\bdiciembre\s*(?:de\s*)?(\d\d(?:\d\d)?)\b/, 12],
    [/\bene\s*(?:de\s*)?(\d\d(?:\d\d)?)\b/, 1],
    [/\bfeb\s*(?:de\s*)?(\d\d(?:\d\d)?)\b/, 2],
    [/\bmar\s*(?:de\s*)?(\d\d(?:\d\d)?)\b/, 3],
    [/\babr\s*(?:de\s*)?(\d\d(?:\d\d)?)\b/, 4],
    [/\bmay\s*(?:de\s*)?(\d\d(?:\d\d)?)\b/, 5],
    [/\bjun\s*(?:de\s*)?(\d\d(?:\d\d)?)\b/, 6],
    [/\bjul\s*(?:de\s*)?(\d\d(?:\d\d)?)\b/, 7],
    [/\bago\s*(?:de\s*)?(\d\d(?:\d\d)?)\b/, 8],
    [/\bsep\s*(?:de\s*)?(\d\d(?:\d\d)?)\b/, 9],
    [/\boct\s*(?:de\s*)?(\d\d(?:\d\d)?)\b/, 10],
    [/\bnov\s*(?:de\s*)?(\d\d(?:\d\d)?)\b/, 11],
    [/\bdic\s*(?:de\s*)?(\d\d(?:\d\d)?)\b/, 12],
  ];

  for (const [re, month] of matchers) {
    m = s.match(re);
    if (m) {
      const raw = Number(m[1]);
      const year = raw < 100 ? 2000 + raw : raw;
      if (year >= 2020 && year <= 2035) return { month, year };
    }
  }

  // Tercer intento: mes pegado al año sin separador ni espacio previo
  // (ej: "planillamayo2026.pdf", "escalaoctubre2025"). Sin \b inicial.
  const glued: Array<[RegExp, number]> = [
    [/enero(20\d\d)/, 1], [/febrero(20\d\d)/, 2], [/marzo(20\d\d)/, 3],
    [/abril(20\d\d)/, 4], [/mayo(20\d\d)/, 5], [/junio(20\d\d)/, 6],
    [/julio(20\d\d)/, 7], [/agosto(20\d\d)/, 8], [/septiembre(20\d\d)/, 9],
    [/octubre(20\d\d)/, 10], [/noviembre(20\d\d)/, 11], [/diciembre(20\d\d)/, 12],
  ];
  const noSpace = decoded.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const [re, month] of glued) {
    m = noSpace.match(re);
    if (m) {
      const year = Number(m[1]);
      if (year >= 2020 && year <= 2035) return { month, year };
    }
  }

  return null;
}

// Extrae texto plano de un fragmento HTML, limpiando tags
function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
}

// Decide si un <a> es un link de descarga de documento
function isDocumentLink(href: string, innerText: string): boolean {
  const h = href.toLowerCase();
  const t = innerText.toLowerCase().trim();
  if (h.includes('.pdf')) return true;
  if (/^(descarga|descargar|download|bajar|ver|abrir|click here|descargar pdf)$/.test(t)) return true;
  if (h.includes('wpdmdl') || h.includes('?download=') || h.includes('/download/') ||
      h.includes('attachment_id=') || h.includes('dl=1') || h.includes('file=') ||
      h.includes('.docx') || h.includes('.doc')) return true;
  return false;
}

const SCALE_KEYWORDS = ['escala', 'salarial', 'planilla', 'sueldo', 'paritaria', 'acuerdo', 'acta', 'convenio', 'remuneraci', 'basico', 'salario', 'jornal', 'categoria', 'haberes', 'adicional'];

function isRelevantContent(text: string): boolean {
  const lower = text.toLowerCase();
  return SCALE_KEYWORDS.some((kw) => lower.includes(kw));
}

// Extrae el título más descriptivo del bloque HTML que rodea un anchor
function extractTitleFromContext(htmlBefore: string, htmlAfter: string): string {
  const combined = htmlBefore + htmlAfter;
  // Buscar texto en headings o strong/b cerca del link
  const headingMatch = combined.match(/<(?:h[1-6]|strong|b|p)[^>]*>([\s\S]{5,120}?)<\/(?:h[1-6]|strong|b|p)>/i);
  if (headingMatch) {
    const t = stripHtml(headingMatch[1]);
    if (t.length > 3) return t;
  }
  // Fallback: primer fragmento de texto plano del contexto anterior
  const beforeText = stripHtml(htmlBefore).slice(-200).trim();
  if (beforeText.length > 5) return beforeText.slice(beforeText.lastIndexOf(' ', 100)).trim().slice(0, 100);
  return 'Documento';
}

async function fetchHtml(url: string): Promise<string> {
  const response = await axios.get<string>(url, {
    responseType: 'text',
    timeout: 20000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Mi-ContadorIA-Monitor/1.0',
      Accept: 'text/html,application/xhtml+xml,*/*',
    },
    maxRedirects: 5,
  });
  return String(response.data);
}

function periodSortDesc(a: { detectedPeriod?: { month: number; year: number } | null }, b: { detectedPeriod?: { month: number; year: number } | null }): number {
  if (a.detectedPeriod && b.detectedPeriod) {
    return b.detectedPeriod.year !== a.detectedPeriod.year
      ? b.detectedPeriod.year - a.detectedPeriod.year
      : b.detectedPeriod.month - a.detectedPeriod.month;
  }
  if (a.detectedPeriod) return -1;
  if (b.detectedPeriod) return 1;
  return 0;
}

interface ParsedLink {
  url: string;
  title: string;
  detectedPeriod: { month: number; year: number } | null;
  isDocument: boolean; // true = PDF/descarga directa; false = sub-página HTML
}

// Parsea todos los anchors de una página y los clasifica en documentos directos y sub-páginas relevantes
function parseLinks(html: string, pageUrl: string): ParsedLink[] {
  const byUrl = new Map<string, ParsedLink>();
  const anchorRegex = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = anchorRegex.exec(html)) !== null) {
    const attrs = match[1];
    const innerText = stripHtml(match[2]);

    const hrefMatch = attrs.match(/href=["']([^"']+)["']/i);
    if (!hrefMatch) continue;
    const href = hrefMatch[1].trim();
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) continue;
    if (/[?&]format=(feed|rss|atom)/i.test(href)) continue;

    let fullUrl: string;
    try {
      fullUrl = href.startsWith('http') ? href : new URL(href, pageUrl).href;
    } catch { continue; }

    const pos = match.index;
    const htmlBefore = html.slice(Math.max(0, pos - 600), pos);
    const htmlAfter = html.slice(pos + match[0].length, pos + match[0].length + 300);
    const contextText = stripHtml(htmlBefore + htmlAfter);

    const isDoc = isDocumentLink(href, innerText);

    // Relevancia: el link o su contexto deben mencionar escala/sueldo/planilla/etc.
    const combinedForRelevance = innerText + ' ' + contextText + ' ' + fullUrl;
    const relevant = isRelevantContent(combinedForRelevance) || fullUrl.toLowerCase().includes('.pdf');
    if (!relevant) continue;

    // Período: priorizar fuentes inequívocas (URL y título del link).
    // El contexto circundante puede contener OTROS meses de una lista y contaminar la detección.
    const detectedPeriod =
      extractPeriodFromText(fullUrl) ??
      extractPeriodFromText(innerText) ??
      extractPeriodFromText(contextText.slice(-300));
    if (!isDoc) {
      // Es sub-página HTML: solo nos sirve si tiene período (ej: ".../planilla-mayo-2026")
      if (!detectedPeriod) continue;
      let sameHost = false;
      try { sameHost = new URL(fullUrl).host === new URL(pageUrl).host; } catch { sameHost = false; }
      if (!sameHost) continue;
    }

    let title = innerText && innerText.length > 3 && !/^(descarga|descargar|download|bajar|ver|abrir)$/i.test(innerText)
      ? innerText
      : extractTitleFromContext(htmlBefore, htmlAfter);
    title = title.replace(/\s+/g, ' ').trim().slice(0, 120);

    const link: ParsedLink = { url: fullUrl, title, detectedPeriod, isDocument: isDoc };
    const existing = byUrl.get(fullUrl);
    if (!existing) {
      byUrl.set(fullUrl, link);
    } else {
      const exScore = (existing.detectedPeriod ? 10 : 0) + existing.title.length;
      const newScore = (detectedPeriod ? 10 : 0) + title.length;
      if (newScore > exScore) byUrl.set(fullUrl, link);
    }
  }

  // PDFs embebidos en visores (iframe viewer.html?file=URL.pdf, PDF.js, plugins WordPress, etc.)
  // y enlaces con ?file=/?pdf= apuntando a un .pdf. Muy común en sitios sindicales.
  const embedRegex = /(?:src|href)=["'][^"']*[?&](?:file|pdf|document)=([^"'&]+\.pdf[^"'&]*)/gi;
  let em: RegExpExecArray | null;
  while ((em = embedRegex.exec(html)) !== null) {
    let pdfUrl: string;
    try {
      pdfUrl = decodeURIComponent(em[1]);
      pdfUrl = pdfUrl.startsWith('http') ? pdfUrl : new URL(pdfUrl, pageUrl).href;
    } catch { continue; }
    if (byUrl.has(pdfUrl)) continue;
    const fileName = pdfUrl.split('/').pop() ?? 'documento';
    // Detectar período del NOMBRE del archivo (más confiable que la ruta /YYYY/MM/ de WordPress)
    byUrl.set(pdfUrl, {
      url: pdfUrl,
      title: fileName,
      detectedPeriod: extractPeriodFromText(fileName) ?? extractPeriodFromText(pdfUrl),
      isDocument: true,
    });
  }

  return Array.from(byUrl.values());
}

export async function detectDocumentsFromPage(pageUrl: string): Promise<DetectedDocument[]> {
  try {
    const html = await fetchHtml(pageUrl);
    const links = parseLinks(html, pageUrl);

    // Documentos directos (PDF/iframe) encontrados en la página principal
    const directDocs: DetectedDocument[] = links
      .filter((l) => l.isDocument)
      .map((l) => ({ url: l.url, title: l.title, foundAt: pageUrl, detectedPeriod: l.detectedPeriod }));

    // Sub-páginas por mes (circulares/artículos con período en el slug) — caso fedcam, FAECYS
    const subPages = links
      .filter((l) => !l.isDocument && l.detectedPeriod)
      .sort(periodSortDesc);

    // El período más reciente entre los PDFs directos
    const newestDirect = directDocs.filter((d) => d.detectedPeriod).sort(periodSortDesc)[0];
    const newestSub = subPages[0];

    // Si hay sub-páginas MÁS RECIENTES que cualquier PDF directo, conviene seguirlas:
    // cubre el índice de FAECYS (PDF viejo 2015 directo + circulares 2026 como sub-páginas).
    const subPagesAreNewer =
      newestSub?.detectedPeriod &&
      (!newestDirect?.detectedPeriod || periodSortDesc(newestSub, newestDirect) < 0);

    const collected: DetectedDocument[] = [...directDocs];

    if (subPages.length > 0 && (directDocs.length === 0 || subPagesAreNewer)) {
      console.log(`[ScaleMonitor] ${pageUrl}: siguiendo ${Math.min(5, subPages.length)} sub-página(s) reciente(s) para extraer sus PDFs...`);
      for (const sub of subPages.slice(0, 5)) {
        try {
          const subHtml = await fetchHtml(sub.url);
          const subLinks = parseLinks(subHtml, sub.url).filter((l) => l.isDocument);
          for (const doc of subLinks) {
            // El nombre del PDF es lo más confiable; si no tiene período, usar el del slug del sub-artículo
            const pdfPeriod = extractPeriodFromText(doc.url.split('/').pop() ?? '') ?? sub.detectedPeriod ?? doc.detectedPeriod;
            collected.push({ url: doc.url, title: sub.title || doc.title, foundAt: sub.url, detectedPeriod: pdfPeriod });
          }
        } catch (err) {
          console.warn(`[ScaleMonitor] Error entrando a sub-página ${sub.url}:`, String(err).slice(0, 100));
        }
      }
    }

    if (collected.length === 0) {
      console.warn(`[ScaleMonitor] ${pageUrl}: no se encontraron PDFs ni sub-páginas con período.`);
      return [];
    }

    // Dedup por URL y ordenar por período desc
    const byUrl = new Map<string, DetectedDocument>();
    for (const d of collected) {
      const ex = byUrl.get(d.url);
      if (!ex || (d.detectedPeriod && !ex.detectedPeriod)) byUrl.set(d.url, d);
    }
    const result = Array.from(byUrl.values()).sort(periodSortDesc);
    return result.slice(0, 15);
  } catch (err) {
    console.warn(`[ScaleMonitor] Error detectando documentos en ${pageUrl}:`, err);
    return [];
  }
}
