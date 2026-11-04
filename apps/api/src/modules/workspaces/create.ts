import type { Prisma } from '@prisma/client';

// Every workspace starts with exactly one owner.
export async function createWorkspaceWithOwner(tx: Prisma.TransactionClient, name: string, ownerUserId: string) {
  return tx.workspace.create({
    data: { name, members: { create: { userId: ownerUserId, role: 'owner', scopeAllLocations: true } } },
  });
}
