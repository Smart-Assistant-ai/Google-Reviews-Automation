import { normalizeEmail } from '@replypilot/shared';
import type { Prisma, WorkspaceMember } from '@prisma/client';
import { recordAudit } from '../../lib/audit';
import { HttpError, notFound } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import type { MemberContext } from './access';
import { createWorkspaceWithOwner } from './create';
import { runWorkspaceCleanups } from './lifecycle';

type MemberRow = WorkspaceMember & {
  user: { email: string; name: string | null };
  locations: { locationId: string }[];
};

const withDetails = {
  user: { select: { email: true, name: true } },
  locations: { select: { locationId: true } },
} as const;

// Owners and admins always reach every location, so stored scoping is never shown for them.
function memberDto(row: MemberRow, currentUserId: string) {
  const scoped = row.role === 'member' && !row.scopeAllLocations;
  return {
    id: row.id,
    userId: row.userId,
    email: row.user.email,
    name: row.user.name,
    role: row.role,
    scopeAllLocations: !scoped,
    locationIds: scoped ? row.locations.map((location) => location.locationId) : [],
    isYou: row.userId === currentUserId,
  };
}

export async function assertLocationsInWorkspace(workspaceId: string, locationIds: string[]): Promise<void> {
  const found = await prisma.location.count({ where: { id: { in: locationIds }, workspaceId } });
  if (found !== new Set(locationIds).size) {
    throw new HttpError(400, 'One of those locations is not in this workspace', 'invalid_locations');
  }
}

export async function listWorkspaces(userId: string) {
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId, removedAt: null, workspace: { deletedAt: null } },
    include: { workspace: true },
    orderBy: { createdAt: 'asc' },
  });
  return memberships.map((membership) => ({
    id: membership.workspace.id,
    name: membership.workspace.name,
    role: membership.role,
    scopeAllLocations: membership.scopeAllLocations,
  }));
}

export async function createWorkspace(userId: string, name: string, ip?: string) {
  const workspace = await prisma.$transaction((tx) => createWorkspaceWithOwner(tx, name, userId));
  await recordAudit({ action: 'workspace.created', workspaceId: workspace.id, actorUserId: userId, ip });
  return { id: workspace.id, name: workspace.name, role: 'owner' as const, scopeAllLocations: true };
}

export async function getWorkspace(member: MemberContext) {
  const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: member.workspaceId } });
  return { id: workspace.id, name: workspace.name, role: member.role, scopeAllLocations: member.scopeAllLocations };
}

export async function renameWorkspace(member: MemberContext, name: string, ip?: string) {
  await prisma.workspace.update({ where: { id: member.workspaceId }, data: { name } });
  await recordAudit({ action: 'workspace.renamed', workspaceId: member.workspaceId, actorUserId: member.userId, meta: { name }, ip });
  return getWorkspace(member);
}

export async function deleteWorkspace(member: MemberContext, ip?: string): Promise<void> {
  await runWorkspaceCleanups(member.workspaceId, member.userId);
  await prisma.workspace.update({ where: { id: member.workspaceId }, data: { deletedAt: new Date() } });
  await recordAudit({ action: 'workspace.deleted', workspaceId: member.workspaceId, actorUserId: member.userId, ip });
}

export async function listMembers(member: MemberContext) {
  const rows = await prisma.workspaceMember.findMany({
    where: { workspaceId: member.workspaceId, removedAt: null },
    include: withDetails,
    orderBy: { createdAt: 'asc' },
  });
  return rows.map((row) => memberDto(row, member.userId));
}

async function findTarget(member: MemberContext, memberId: string): Promise<MemberRow> {
  const target = await prisma.workspaceMember.findFirst({
    where: { id: memberId, workspaceId: member.workspaceId, removedAt: null },
    include: withDetails,
  });
  if (!target) throw notFound('Member not found');
  return target;
}

function assertNotOwner(target: WorkspaceMember): void {
  if (target.role === 'owner') {
    throw new HttpError(403, 'The owner can only change through a transfer of ownership', 'forbidden');
  }
}

