import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';

const SECRET_KEY = /password|secret|token|api.?key|authorization|cookie/i;

// One writer for audit rows, so a secret can't reach the log from any caller.
export function maskSecrets<T>(value: T): T {
  if (Array.isArray(value)) return value.map(maskSecrets) as T;
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, inner]) => [key, SECRET_KEY.test(key) ? '[redacted]' : maskSecrets(inner)]),
    ) as T;
  }
  return value;
}

export interface AuditEntry {
  action: string;
  workspaceId?: string | null;
  locationId?: string | null;
  actorUserId?: string | null;
  targetType?: string;
  targetId?: string;
  meta?: Record<string, unknown>;
  ip?: string | null;
}

export async function recordAudit(entry: AuditEntry, db: Prisma.TransactionClient = prisma): Promise<void> {
  await db.auditLog.create({
    data: { ...entry, meta: maskSecrets(entry.meta ?? {}) as Prisma.InputJsonValue },
  });
}
