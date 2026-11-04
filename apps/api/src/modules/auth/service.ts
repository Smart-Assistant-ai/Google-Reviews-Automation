import { normalizeEmail, type Me } from '@replypilot/shared';
import bcrypt from 'bcryptjs';
import { env } from '../../config';
import { recordAudit } from '../../lib/audit';
import { AttemptLimiter } from '../../lib/attempt-limiter';
import { HttpError } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { sendEmailSafely } from '../../providers/email';
import { createWorkspaceWithOwner } from '../workspaces/create';
import { findUsableInvitation, joinFromInvitation } from '../workspaces/invitations-core';
import { runWorkspaceCleanups } from '../workspaces/lifecycle';
import { resetPasswordMessage, verifyEmailMessage } from './emails';
import { consumeToken, issueToken } from './one-time-tokens';
import { revokeAllSessions } from './sessions';

// A low cost in tests only, because the suite creates hundreds of accounts.
const BCRYPT_COST = env.NODE_ENV === 'test' ? 4 : 12;
const hashPassword = (password: string) => bcrypt.hash(password, BCRYPT_COST);

// Compared when the email is unknown, so timing doesn't reveal which emails have accounts.
const DUMMY_HASH = bcrypt.hashSync('no-account-has-this-password', BCRYPT_COST);

const loginFailures = new AttemptLimiter(10, 15 * 60_000);

export interface Logger {
  error: (obj: object, msg: string) => void;
}

const defaultWorkspaceName = (name?: string | null, email?: string) =>
  name ? `${name}'s business` : `${email}'s business`;

export async function isSignupAllowed(email: string): Promise<boolean> {
  if (env.SIGNUP_MODE === 'open') return true;
  return (await prisma.signupAllowlist.count({ where: { email: normalizeEmail(email) } })) > 0;
}

export async function me(userId: string): Promise<Me> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: {
      identities: { select: { provider: true } },
      memberships: {
        where: { removedAt: null, workspace: { deletedAt: null } },
        include: { workspace: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      emailVerified: user.emailVerifiedAt !== null,
      hasPassword: user.identities.some((identity) => identity.provider === 'password'),
      hasGoogle: user.identities.some((identity) => identity.provider === 'google'),
    },
    workspaces: user.memberships.map((membership) => ({
      id: membership.workspace.id,
      name: membership.workspace.name,
      role: membership.role,
      scopeAllLocations: membership.scopeAllLocations,
    })),
  };
}

export interface SignupInput {
  email: string;
  password: string;
  name?: string;
  businessName?: string;
  inviteToken?: string;
}

export async function signup(input: SignupInput, log: Logger, ip?: string): Promise<string> {
  const email = normalizeEmail(input.email);
  if (await prisma.user.findUnique({ where: { email } })) {
    throw new HttpError(409, 'An account with this email already exists. Try logging in.', 'email_taken');
  }

  const invitation = input.inviteToken ? await findUsableInvitation(input.inviteToken) : null;
  if (input.inviteToken && !invitation) {
    throw new HttpError(400, 'This invitation has expired or was already used', 'invalid_invitation');
  }
  if (invitation && invitation.email !== email) {
    throw new HttpError(400, 'This invitation was sent to a different email address', 'invitation_email_mismatch');
  }
  if (!invitation && !(await isSignupAllowed(email))) {
    throw new HttpError(403, 'Signup is by invitation only for now. Please contact us to get access.', 'signup_not_allowed');
  }

  const passwordHash = await hashPassword(input.password);
  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email,
        name: input.name ?? null,
        // An invitation link reached this inbox, which already proves the email is theirs.
        emailVerifiedAt: invitation ? new Date() : null,
      },
    });
    await tx.authIdentity.create({
      data: { userId: created.id, provider: 'password', providerUserId: created.id, passwordHash },
    });
    if (invitation) await joinFromInvitation(tx, invitation, created.id);
    else await createWorkspaceWithOwner(tx, input.businessName ?? defaultWorkspaceName(input.name, email), created.id);
    return created;
  });

  await recordAudit({ action: 'auth.signup', actorUserId: user.id, ip });
  if (!invitation) await sendEmailSafely(verifyEmailMessage(email, await issueToken(user.id, 'verify_email')), log);
  return user.id;
}