async function replaceLocations(tx: Prisma.TransactionClient, memberId: string, locationIds: string[]): Promise<void> {
  await tx.workspaceMemberLocation.deleteMany({ where: { memberId } });
  await tx.workspaceMemberLocation.createMany({ data: locationIds.map((locationId) => ({ memberId, locationId })) });
}

export interface MemberChanges {
  role?: 'admin' | 'member';
  scopeAllLocations?: boolean;
  locationIds?: string[];
}

export async function updateMember(member: MemberContext, memberId: string, changes: MemberChanges, ip?: string) {
  const target = await findTarget(member, memberId);
  assertNotOwner(target);
  if (changes.locationIds) await assertLocationsInWorkspace(member.workspaceId, changes.locationIds);

  const role = changes.role ?? target.role;
  const scopeAllLocations = role === 'member' ? (changes.scopeAllLocations ?? target.scopeAllLocations) : true;

  await prisma.$transaction(async (tx) => {
    await tx.workspaceMember.update({ where: { id: memberId }, data: { role, scopeAllLocations } });
    if (scopeAllLocations) await replaceLocations(tx, memberId, []);
    else if (changes.locationIds) await replaceLocations(tx, memberId, changes.locationIds);
  });
  await recordAudit({
    action: 'member.updated',
    workspaceId: member.workspaceId,
    actorUserId: member.userId,
    targetType: 'member',
    targetId: memberId,
    meta: { email: target.user.email, role, scopeAllLocations, locationIds: changes.locationIds },
    ip,
  });
  return memberDto(await findTarget(member, memberId), member.userId);
}

async function markRemoved(memberId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.workspaceMember.update({ where: { id: memberId }, data: { removedAt: new Date() } });
    await replaceLocations(tx, memberId, []);
  });
}

export async function removeMember(member: MemberContext, memberId: string, ip?: string): Promise<void> {
  const target = await findTarget(member, memberId);
  assertNotOwner(target);
  await markRemoved(memberId);
  await recordAudit({
    action: 'member.removed',
    workspaceId: member.workspaceId,
    actorUserId: member.userId,
    targetType: 'member',
    targetId: memberId,
    meta: { email: target.user.email },
    ip,
  });
}

export async function leaveWorkspace(member: MemberContext, ip?: string): Promise<void> {
  if (member.role === 'owner') {
    throw new HttpError(409, 'Transfer ownership to someone else before you leave', 'last_owner');
  }
  await markRemoved(member.id);
  await recordAudit({ action: 'member.left', workspaceId: member.workspaceId, actorUserId: member.userId, ip });
}

export async function transferOwnership(member: MemberContext, memberId: string, ip?: string): Promise<void> {
  const target = await findTarget(member, memberId);
  if (target.id === member.id) throw new HttpError(400, 'You already own this workspace', 'already_owner');
  await prisma.$transaction(async (tx) => {
    await tx.workspaceMember.update({ where: { id: target.id }, data: { role: 'owner', scopeAllLocations: true } });
    await tx.workspaceMember.update({ where: { id: member.id }, data: { role: 'admin', scopeAllLocations: true } });
    await replaceLocations(tx, target.id, []);
  });
  await recordAudit({
    action: 'workspace.ownership_transferred',
    workspaceId: member.workspaceId,
    actorUserId: member.userId,
    targetType: 'member',
    targetId: target.id,
    meta: { to: target.user.email },
    ip,
  });
}

export async function listActivity(member: MemberContext, limit: number) {
  const rows = await prisma.auditLog.findMany({
    where: { workspaceId: member.workspaceId },
    include: { actor: { select: { name: true, email: true } } },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    actorName: row.actor?.name ?? row.actor?.email ?? null,
    targetType: row.targetType,
    targetId: row.targetId,
    meta: row.meta as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
  }));
}

// People to tell when something needs attention, such as a Google connection dying.
export async function adminEmails(workspaceId: string): Promise<string[]> {
  const rows = await prisma.workspaceMember.findMany({
    where: { workspaceId, removedAt: null, role: { in: ['owner', 'admin'] }, user: { deletedAt: null } },
    select: { user: { select: { email: true } } },
  });
  return rows.map((row) => normalizeEmail(row.user.email));
}
