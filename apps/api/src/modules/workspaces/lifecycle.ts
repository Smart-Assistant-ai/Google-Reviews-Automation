import type { Prisma } from '@prisma/client';
import { withLock } from '../../lib/lock';

// Foundation code must not import product modules, so a product module registers what it
// needs to clean up when a workspace goes away.
type WorkspaceCleanup = (workspaceId: string, actorUserId: string | null) => Promise<void>;

const cleanups: WorkspaceCleanup[] = [];

export function onWorkspaceDeleted(cleanup: WorkspaceCleanup): void {
  if (!cleanups.includes(cleanup)) cleanups.push(cleanup);
}

// Deleting a workspace holds this lock from its first cleanup until it is marked deleted. Anything
// that mustn't start for a workspace on its way out, such as opening a checkout, takes the lock
// too and checks the mark inside it. It then runs wholly before the deletion, whose cleanups undo
// it, or wholly after, and finds the workspace gone.
export const workspaceLock = <T>(
  workspaceId: string,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
) => withLock(`workspace:${workspaceId}`, work);

// Runs every cleanup, then marks the workspace deleted, under the workspace's lock. A cleanup that
// fails stops the deletion, so it can be tried again. The cleanups use connections of their own,
// since they may take locks of their own; only the mark goes through the lock's transaction.
export async function closeWorkspace(
  workspaceId: string,
  actorUserId: string | null,
  now = new Date(),
): Promise<void> {
  await workspaceLock(workspaceId, async (tx) => {
    for (const cleanup of cleanups) await cleanup(workspaceId, actorUserId);
    await tx.workspace.update({ where: { id: workspaceId }, data: { deletedAt: now } });
  });
}
