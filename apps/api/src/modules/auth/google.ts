import { normalizeEmail } from '@replypilot/shared';
import { recordAudit } from '../../lib/audit';
import { prisma } from '../../lib/prisma';
import type { GoogleIdentity } from '../../providers/google-identity';
import { createWorkspaceWithOwner } from '../workspaces/create';
import { findUsableInvitation, joinFromInvitation } from '../workspaces/invitations-core';
import { isSignupAllowed } from './service';

export type GoogleSignInResult =
  | { ok: true; userId: string }
  | { ok: false; error: 'google_unverified' | 'verify_first' | 'signup_not_allowed' | 'account_unavailable' };

// Google is matched on its stable id, never on email. Linking by email only happens once both
// sides have proved they own that address. Otherwise a stranger could sign up with someone's
// email first and keep their password access after that person logs in with Google.
export async function signInWithGoogle(
  identity: GoogleIdentity,
  inviteToken: string | undefined,
  ip?: string,
): Promise<GoogleSignInResult> {
  const known = await prisma.authIdentity.findUnique({
    where: { provider_providerUserId: { provider: 'google', providerUserId: identity.sub } },
    include: { user: true },
  });
  if (known) {
    if (known.user.deletedAt || known.user.status !== 'active') return { ok: false, error: 'account_unavailable' };
    await prisma.user.update({ where: { id: known.userId }, data: { lastLoginAt: new Date() } });
    await recordAudit({ action: 'auth.login', actorUserId: known.userId, meta: { method: 'google' }, ip });
    return { ok: true, userId: known.userId };
  }

  if (!identity.emailVerified) return { ok: false, error: 'google_unverified' };
  const email = normalizeEmail(identity.email);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (existing.deletedAt || existing.status !== 'active') return { ok: false, error: 'account_unavailable' };
    if (!existing.emailVerifiedAt) return { ok: false, error: 'verify_first' };
    await prisma.authIdentity.create({
      data: { userId: existing.id, provider: 'google', providerUserId: identity.sub },
    });
    await prisma.user.update({ where: { id: existing.id }, data: { lastLoginAt: new Date() } });
    await recordAudit({ action: 'auth.google_linked', actorUserId: existing.id, ip });
    return { ok: true, userId: existing.id };
  }

  const found = inviteToken ? await findUsableInvitation(inviteToken) : null;
  const invitation = found?.email === email ? found : null;
  if (!invitation && !(await isSignupAllowed(email))) return { ok: false, error: 'signup_not_allowed' };

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: { email, name: identity.name, emailVerifiedAt: new Date(), lastLoginAt: new Date() },
    });
    await tx.authIdentity.create({ data: { userId: created.id, provider: 'google', providerUserId: identity.sub } });
    if (invitation) await joinFromInvitation(tx, invitation, created.id);
    else await createWorkspaceWithOwner(tx, identity.name ? `${identity.name}'s business` : `${email}'s business`, created.id);
    return created;
  });
  await recordAudit({ action: 'auth.signup', actorUserId: user.id, meta: { method: 'google' }, ip });
  return { ok: true, userId: user.id };
}
