/**
 * Tipos principales de la aplicación
 * Definen la estructura de datos usada en toda la app
 */

/**
 * Usuario autenticado
 */
export interface User {
  id: string
  email: string
  role: 'admin' | 'viewer'
  createdAt: string
}

/**
 * Respuesta de login
 */
export interface AuthResponse {
  token: string
  user: User
}

/**
 * Fuente de datos a monitorear
 */
export interface ScaleSource {
  id: string
  name: string
  url: string
  sourceType: 'cec_mendoza' | 'union_site' | 'custom'
  calculatorKey: string
  enabled: boolean
  checkFrequency: number // horas
  lastCheckedAt: string | null
  createdAt: string
}

/**
 * Candidato de escala salarial detectado
 * Estado: DETECTED → PENDING_REVIEW → APPROVED/REJECTED
 */
export interface SalaryScaleCandidate {
  id: string
  sourceId: string
  calculatorKey: string
  status: 'DETECTED' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'IGNORED'
  documentUrl: string | null
  fileHash: string
  extractedDataJson: {
    categories?: SalaryCategory[]
    error?: string
    detectedPeriods?: { month: number; year: number }[]
  }
  diffJson: DiffData
  aiConfidence: number
  createdAt: string
  updatedAt: string
}

/**
 * Categoría de escala salarial
 */
export interface SalaryCategory {
  categoryName: string
  baseSalary: number | null
  nonRemunerativeAmount: number | null
  hourlyRate: number | null
}

/**
 * Diferencia entre versiones
 */
export interface DiffData {
  previousPeriod: string | null
  newPeriod: string | null
  categoriesModified: CategoryDiff[]
  categoriesAdded: SalaryCategory[]
  categoriesRemoved: SalaryCategory[]
}

/**
 * Cambio en una categoría
 */
export interface CategoryDiff {
  categoryName: string
  previousBaseSalary: number | null
  newBaseSalary: number | null
  diffAmount: number | null
  diffPct: number | null
}

/**
 * Versión aprobada de escala
 */
export interface SalaryScaleVersion {
  id: string
  calculatorKey: string
  periodMonth: number
  periodYear: number
  status: 'APROBADA' | 'PENDIENTE_REVISION'
  extractedByIAJson: {
    categories: SalaryCategory[]
  }
  validFrom: string
  createdAt: string
}

/**
 * Evento de auditoría
 */
export interface AuditLog {
  id: string
  userId: string
  action: string
  entity: string
  entityId: string
  details: Record<string, unknown>
  createdAt: string
}

/**
 * Resultado de operación
 */
export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
}
