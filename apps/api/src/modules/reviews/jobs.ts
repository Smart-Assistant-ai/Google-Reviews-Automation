import { env } from '../../config';
import { prisma } from '../../lib/prisma';
import type { JobDefinition } from '../../jobs/runner';
import { sendEmail } from '../../providers/email';
import { renderEmail } from '../../providers/email/template';
import { getContext, usesFakeData, markNeedsReconnect } from '../google/connection.service';
import { scanConnection } from '../google/locations.service';
import { reviewResourceName, syncLocation } from '../google/sync.service';
import { adminEmails } from '../workspaces/service';
import { draftForReview } from './draft.service';
import { purgeExpiredContent } from './purge.service';

const MINUTE = 60_000;
const SYNC_EVERY = 15 * MINUTE;
const SYNC_BATCH = 20;
const DRAFT_BATCH = 15;
const DRAFT_CONCURRENCY = 3;
const MAX_DRAFT_ATTEMPTS = 5;
const STUCK_POSTING_AFTER = 5 * MINUTE;
const LIVE_CHECK_EVERY = MINUTE;

// Everything here reads what is due from the database, so a restart loses nothing.
export async function syncDueLocations(): Promise<void> {
  const due = await prisma.location.findMany({
    where: {
      status: 'active',
      connection: { status: 'healthy' },
      OR: [{ lastSyncAttemptAt: null }, { lastSyncAttemptAt: { lte: new Date(Date.now() - SYNC_EVERY) } }],
    },
    orderBy: { lastSyncAttemptAt: { sort: 'asc', nulls: 'first' } },
    take: SYNC_BATCH,
    select: { id: true },
  });
  for (const location of due) await syncLocation(location.id);
}

export async function runDraftQueue(): Promise<void> {
  const pending = await prisma.reply.findMany({
    where: { state: 'drafting' },
    orderBy: { createdAt: 'asc' },
    take: DRAFT_BATCH,
    select: { id: true, reviewId: true, draftAttempts: true },
  });
  // A few at a time, so a big first sync doesn't fire dozens of AI calls at once.
  for (let i = 0; i < pending.length; i += DRAFT_CONCURRENCY) {
    await Promise.all(
      pending.slice(i, i + DRAFT_CONCURRENCY).map(async (reply) => {
        try {
          await draftForReview(reply.reviewId);
        } catch (err) {
          const attempts = reply.draftAttempts + 1;
          const gaveUp = attempts >= MAX_DRAFT_ATTEMPTS;
          await prisma.reply.update({
            where: { id: reply.id },
            data: {
              draftAttempts: attempts,
              ...(gaveUp ? { state: 'failed', error: `Could not write a draft: ${(err as Error).message}` } : {}),
            },
          });
        }
      }),
    );
  }
}

// Picks up Google's verdict on posted replies. A real reply is checked at most once a minute, because
// checking every few seconds would use up the whole quota with only 15 replies waiting.
export async function checkPendingReplies(): Promise<void> {
  const pending = await prisma.reply.findMany({
    where: { state: 'pending_google' },
    include: { review: { include: { location: { include: { connection: true } } } } },
    orderBy: { lastCheckedAt: { sort: 'asc', nulls: 'first' } },
    take: 50,
  });
  for (const reply of pending) {
    const { location } = reply.review;
    const fake = usesFakeData(location.connection);
    const recentlyChecked = reply.lastCheckedAt && Date.now() - reply.lastCheckedAt.getTime() < LIVE_CHECK_EVERY;
    if (!fake && recentlyChecked) continue;
    try {
      const { provider, ctx } = await getContext(location.connectionId);
      const review = await provider.getReview(ctx, reviewResourceName(location, reply.review.googleReviewId));
      const google = review.reviewReply;
      if (!google || google.replyState === 'PENDING') {
        await prisma.reply.update({ where: { id: reply.id }, data: { lastCheckedAt: new Date() } });
        continue;
      }
      await prisma.reply.update({
        where: { id: reply.id },
        data: {
          state: google.replyState === 'REJECTED' ? 'rejected' : 'live',
          googleReplyState: google.replyState ?? 'APPROVED',
          policyViolation: google.policyViolation ?? null,
          lastCheckedAt: new Date(),
        },
      });
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode === 401) await markNeedsReconnect(location.connectionId);
      await prisma.reply.update({ where: { id: reply.id }, data: { lastCheckedAt: new Date() } });
      console.warn('[moderation-check]', reply.id, (err as Error).message);
    }
  }
}

