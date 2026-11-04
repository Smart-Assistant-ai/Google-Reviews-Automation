// Foundation code must not import product modules, so a product module registers what it
// needs to clean up when a workspace goes away.
type WorkspaceCleanup = (workspaceId: string, actorUserId: string | null) => Promise<void>;

const cleanups: WorkspaceCleanup[] = [];

export function onWorkspaceDeleted(cleanup: WorkspaceCleanup): void {
  if (!cleanups.includes(cleanup)) cleanups.push(cleanup);
}

export async function runWorkspaceCleanups(workspaceId: string, actorUserId: string | null): Promise<void> {
  for (const cleanup of cleanups) await cleanup(workspaceId, actorUserId);
}
