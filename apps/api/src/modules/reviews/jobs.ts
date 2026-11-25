import * as Sentry from '@sentry/node';
import { env } from '../../config';
import { prisma } from '../../lib/prisma';
import type { JobDefinition } from '../../jobs/runner';
import { emailEnabled, sendEmail } from '../../providers/email';
import { renderEmail } from '../../providers/email/template';
import { getContext, usesFakeData, markNeedsReconnect } from '../google/connection.service';
import { writableWorkspaceFilter } from '../billing/service';
import { scanConnection } from '../google/locations.service';
import { applyModerationResult, reviewIdOf, syncLocation } from '../google/sync.service';
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
const CHECK_PAGES = 4;

// Everything here reads what is due from the database, so a restart loses nothing.
export async function syncDueLocations(): Promise<void> {
  const due = await prisma.location.findMany({
    where: {
      status: 'active',
      connection: { status: 'healthy' },
      OR: [
        { lastSyncAttemptAt: null },
        { lastSyncAttemptAt: { lte: new Date(Date.now() - SYNC_EVERY) } },
      ],
    },
    orderBy: { lastSyncAttemptAt: { sort: 'asc', nulls: 'first' } },
    take: SYNC_BATCH,
    select: { id: true },
  });
  for (const location of due) await syncLocation(location.id);
}

export async function runDraftQueue(): Promise<void> {
  // A workspace without a plan keeps its new reviews waiting for a draft, rather than spending AI
  // calls on them. They are drafted as soon as it subscribes.
  const pending = await prisma.reply.findMany({
    where: { state: 'drafting', workspace: writableWorkspaceFilter() },
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
          // Only a reply still waiting for its draft. One a sync filled in meanwhile with the answer
          // already on Google keeps that answer, rather than turning into a failed draft.
          await prisma.reply.updateMany({
            where: { id: reply.id, state: 'drafting' },
            data: {
              draftAttempts: attempts,
              ...(gaveUp
                ? { state: 'failed', error: `Could not write a draft: ${(err as Error).message}` }
                : {}),
            },
          });
        }
      }),
    );
  }
}

// Picks up Google's verdict on posted replies. Google's lookup of a single review leaves the verdict
// out, so each location's review list is read instead, newest first, a few pages deep. A reply further
// back is settled by the next full sync, which reads every page. A real reply is checked at most once a
// minute, because checking every few seconds would use up the whole quota with only 15 replies waiting.
export async function checkPendingReplies(): Promise<void> {
  const pending = await prisma.reply.findMany({
    where: { state: 'pending_google' },
    include: { review: { include: { location: { include: { connection: true } } } } },
    orderBy: { lastCheckedAt: { sort: 'asc', nulls: 'first' } },
    take: 50,
  });
  const byLocation = new Map<string, typeof pending>();
  for (const reply of pending) {
    const fake = usesFakeData(reply.review.location.connection);
    const recentlyChecked =
      reply.lastCheckedAt && Date.now() - reply.lastCheckedAt.getTime() < LIVE_CHECK_EVERY;
    if (!fake && recentlyChecked) continue;
    const key = reply.review.locationId;
    byLocation.set(key, [...(byLocation.get(key) ?? []), reply]);
  }

  for (const replies of byLocation.values()) {
    const { location } = replies[0]!.review;
    const waiting = new Map(replies.map((reply) => [reply.review.googleReviewId, reply]));
    try {
      const { provider, ctx } = await getContext(location.connectionId);
      let pageToken: string | undefined;
      let pages = 0;
      do {
        const page = await provider.listReviews(
          ctx,
          location.googleAccountName,
          location.googleLocationName,
          pageToken,
        );
        for (const review of page.reviews ?? []) {
          const reply = waiting.get(reviewIdOf(review));
          if (!reply) continue;
          waiting.delete(reply.review.googleReviewId);
          // No reply listed yet means Google hasn't caught up, so it stays pending.
          if (review.reviewReply) await applyModerationResult(reply, review.reviewReply);
        }
        pageToken = page.nextPageToken;
        pages += 1;
      } while (pageToken && waiting.size > 0 && pages < CHECK_PAGES);
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode === 401)
        await markNeedsReconnect(location.connectionId);
      console.warn('[moderation-check]', location.id, (err as Error).message);
    }
    await prisma.reply.updateMany({
      where: { id: { in: replies.map((reply) => reply.id) } },
      data: { lastCheckedAt: new Date() },
    });
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
  const connections = await prisma.googleConnection.findMany({
    where: { status: 'healthy' },
    select: { id: true },
  });
  for (const connection of connections) {
    try {
      await scanConnection(connection.id);
    } catch (err) {
      console.warn('[rescan]', connection.id, (err as Error).message);
    }
  }
}

