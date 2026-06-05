import { z } from 'zod';

export const createSourceSchema = z.object({
  conventionId: z.string().min(1),
  calculatorKey: z.string().min(1),
  name: z.string().min(1),
  url: z.string().url('URL inválida'),
  sourceType: z.enum(['FEDERATION', 'SINDICATO', 'MINISTERIO', 'BOLETIN', 'MANUAL', 'OTHER']).default('OTHER'),
  enabled: z.boolean().default(true),
  checkFrequency: z.number().int().min(1).max(720).default(24),
  monitorSince: z.string().optional().transform((v) => (v ? new Date(v) : undefined)),
});

export const updateSourceSchema = createSourceSchema.partial();

export const createCctSourceSchema = z.object({
  conventionId: z.string().min(1),
  calculatorKey: z.string().min(1),
  name: z.string().min(1),
  url: z.string().url('URL inválida'),
  enabled: z.boolean().default(true),
});

export const listCandidatesQuerySchema = z.object({
  calculatorKey: z.string().optional(),
  status: z.enum(['DETECTED', 'EXTRACTED', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'IGNORED']).optional(),
  periodMonth: z.coerce.number().int().min(1).max(12).optional(),
  periodYear: z.coerce.number().int().min(2020).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const reviewCandidateSchema = z.object({
  notes: z.string().optional(),
});

export const approveCandidateSchema = z.object({
  notes: z.string().optional(),
  overrideLowConfidence: z.boolean().optional().default(false),
});

export const listVersionsQuerySchema = z.object({
  calculatorKey: z.string().optional(),
  periodYear: z.coerce.number().int().min(2020).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const listCctChangesQuerySchema = z.object({
  calculatorKey: z.string().optional(),
  status: z.enum(['DETECTED', 'PENDING_REVIEW', 'APPROVED', 'REJECTED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
