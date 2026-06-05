import { prisma } from '../../database/prisma';
import { notFound } from '../../utils/httpError';

const db = prisma as any;

// ──────────────────────────────────────────────────────────────────────────────
// Catálogo de convenios y sus categorías canónicas (lo que esperan las calculadoras)
// ──────────────────────────────────────────────────────────────────────────────

export const conventions = [
  {
    conventionId: 'camioneros_cct_40_89',
    calculatorKey: 'camioneros',
    conventionName: 'Camioneros',
    cct: '40/89',
    categories: [
      ['chofer_1ra', 'Chofer de primera / conductor'],
      ['conductor_2da', 'Conductor de segunda categoria'],
      ['conductor_3ra', 'Conductor de tercera categoria / fletes al instante'],
      ['grua_hasta_10', 'Conductor de grua hasta 10 toneladas'],
      ['grua_10_20', 'Conductor de grua mas de 10 y hasta 20 toneladas'],
      ['grua_20_35', 'Conductor de grua mas de 20 y hasta 35 toneladas'],
      ['grua_35_45', 'Conductor de grua mas de 35 y hasta 45 toneladas'],
      ['grua_45_55', 'Conductor de grua mas de 45 y hasta 55 toneladas'],
      ['grua_55_70', 'Conductor de grua mas de 55 y hasta 70 toneladas'],
      ['grua_70_90', 'Conductor de grua mas de 70 y hasta 90 toneladas'],
      ['grua_90_110', 'Conductor de grua mas de 90 y hasta 110 toneladas'],
      ['grua_110_140', 'Conductor de grua mas de 110 y hasta 140 toneladas'],
      ['grua_140_170', 'Conductor de grua mas de 140 y hasta 170 toneladas'],
      ['grua_170_300', 'Conductor de grua mas de 170 y hasta 300 toneladas'],
      ['grua_mas_300', 'Conductor de grua mas de 300 toneladas'],
      ['encargado', 'Encargado'],
      ['recibidor', 'Recibidor / clasificador de guias'],
      ['peon_esp', 'Peon especializado / reparto / embalador'],
      ['recolector_residuos', 'Recolectores de residuo y limpieza'],
      ['peon', 'Peon'],
      ['peon_barrido', 'Peones generales de barrido y limpieza'],
      ['operador_servicios', 'Operador de servicios'],
      ['distribuidor_domiciliario', 'Distribuidor domiciliario'],
      ['ayudante_mayor_18', 'Ayudantes mayores de 18 años'],
      ['chofer_blindado', 'Chofer de camion blindado'],
      ['chofer_con_firma', 'Chofer con firma'],
      ['custodia_caudales', 'Custodia de camion de caudales'],
      ['auxiliar_operativo_1ra', 'Auxiliar operativo de primera'],
      ['auxiliar_operativo_2da', 'Auxiliar operativo de segunda'],
      ['oficial_1ra', 'Oficial de primera'],
      ['oficial_completo_taller', 'Oficial completo de taller'],
      ['oficial', 'Oficial'],
      ['medio_oficial', 'Medio oficial'],
      ['oficial_gomero', 'Oficial gomero'],
      ['medio_oficial_gomero', 'Medio oficial gomero'],
      ['lavadores_taller', 'Lavadores, engrasadores y ayudantes de taller'],
      ['administrativo_1ra', 'Personal administrativo - primera categoria'],
      ['administrativo_2da', 'Personal administrativo - segunda categoria'],
      ['administrativo_3ra', 'Personal administrativo - tercera categoria'],
      ['administrativo_4ta', 'Personal administrativo - cuarta categoria'],
      ['sereno', 'Sereno / maestranza'],
      ['auxiliar_operativo_1ra_clearing', 'Auxiliar operativo de primera de clearing y correo privado'],
      ['auxiliar_operativo_2da_clearing', 'Auxiliar operativo de segunda de clearing y correo privado'],
    ],
  },
  {
    conventionId: 'metalurgicos_cct_260_75',
    calculatorKey: 'metalurgicos',
    conventionName: 'Metalurgicos',
    cct: '260/75',
    categories: [
      ['oficial_multiple', 'Oficial multiple'],
      ['oficial', 'Oficial'],
      ['op_esp_multiple', 'Operario especializado multiple'],
      ['op_especializado', 'Operario especializado'],
      ['medio_oficial', 'Medio oficial'],
      ['op_calificado', 'Operario calificado'],
      ['operario', 'Operario'],
      ['peon', 'Peon'],
    ],
  },
  {
    conventionId: 'comercio_cct_130_75',
    calculatorKey: 'comercio',
    conventionName: 'Comercio',
    cct: '130/75',
    categories: [
      ['maestranza_a', 'Maestranza "A"'],
      ['maestranza_b', 'Maestranza "B"'],
      ['maestranza_c', 'Maestranza "C"'],
      ['administrativo_a', 'Administrativo "A"'],
      ['administrativo_b', 'Administrativo "B"'],
      ['administrativo_c', 'Administrativo "C"'],
      ['administrativo_d', 'Administrativo "D"'],
      ['administrativo_e', 'Administrativo "E"'],
      ['administrativo_f', 'Administrativo "F"'],
      ['cajero_a', 'Cajero "A"'],
      ['cajero_b', 'Cajero "B"'],
      ['cajero_c', 'Cajero "C"'],
      ['auxiliar_a', 'Auxiliar "A"'],
      ['auxiliar_b', 'Auxiliar "B"'],
      ['auxiliar_c', 'Auxiliar "C"'],
      ['auxiliar_especializado_a', 'Auxiliar especializado "A"'],
      ['auxiliar_especializado_b', 'Auxiliar especializado "B"'],
      ['vendedor_a', 'Vendedor "A"'],
      ['vendedor_b', 'Vendedor "B"'],
      ['vendedor_c', 'Vendedor "C"'],
      ['vendedor_d', 'Vendedor "D"'],
    ],
  },
  {
    conventionId: 'uocra_cct_76_75',
    calculatorKey: 'uocra',
    conventionName: 'UOCRA',
    cct: '76/75',
    categories: [
      ['ayudante_zona_a', 'Ayudante - Zona A'],
      ['ayudante_zona_b', 'Ayudante - Zona B'],
      ['ayudante_zona_c', 'Ayudante - Zona C'],
      ['ayudante_zona_c_austral', 'Ayudante - Zona C Austral'],
      ['medio_oficial_zona_a', 'Medio oficial - Zona A'],
      ['medio_oficial_zona_b', 'Medio oficial - Zona B'],
      ['medio_oficial_zona_c', 'Medio oficial - Zona C'],
      ['medio_oficial_zona_c_austral', 'Medio oficial - Zona C Austral'],
      ['oficial_zona_a', 'Oficial - Zona A'],
      ['oficial_zona_b', 'Oficial - Zona B'],
      ['oficial_zona_c', 'Oficial - Zona C'],
      ['oficial_zona_c_austral', 'Oficial - Zona C Austral'],
      ['oficial_especializado_zona_a', 'Oficial especializado - Zona A'],
      ['oficial_especializado_zona_b', 'Oficial especializado - Zona B'],
      ['oficial_especializado_zona_c', 'Oficial especializado - Zona C'],
      ['oficial_especializado_zona_c_austral', 'Oficial especializado - Zona C Austral'],
      ['sereno_zona_a', 'Sereno - Zona A'],
      ['sereno_zona_b', 'Sereno - Zona B'],
      ['sereno_zona_c', 'Sereno - Zona C'],
      ['sereno_zona_c_austral', 'Sereno - Zona C Austral'],
    ],
  },
  {
    conventionId: 'gastronomia_cct_389_04',
    calculatorKey: 'gastronomia',
    conventionName: 'Gastronomía FEHGRA',
    cct: '389/04',
    categories: [
      ['b_punto_1', 'Categoría B - Punto 1'], ['b_punto_2', 'Categoría B - Punto 2'],
      ['b_punto_3', 'Categoría B - Punto 3'], ['b_punto_4', 'Categoría B - Punto 4'],
      ['b_punto_5', 'Categoría B - Punto 5'], ['b_punto_6', 'Categoría B - Punto 6'],
      ['b_punto_7', 'Categoría B - Punto 7'],
      ['a_punto_1', 'Categoría A - Punto 1'], ['a_punto_2', 'Categoría A - Punto 2'],
      ['a_punto_3', 'Categoría A - Punto 3'], ['a_punto_4', 'Categoría A - Punto 4'],
      ['a_punto_5', 'Categoría A - Punto 5'], ['a_punto_6', 'Categoría A - Punto 6'],
      ['a_punto_7', 'Categoría A - Punto 7'],
      ['especial_punto_1', 'Categoría Especial - Punto 1'], ['especial_punto_2', 'Categoría Especial - Punto 2'],
      ['especial_punto_3', 'Categoría Especial - Punto 3'], ['especial_punto_4', 'Categoría Especial - Punto 4'],
      ['especial_punto_5', 'Categoría Especial - Punto 5'], ['especial_punto_6', 'Categoría Especial - Punto 6'],
      ['especial_punto_7', 'Categoría Especial - Punto 7'],
    ],
  },
  {
    conventionId: 'farmacia_mendoza',
    calculatorKey: 'farmacia',
    conventionName: 'Farmacia Mendoza',
    cct: '429/05',
    categories: [
      ['cat_inicial_a', 'CAT. INICIAL "A"'],
      ['cat_inicial_b', 'CAT. INICIAL "B"'],
      ['cajero_perf_admi', 'CAJERO, PERF. Y ADMI.'],
      ['empleado_farmacia', 'EMPL. DE FCIA'],
      ['empleado_especializado_farmacia', 'EMPL. ESP. DE FCIA'],
      ['farmaceutico', 'FARMACEUTICO'],
    ],
  },
];

