import type { WorkspaceInvitation } from '@prisma/client';
import { recordAudit } from '../../lib/audit';
import { hashToken, randomToken } from '../../lib/crypto';
import { HttpError, notFound } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { env } from '../../config';
import { sendEmailSafely } from '../../providers/email';
import { renderEmail } from '../../providers/email/template';
import type { MemberContext } from './access';
import { findUsableInvitation, joinFromInvitation } from './invitations-core';
import { assertLocationsInWorkspace } from './service';

const INVITATION_DAYS = 7;

export interface InvitationInput {
  email: string;
  role: 'admin' | 'member';
  scopeAllLocations: boolean;
  locationIds: string[];
}

type Logger = { error: (obj: object, msg: string) => void };

const dto = (row: WorkspaceInvitation) => ({
  id: row.id,
  email: row.email,
  role: row.role,
  scopeAllLocations: row.scopeAllLocations,
  locationIds: row.locationIds,
  expiresAt: row.expiresAt.toISOString(),
  createdAt: row.createdAt.toISOString(),
});

export async function listInvitations(member: MemberContext) {
  const rows = await prisma.workspaceInvitation.findMany({
    where: { workspaceId: member.workspaceId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(dto);
}

export async function createInvitation(member: MemberContext, input: InvitationInput, log: Logger, ip?: string) {
  const { workspaceId } = member;
  const alreadyIn = await prisma.workspaceMember.findFirst({
    where: { workspaceId, removedAt: null, user: { email: input.email } },
  });
  if (alreadyIn) throw new HttpError(409, 'That person is already in this workspace', 'already_member');

  // Admins reach every location, so scoping only applies to members.
  const scopeAllLocations = input.role === 'admin' ? true : input.scopeAllLocations;
  const locationIds = scopeAllLocations ? [] : input.locationIds;
  await assertLocationsInWorkspace(workspaceId, locationIds);

  const token = randomToken();
  const [, invitation] = await prisma.$transaction([
    prisma.workspaceInvitation.updateMany({
      where: { workspaceId, email: input.email, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
    prisma.workspaceInvitation.create({
      data: {
        workspaceId,
        email: input.email,
        role: input.role,
        scopeAllLocations,
        locationIds,
        tokenHash: hashToken(token),
        invitedById: member.userId,
        expiresAt: new Date(Date.now() + INVITATION_DAYS * 86_400_000),
      },
    }),
  ]);

  const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
  const emailSent = await sendEmailSafely(
    renderEmail({
      to: input.email,
      subject: `You're invited to ${workspace.name}`,
      intro: `You've been invited to help manage Google reviews for ${workspace.name}.`,
      actionLabel: 'Accept invitation',
      actionUrl: `${env.APP_URL}/invite?token=${token}`,
      outro: `This invitation works for ${INVITATION_DAYS} days.`,
    }),
    log,
  );
  await recordAudit({
    action: 'invitation.created',
    workspaceId,
    actorUserId: member.userId,
    targetType: 'invitation',
    targetId: invitation.id,
    meta: { email: input.email, role: input.role },
    ip,
  });
  return { ...dto(invitation), emailSent };
}

export async function revokeInvitation(member: MemberContext, invitationId: string, ip?: string): Promise<void> {
  const revoked = await prisma.workspaceInvitation.updateMany({
    where: { id: invitationId, workspaceId: member.workspaceId, acceptedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (revoked.count === 0) throw notFound('Invitation not found');
  await recordAudit({
    action: 'invitation.revoked',
    workspaceId: member.workspaceId,
    actorUserId: member.userId,
    targetType: 'invitation',
    targetId: invitationId,
    ip,
  });
}

export async function previewInvitation(token: string) {
  const invitation = await findUsableInvitation(token);
  if (!invitation) throw notFound('This invitation has expired or was already used');
  const accountExists = (await prisma.user.count({ where: { email: invitation.email } })) > 0;
  return {
    workspaceName: invitation.workspace.name,
    email: invitation.email,
    role: invitation.role,
    accountExists,
  };
}

export async function acceptInvitation(userId: string, userEmail: string, token: string, ip?: string): Promise<void> {
  const invitation = await findUsableInvitation(token);
  if (!invitation) throw notFound('This invitation has expired or was already used');
  if (invitation.email !== userEmail) {
    throw new HttpError(403, `This invitation was sent to ${invitation.email}. Log in with that email to accept it.`, 'invitation_email_mismatch');
  }
  await prisma.$transaction(async (tx) => {
    await joinFromInvitation(tx, invitation, userId);
    // The link reached this inbox, which proves the address is theirs.
    await tx.user.updateMany({ where: { id: userId, emailVerifiedAt: null }, data: { emailVerifiedAt: new Date() } });
  });
  await recordAudit({ action: 'invitation.accepted', workspaceId: invitation.workspaceId, actorUserId: userId, ip });
}