// Reported, because a broken email setup would otherwise hide every warning quietly.
function reportNotifyFailure(what: string, err: unknown): void {
  console.warn('[notify]', what, (err as Error).message);
  Sentry.captureException(err);
}

// Each admin is tried on their own, so one bad address doesn't stop the rest. Returns whether the
// workspace was told: someone got the email, or there was nobody to tell.
async function emailAdmins(
  workspaceId: string,
  build: (to: string) => ReturnType<typeof renderEmail>,
): Promise<boolean> {
  const recipients = await adminEmails(workspaceId);
  let reached = 0;
  for (const to of recipients) {
    try {
      await sendEmail(build(to));
      reached += 1;
    } catch (err) {
      reportNotifyFailure(`email for workspace ${workspaceId}`, err);
    }
  }
  return reached > 0 || recipients.length === 0;
}

// A dead connection must never go unnoticed. Each problem is marked once someone in the workspace
// was told. If nobody could be reached it stays unmarked, so the next run tries again. One problem
// failing never holds up the others.
export async function notifyProblems(): Promise<void> {
  // The app still shows these problems on screen. Without email, the marks stay unset, so switching
  // email on later sends one email for each problem that is still there.
  if (!emailEnabled()) return;
  const settingsUrl = `${env.APP_URL}/settings`;

  const dead = await prisma.googleConnection.findMany({
    where: { status: 'needs_reconnect', reconnectNotifiedAt: null },
  });
  for (const connection of dead) {
    try {
      const told = await emailAdmins(connection.workspaceId, (to) =>
        renderEmail({
          to,
          subject: 'Please reconnect your Google account',
          intro: `We can no longer reach Google with ${connection.googleEmail ?? 'one of your connected accounts'}, so its reviews have stopped updating and replies can't be posted.`,
          actionLabel: 'Reconnect',
          actionUrl: settingsUrl,
        }),
      );
      if (told) {
        await prisma.googleConnection.update({
          where: { id: connection.id },
          data: { reconnectNotifiedAt: new Date() },
        });
      }
    } catch (err) {
      reportNotifyFailure(`connection ${connection.id}`, err);
    }
  }

  const lost = await prisma.location.findMany({
    where: { status: 'access_lost', accessLostNotifiedAt: null },
  });
  for (const location of lost) {
    try {
      const told = await emailAdmins(location.workspaceId, (to) =>
        renderEmail({
          to,
          subject: `We lost access to ${location.title}`,
          intro: `Google no longer lets the connected account manage ${location.title}, so its reviews have stopped updating. Existing reviews are still here.`,
          actionLabel: 'Check your locations',
          actionUrl: settingsUrl,
        }),
      );
      if (told) {
        await prisma.location.update({
          where: { id: location.id },
          data: { accessLostNotifiedAt: new Date() },
        });
      }
    } catch (err) {
      reportNotifyFailure(`location ${location.id}`, err);
    }
  }
}

export const reviewJobs: JobDefinition[] = [
  { name: 'sync-locations', everyMs: MINUTE, leaseMs: 30 * MINUTE, run: syncDueLocations },
  { name: 'draft-replies', everyMs: 5000, run: runDraftQueue },
  { name: 'check-moderation', everyMs: 5000, run: checkPendingReplies },
  { name: 'recover-stuck-replies', everyMs: MINUTE, run: recoverStuckReplies },
  {
    name: 'rescan-connections',
    everyMs: 6 * 60 * MINUTE,
    leaseMs: 30 * MINUTE,
    run: rescanConnections,
  },
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
