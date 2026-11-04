import type { Prisma, WorkspaceInvitation } from '@prisma/client';
import { hashToken } from '../../lib/crypto';
import { HttpError } from '../../lib/errors';
import { prisma } from '../../lib/prisma';

export type UsableInvitation = WorkspaceInvitation & { workspace: { id: string; name: string } };

export async function findUsableInvitation(token: string): Promise<UsableInvitation | null> {
  const invitation = await prisma.workspaceInvitation.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { workspace: true },
  });
  const usable =
    invitation &&
    !invitation.acceptedAt &&
    !invitation.revokedAt &&
    invitation.expiresAt > new Date() &&
    !invitation.workspace.deletedAt;
  return usable ? invitation : null;
}

// Claims the invitation first, so two clicks on one link can't both succeed.
export async function joinFromInvitation(
  tx: Prisma.TransactionClient,
  invitation: UsableInvitation,
  userId: string,
): Promise<void> {
  const claimed = await tx.workspaceInvitation.updateMany({
    where: { id: invitation.id, acceptedAt: null, revokedAt: null },
    data: { acceptedAt: new Date() },
  });
  if (claimed.count === 0) throw new HttpError(410, 'This invitation has already been used', 'invitation_used');

  const { workspaceId } = invitation;
  const existing = await tx.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } });
  if (existing && !existing.removedAt) throw new HttpError(409, 'You are already in this workspace', 'already_member');

  // A location may have been removed since the invitation was sent.
  const stillThere = await tx.location.findMany({
    where: { id: { in: invitation.locationIds }, workspaceId },
    select: { id: true },
  });
  const values = { role: invitation.role, scopeAllLocations: invitation.scopeAllLocations, removedAt: null };
  const member = await tx.workspaceMember.upsert({
    where: { workspaceId_userId: { workspaceId, userId } },
    create: { workspaceId, userId, ...values },
    update: values,
  });
  await tx.workspaceMemberLocation.deleteMany({ where: { memberId: member.id } });
  await tx.workspaceMemberLocation.createMany({
    data: stillThere.map((location) => ({ memberId: member.id, locationId: location.id })),
  });
}