export async function login(emailInput: string, password: string, ip?: string): Promise<string> {
  const email = normalizeEmail(emailInput);
  if (loginFailures.isBlocked(email)) {
    throw new HttpError(429, 'Too many failed attempts. Try again in 15 minutes or reset your password.', 'too_many_attempts');
  }

  const user = await prisma.user.findUnique({ where: { email }, include: { identities: true } });
  const hash = user?.identities.find((identity) => identity.provider === 'password')?.passwordHash;
  const matches = await bcrypt.compare(password, hash ?? DUMMY_HASH);

  if (!user || !hash || !matches || user.deletedAt || user.status !== 'active') {
    loginFailures.fail(email);
    if (user) await recordAudit({ action: 'auth.login_failed', actorUserId: user.id, ip });
    throw new HttpError(401, 'Invalid email or password', 'invalid_credentials');
  }

  loginFailures.reset(email);
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await recordAudit({ action: 'auth.login', actorUserId: user.id, ip });
  return user.id;
}

export async function verifyEmail(token: string): Promise<void> {
  const userId = await consumeToken(token, 'verify_email');
  await prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
  await recordAudit({ action: 'auth.email_verified', actorUserId: userId });
}

export async function resendVerification(userId: string, log: Logger): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.emailVerifiedAt) return;
  await sendEmailSafely(verifyEmailMessage(user.email, await issueToken(userId, 'verify_email')), log);
}

// Answers the same either way, so this can't be used to find out who has an account.
export async function forgotPassword(emailInput: string, log: Logger): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email: normalizeEmail(emailInput) } });
  if (!user || user.deletedAt || user.status !== 'active') return;
  await sendEmailSafely(resetPasswordMessage(user.email, await issueToken(user.id, 'reset_password')), log);
}

async function setPassword(userId: string, password: string): Promise<void> {
  const passwordHash = await hashPassword(password);
  await prisma.authIdentity.upsert({
    where: { userId_provider: { userId, provider: 'password' } },
    create: { userId, provider: 'password', providerUserId: userId, passwordHash },
    update: { passwordHash },
  });
}

// The link proves the person owns the inbox, so this also verifies the email and removes any
// access left by someone who signed up with this address first.
export async function resetPassword(token: string, password: string, ip?: string): Promise<void> {
  const userId = await consumeToken(token, 'reset_password');
  await setPassword(userId, password);
  await prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
  await revokeAllSessions(userId);
  await recordAudit({ action: 'auth.password_reset', actorUserId: userId, ip });
}

export async function changePassword(
  userId: string,
  sessionId: string,
  currentPassword: string | undefined,
  newPassword: string,
  ip?: string,
): Promise<void> {
  const identity = await prisma.authIdentity.findUnique({ where: { userId_provider: { userId, provider: 'password' } } });
  // A Google-only account has no password yet, so there is nothing to confirm.
  if (identity?.passwordHash && !(await bcrypt.compare(currentPassword ?? '', identity.passwordHash))) {
    throw new HttpError(401, 'Your current password is not right', 'invalid_credentials');
  }
  await setPassword(userId, newPassword);
  await revokeAllSessions(userId, sessionId);
  await recordAudit({ action: 'auth.password_changed', actorUserId: userId, ip });
}

export async function updateProfile(userId: string, name: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { name } });
}

export async function deleteAccount(userId: string, password: string | undefined, ip?: string): Promise<void> {
  const identity = await prisma.authIdentity.findUnique({ where: { userId_provider: { userId, provider: 'password' } } });
  if (identity?.passwordHash && !(await bcrypt.compare(password ?? '', identity.passwordHash))) {
    throw new HttpError(401, 'Your password is not right', 'invalid_credentials');
  }

  const memberships = await prisma.workspaceMember.findMany({
    where: { userId, removedAt: null, workspace: { deletedAt: null } },
  });
  const soloWorkspaces: string[] = [];
  for (const membership of memberships.filter((m) => m.role === 'owner')) {
    const others = await prisma.workspaceMember.count({
      where: { workspaceId: membership.workspaceId, removedAt: null, userId: { not: userId } },
    });
    if (others > 0) {
      throw new HttpError(409, 'Transfer ownership of your workspace to someone else first', 'transfer_ownership_first');
    }
    soloWorkspaces.push(membership.workspaceId);
  }

  for (const workspaceId of soloWorkspaces) await runWorkspaceCleanups(workspaceId, userId);

  const now = new Date();
  await prisma.$transaction([
    prisma.workspace.updateMany({ where: { id: { in: soloWorkspaces } }, data: { deletedAt: now } }),
    prisma.workspaceMember.updateMany({ where: { userId, removedAt: null }, data: { removedAt: now } }),
    prisma.authIdentity.deleteMany({ where: { userId } }),
    prisma.oneTimeToken.deleteMany({ where: { userId } }),
    prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } }),
    // Personal details go, and the email is free to sign up again. The row stays for audit history.
    prisma.user.update({
      where: { id: userId },
      data: { email: `deleted-${userId}@deleted.invalid`, name: null, deletedAt: now, status: 'suspended' },
    }),
  ]);
  await recordAudit({ action: 'auth.account_deleted', actorUserId: userId, ip });
}
