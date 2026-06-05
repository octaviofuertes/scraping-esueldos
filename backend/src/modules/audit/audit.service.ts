import { prisma } from '../../database/prisma';

interface AuditInput {
  userId?: string | null;
  entity: string;
  entityId: string;
  action: string;
  previousValue?: unknown;
  newValue?: unknown;
}

export async function logAudit(input: AuditInput) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.userId ?? null,
        entity: input.entity,
        entityId: input.entityId,
        action: input.action,
        previousValueJson: (input.previousValue ?? undefined) as any,
        newValueJson: (input.newValue ?? undefined) as any,
      },
    });
  } catch (error) {
    console.warn('No se pudo registrar auditoría', error);
  }
}
