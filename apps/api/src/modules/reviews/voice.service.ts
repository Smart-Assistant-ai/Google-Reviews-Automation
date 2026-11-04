import type { Voice } from '@replypilot/shared';
import type { VoiceProfile } from '@prisma/client';
import { recordAudit } from '../../lib/audit';
import { prisma } from '../../lib/prisma';
import { assertLocationAccess, type MemberContext } from '../workspaces/access';
import { usingAi } from './draft.service';

const toVoice = (row: VoiceProfile, workspaceName: string): Voice => ({
  businessName: row.businessName ?? workspaceName,
  tone: row.tone,
  signOff: row.signOff,
  ownerName: row.ownerName,
  alwaysSay: row.alwaysSay,
  neverSay: row.neverSay,
  languageMode: row.languageMode,
});

const defaults = (workspaceName: string): Voice => ({
  businessName: workspaceName,
  tone: 'warm',
  signOff: null,
  ownerName: null,
  alwaysSay: null,
  neverSay: null,
  languageMode: 'match',
});

// A location's own voice wins, otherwise the workspace default, otherwise sensible defaults.
export async function effectiveVoice(
  workspaceId: string,
  locationId: string | null,
): Promise<{ voice: Voice; isOverride: boolean }> {
  const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
  const override = locationId
    ? await prisma.voiceProfile.findFirst({ where: { workspaceId, locationId } })
    : null;
  if (override) return { voice: toVoice(override, workspace.name), isOverride: true };
  const fallback = await prisma.voiceProfile.findFirst({
    where: { workspaceId, locationId: null },
  });
  return {
    voice: fallback ? toVoice(fallback, workspace.name) : defaults(workspace.name),
    isOverride: false,
  };
}

const drafter = () => (usingAi() ? ('openai' as const) : ('template' as const));

export async function getVoice(member: MemberContext, locationId?: string) {
  if (locationId) await assertLocationAccess(member, locationId);
  return { ...(await effectiveVoice(member.workspaceId, locationId ?? null)), drafter: drafter() };
}

export type VoiceChanges = Partial<Voice>;

export async function updateDefaultVoice(
  member: MemberContext,
  changes: VoiceChanges,
  ip?: string,
) {
  const { workspaceId } = member;
  const existing = await prisma.voiceProfile.findFirst({
    where: { workspaceId, locationId: null },
  });
  if (existing) await prisma.voiceProfile.update({ where: { id: existing.id }, data: changes });
  else await prisma.voiceProfile.create({ data: { workspaceId, ...changes } });
  await recordAudit({ action: 'voice.updated', workspaceId, actorUserId: member.userId, ip });
  return getVoice(member);
}

export async function updateLocationVoice(
  member: MemberContext,
  locationId: string,
  changes: VoiceChanges,
  ip?: string,
) {
  await assertLocationAccess(member, locationId);
  const { workspaceId } = member;
  const existing = await prisma.voiceProfile.findFirst({ where: { workspaceId, locationId } });
  if (existing) {
    await prisma.voiceProfile.update({ where: { id: existing.id }, data: changes });
  } else {
    // A new override starts from what the location uses today, so only the changes differ.
    const { voice } = await effectiveVoice(workspaceId, locationId);
    await prisma.voiceProfile.create({ data: { workspaceId, locationId, ...voice, ...changes } });
  }
  await recordAudit({
    action: 'voice.location_updated',
    workspaceId,
    locationId,
    actorUserId: member.userId,
    ip,
  });
  return getVoice(member, locationId);
}

export async function clearLocationVoice(member: MemberContext, locationId: string, ip?: string) {
  await assertLocationAccess(member, locationId);
  await prisma.voiceProfile.deleteMany({ where: { workspaceId: member.workspaceId, locationId } });
  await recordAudit({
    action: 'voice.location_cleared',
    workspaceId: member.workspaceId,
    locationId,
    actorUserId: member.userId,
    ip,
  });
  return getVoice(member, locationId);
}