export function listSupportedConventions() {
  return conventions.map((c) => ({ conventionId: c.conventionId, calculatorKey: c.calculatorKey, conventionName: c.conventionName, cct: c.cct, categoriesCount: c.categories.length }));
}

// ──────────────────────────────────────────────────────────────────────────────
// Normalización y mapeo de categorías
// ──────────────────────────────────────────────────────────────────────────────

export function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function categoryKeyFor(calculatorKey: string, categoryName: string, proposedKey?: string | null) {
  const convention = conventions.find((item) => item.calculatorKey === calculatorKey);
  if (!convention) return proposedKey || null;
  const normalizedKey = normalizeText(String(proposedKey ?? '')).replace(/\s+/g, '_');
  if (convention.categories.some(([key]) => key === normalizedKey)) return normalizedKey;
  const target = normalizeText(categoryName);

  if (calculatorKey === 'camioneros') {
    if (target.includes('clearing') || target.includes('correo privado')) {
      if (target.includes('primera')) return 'auxiliar_operativo_1ra_clearing';
      if (target.includes('segunda')) return 'auxiliar_operativo_2da_clearing';
    }
    if (target.includes('barrido') && target.includes('limpieza')) return 'peon_barrido';
    if (target.includes('operarios especializados') || target.includes('peon especializado')) return 'peon_esp';
    if (target === 'oficial') return 'oficial';
    if (target === 'medio oficial') return 'medio_oficial';
    if (target.includes('oficial gomero') && !target.includes('medio')) return 'oficial_gomero';
    if (target.includes('medio oficial gomero')) return 'medio_oficial_gomero';
    if (target.includes('grua') || target.includes('autoelevador')) {
      if (target.includes('mas de 300')) return 'grua_mas_300';
      const range = target.match(/mas de\s+(\d+)\s+y hasta\s+(\d+)/);
      if (range) return `grua_${range[1]}_${range[2]}`;
      if (target.includes('hasta 10')) return 'grua_hasta_10';
      return null;
    }
  }

  if (calculatorKey === 'comercio') {
    const commerce = target
      .replace(/\badministratativo\b/g, 'administrativo')
      .replace(/\bmaestranza y servicios\b/g, 'maestranza')
      .replace(/\bauxiliares especializados\b/g, 'auxiliar especializado')
      .replace(/\bauxiliares\b/g, 'auxiliar')
      .replace(/\bvendedores\b/g, 'vendedor');
    const letter = commerce.match(/\b([a-f])\b|["']([a-f])["']/)?.[1] ?? commerce.match(/\b([a-f])\b|["']([a-f])["']/)?.[2];
    if (commerce.includes('maestranza') && letter) return `maestranza_${letter}`;
    if (commerce.includes('administrativo') && letter) return `administrativo_${letter}`;
    if (commerce.includes('cajero') && letter) return `cajero_${letter}`;
    if (commerce.includes('auxiliar especializado') && letter) return `auxiliar_especializado_${letter}`;
    if (commerce.includes('auxiliar') && letter) return `auxiliar_${letter}`;
    if (commerce.includes('vendedor') && letter) return `vendedor_${letter}`;
  }

  if (calculatorKey === 'uocra') {
    const base = target.includes('oficial especializado') || target.includes('oficial espedalizado')
      ? 'oficial_especializado'
      : target.includes('medio oficial') ? 'medio_oficial'
        : target.includes('oficial') ? 'oficial'
          : target.includes('ayudante') ? 'ayudante'
            : target.includes('sereno') ? 'sereno' : null;
    const zone = target.includes('austral') ? 'zona_c_austral'
      : target.includes('zona c') ? 'zona_c'
        : target.includes('zona b') ? 'zona_b'
          : target.includes('zona a') ? 'zona_a' : null;
    if (base && zone) return `${base}_${zone}`;
    if (base) return base;
  }

  if (calculatorKey === 'gastronomia') {
    const group = target.includes('especial') ? 'especial'
      : target.includes('categoria a') || target.includes('grupo a') ? 'a'
        : target.includes('categoria b') || target.includes('grupo b') ? 'b' : null;
    const point = target.match(/punto\s*(\d)/)?.[1] ?? target.match(/\bp\s*(\d)\b/)?.[1] ?? target.match(/\b(\d)\b/)?.[1] ?? null;
    if (group && point && Number(point) >= 1 && Number(point) <= 7) return `${group}_punto_${point}`;
  }

  const found = convention.categories.find(([key, name]) => key === proposedKey || normalizeText(name) === target || normalizeText(name).includes(target) || target.includes(normalizeText(name)));
  if (found) return found[0];

  const targetTerms = new Set(target.split(/\s+/).map((t) => t.replace(/es$|s$/i, '')).filter((t) => t.length > 3));
  const scored = convention.categories
    .map(([key, name]) => {
      const score = normalizeText(name).split(/\s+/).map((t) => t.replace(/es$|s$/i, '')).filter((t) => t.length > 3)
        .reduce((total, t) => total + (targetTerms.has(t) ? 1 : 0), 0);
      return { key, score };
    })
    .filter((item) => item.score >= 2)
    .sort((a, b) => b.score - a.score)[0];
  return scored?.key ?? proposedKey ?? null;
}

// ──────────────────────────────────────────────────────────────────────────────
// Escala aprobada vigente (lo que consumiría una calculadora)
// ──────────────────────────────────────────────────────────────────────────────

function monthStart(month: number, year: number) {
  return new Date(Date.UTC(year, month - 1, 1));
}

function normalizeCctValues(values: unknown): Record<string, number> {
  if (!values || typeof values !== 'object') return {};
  return Object.entries(values as Record<string, unknown>).reduce((acc, [key, value]) => {
    const n = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(n) && n >= 0) acc[key] = n;
    return acc;
  }, {} as Record<string, number>);
}

function withCctValues<T extends { extractedByIAJson?: unknown }>(scale: T): T & { cctValues: Record<string, number> } {
  const stored = normalizeCctValues((scale.extractedByIAJson as any)?.cctValues);
  return { ...scale, cctValues: stored };
}

export async function getApprovedSalaryScale(calculatorKey: string, month: number, year: number) {
  const targetDate = monthStart(month, year);
  const scale = await db.salaryScaleVersion.findFirst({
    where: {
      calculatorKey,
      status: 'APROBADA',
      validFrom: { lte: targetDate },
      OR: [{ validTo: null }, { validTo: { gte: targetDate } }],
    },
    include: { items: { orderBy: { categoryName: 'asc' } } },
    orderBy: [{ validFrom: 'desc' }, { reviewedAt: 'desc' }],
  });
  if (!scale) throw notFound('Escala aprobada');
  return withCctValues(scale);
}

// ──────────────────────────────────────────────────────────────────────────────
// Extracción de valores CCT por convenio desde el texto del PDF (complemento de la IA)
// ──────────────────────────────────────────────────────────────────────────────

function normalizeMoney(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
  let normalized = String(value).replace(/\$/g, '').replace(/\s/g, '').trim();
  if (!normalized) return null;
  const hasComma = normalized.includes(',');
  const hasDot = normalized.includes('.');
  if (hasComma && hasDot) {
    const lastComma = normalized.lastIndexOf(',');
    const lastDot = normalized.lastIndexOf('.');
    normalized = lastComma > lastDot ? normalized.replace(/\./g, '').replace(',', '.') : normalized.replace(/,/g, '');
  } else if (hasComma) {
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(normalized)) {
    normalized = normalized.replace(/\./g, '');
  }
  const n = Number(normalized);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function cctMoney(rawText: string, pattern: RegExp): number | null {
  const match = rawText.match(pattern);
  return match ? normalizeMoney(match[1]) : null;
}

function extractCamionerosCctValues(rawText: string): Record<string, number> {
  const text = rawText.replace(/\s+/g, ' ');
  const values: Record<string, number> = {};
  const set = (key: string, value: number | null) => {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) values[key] = value;
  };
  set('comidaDia', cctMoney(text, /ITEM\s+4\.1\.12\s+COMIDA\s+\*?\s*([0-9.,]+)/i));
  set('viaticoDia', cctMoney(text, /ITEM\s+4\.1\.13\s+VIATICO\s+ESPECIAL\s+\*?\s*([0-9.,]+)/i));
  set('pernoctada', cctMoney(text, /ITEM\s+4\.1\.14\s+PERNOCTADA\s+\*?\s*([0-9.,]+)/i));
  set('remunerativoKm', cctMoney(text, /ITEM\s+4\.2\.3\s+HORAS\s+EXTRAORDINARIAS\s+POR\s+KILOMETRAJE\s+RECORRIDO\.?-?\s*([0-9.,]+)/i));
  set('viaticoKm', cctMoney(text, /ITEM\s+4\.2\.4\s+VIATICO\.?-?\s*([0-9.,]+)/i));
  set('permanenciaViaticoDia', cctMoney(text, /ITEM\s+4\.2\.5\s+PERMANENCIA\s+FUERA\s+DE\s+RESIDENCIA\s+HABITUAL\.?-?\s*([0-9.,]+)/i));
  set('permanenciaCompensacionDia', cctMoney(text, /SIMPLE\s+PRESENCIA\.?-?\s*([0-9.,]+)/i));
  set('permanenciaViaticoSurDia', cctMoney(text, /PERMANENCIA\s+FUERA\s+DE\s+RESIDENCIA\s+HABITUAL\s+AL\s+SUR\s+DEL\s+RIO\s+COLORADO\.?-?\s*([0-9.,]+)/i));
  set('permanenciaCompensacionSurDia', cctMoney(text, /SIMPLE\s+PRESENCIA\s+AL\s+SUR\s+DEL\s+RIO\s+COLORADO\.?-?\s*([0-9.,]+)/i));
  set('cruceFrontera', cctMoney(text, /ITEM\s+4\.2\.17\s+VIATICO\s+POR\s+CADA\s+CRUCE\s+DE\s+FRONTERA\.?-?\s*([0-9.,]+)/i));
  set('tierraFuegoIngresoEgreso', cctMoney(text, /VIATICO\s+POR\s+CADA\s+INGRESO\s+O\s+POR\s+CADA\s+EGRESO\s+A\s+LA\s+ISLA\s+DE\s+TIERRA\s+DEL\s+FUEGO\.?-?\s*([0-9.,]+)/i));
  set('aguasGaseosasLargaDistancia', cctMoney(text, /ITEM\s+5\.11\.3a2\s+CHOFERES\s+DE\s+LARGA\s+DISTANCIA\.?-?\s*([0-9.,]+)/i));
  set('bitrenes', cctMoney(text, /ADICIONAL\s+BITRENES\s*([0-9.,]+)/i));
  set('largaDistanciaAdicionalPct', cctMoney(text, /ITEM\s+4\.2\s+LARGA\s+DISTANCIA\s+ADICIONAL\s+CHOFER\s+([0-9.,]+)\s*%/i));
  set('plusVacacionalDia', cctMoney(text, /ITEM\s+3\.3\.2\.?\s+PLUS\s+VACACIONAL\s+POR\s+DIA\s*([0-9.,]+)/i));
  if (/350\s*KM\.?\s*X\s*DIA/i.test(text)) values.kmMinDia = 350;
  if (/700\s*KMS?\.?\s*EN\s+EL\s+ITEM\s+4\.2\.4/i.test(text)) values.kmMinDiaCordillera = 700;
  return values;
}

// Dispatcher: complementa los valores CCT de la IA con los del texto del PDF.
// Camioneros tiene formato "ITEM 4.1.x" parseable por regex; otros convenios se apoyan en la IA.
export function extractCctValues(calculatorKey: string, rawText: string, _periodMonth?: number, _periodYear?: number): Record<string, number> {
  if (calculatorKey === 'camioneros') return extractCamionerosCctValues(rawText);
  return {};
}