// A crash mid-post leaves a reply stuck, so hand it back to the owner to check and retry.
export async function recoverStuckReplies(): Promise<void> {
  await prisma.reply.updateMany({
    where: { state: 'posting', updatedAt: { lt: new Date(Date.now() - STUCK_POSTING_AFTER) } },
    data: { state: 'failed', error: 'Posting was interrupted. Check Google, then try again.' },
  });
}

export async function rescanConnections(): Promise<void> {
  const connections = await prisma.googleConnection.findMany({ where: { status: 'healthy' }, select: { id: true } });
  for (const connection of connections) {
    try {
      await scanConnection(connection.id);
    } catch (err) {
      console.warn('[rescan]', connection.id, (err as Error).message);
    }
  }
}

async function emailAdmins(workspaceId: string, build: (to: string) => ReturnType<typeof renderEmail>): Promise<void> {
  for (const to of await adminEmails(workspaceId)) await sendEmail(build(to));
}

// A dead connection must never go unnoticed. Each is emailed once, and only marked after the
// email went out, so a failed send is tried again.
export async function notifyProblems(): Promise<void> {
  const settingsUrl = `${env.APP_URL}/settings`;

  const dead = await prisma.googleConnection.findMany({ where: { status: 'needs_reconnect', reconnectNotifiedAt: null } });
  for (const connection of dead) {
    await emailAdmins(connection.workspaceId, (to) =>
      renderEmail({
        to,
        subject: 'Please reconnect your Google account',
        intro: `We can no longer reach Google with ${connection.googleEmail ?? 'one of your connected accounts'}, so its reviews have stopped updating and replies can't be posted.`,
        actionLabel: 'Reconnect',
        actionUrl: settingsUrl,
      }),
    );
    await prisma.googleConnection.update({ where: { id: connection.id }, data: { reconnectNotifiedAt: new Date() } });
  }

  const lost = await prisma.location.findMany({ where: { status: 'access_lost', accessLostNotifiedAt: null } });
  for (const location of lost) {
    await emailAdmins(location.workspaceId, (to) =>
      renderEmail({
        to,
        subject: `We lost access to ${location.title}`,
        intro: `Google no longer lets the connected account manage ${location.title}, so its reviews have stopped updating. Existing reviews are still here.`,
        actionLabel: 'Check your locations',
        actionUrl: settingsUrl,
      }),
    );
    await prisma.location.update({ where: { id: location.id }, data: { accessLostNotifiedAt: new Date() } });
  }
}

export const reviewJobs: JobDefinition[] = [
  { name: 'sync-locations', everyMs: MINUTE, leaseMs: 30 * MINUTE, run: syncDueLocations },
  { name: 'draft-replies', everyMs: 5000, run: runDraftQueue },
  { name: 'check-moderation', everyMs: 5000, run: checkPendingReplies },
  { name: 'recover-stuck-replies', everyMs: MINUTE, run: recoverStuckReplies },
  { name: 'rescan-connections', everyMs: 6 * 60 * MINUTE, leaseMs: 30 * MINUTE, run: rescanConnections },
  { name: 'notify-problems', everyMs: 5 * MINUTE, run: notifyProblems },
  {
    name: 'purge-content',
    everyMs: 24 * 60 * MINUTE,
    leaseMs: 60 * MINUTE,
    run: async () => {
      // One batch can leave more behind, so keep going until a batch comes back empty.
      while ((await purgeExpiredContent()) > 0);
    },
  },
];
