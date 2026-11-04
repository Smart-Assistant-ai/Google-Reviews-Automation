import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { STAR_TO_NUMBER, type GbpReply, type GbpReview } from '../../providers/gbp';
import { getContext, markNeedsReconnect } from './connection.service';

// Older reviews go to the backlog and aren't drafted automatically.
export const AUTO_DRAFT_WINDOW_DAYS = 30;

const GOOGLE_STATE_TO_LOCAL = {
  PENDING: 'pending_google',
  APPROVED: 'live',
  REJECTED: 'rejected',
} as const;

const reviewIdOf = (review: GbpReview) =>
  review.reviewId ?? review.name.split('/reviews/')[1] ?? review.name;

export const reviewResourceName = (
  location: { googleAccountName: string; googleLocationName: string },
  googleReviewId: string,
) => `${location.googleAccountName}/${location.googleLocationName}/reviews/${googleReviewId}`;

async function applyGoogleReply(
  workspaceId: string,
  reviewId: string,
  reply: GbpReply,
): Promise<void> {
  const googleState = reply.replyState ?? 'APPROVED';
  const state = GOOGLE_STATE_TO_LOCAL[googleState] ?? 'live';
  const local = await prisma.reply.findUnique({ where: { reviewId } });
  if (!local) {
    await prisma.reply.create({
      data: {
        workspaceId,
        reviewId,
        text: reply.comment,
        source: 'google',
        state,
        googleReplyState: googleState,
        policyViolation: reply.policyViolation ?? null,
        postedAt: reply.updateTime ? new Date(reply.updateTime) : null,
      },
    });
    return;
  }
  // A draft in progress is the owner's work, so sync never overwrites it.
  if (['pending_google', 'live', 'rejected'].includes(local.state)) {
    await prisma.reply.update({
      where: { id: local.id },
      data: {
        state,
        googleReplyState: googleState,
        policyViolation: reply.policyViolation ?? null,
      },
    });
  }
}

export interface SyncResult {
  fetched: number;
  created: number;
}

async function importReview(
  location: { id: string; workspaceId: string },
  review: GbpReview,
  cutoff: number,
): Promise<boolean> {
  const googleReviewId = reviewIdOf(review);
  const values = {
    reviewerName: review.reviewer?.isAnonymous
      ? 'Anonymous'
      : (review.reviewer?.displayName ?? null),
    reviewerPhotoUrl: review.reviewer?.profilePhotoUrl ?? null,
    starRating: STAR_TO_NUMBER[review.starRating] ?? 0,
    comment: review.comment ?? null,
    media: (review.reviewMediaItems ?? []) as Prisma.InputJsonValue,
    createTime: new Date(review.createTime),
    updateTime: review.updateTime ? new Date(review.updateTime) : null,
    lastFetchedAt: new Date(),
    purgedAt: null,
  };
  // Looked up inside this location only, so one workspace's sync can't touch another's reviews.
  const existing = await prisma.review.findUnique({
    where: { locationId_googleReviewId: { locationId: location.id, googleReviewId } },
    select: { id: true },
  });
  const row = existing
    ? await prisma.review.update({ where: { id: existing.id }, data: values })
    : await prisma.review.create({
        data: {
          ...values,
          workspaceId: location.workspaceId,
          locationId: location.id,
          googleReviewId,
        },
      });

  if (review.reviewReply) {
    await applyGoogleReply(location.workspaceId, row.id, review.reviewReply);
  } else if (new Date(review.createTime).getTime() >= cutoff) {
    const hasReply = await prisma.reply.count({ where: { reviewId: row.id } });
    // The drafting row is the to-do item. The job runner picks it up, so a restart loses nothing.
    if (!hasReply)
      await prisma.reply.create({
        data: {
          workspaceId: location.workspaceId,
          reviewId: row.id,
          source: 'ai',
          state: 'drafting',
        },
      });
  }
  return !existing;
}

// One location's failure stays with that location or its connection, never the rest of the workspace.
export async function syncLocation(locationId: string): Promise<SyncResult> {
  const location = await prisma.location.findUnique({ where: { id: locationId } });
  if (!location || location.status !== 'active') return { fetched: 0, created: 0 };

  await prisma.location.update({
    where: { id: locationId },
    data: { lastSyncAttemptAt: new Date() },
  });
  let fetched = 0;
  let created = 0;
  try {
    const { provider, ctx } = await getContext(location.connectionId);
    const cutoff = Date.now() - AUTO_DRAFT_WINDOW_DAYS * 86_400_000;
    let pageToken: string | undefined;
    do {
      const page = await provider.listReviews(
        ctx,
        location.googleAccountName,
        location.googleLocationName,
        pageToken,
      );
      for (const review of page.reviews ?? []) {
        fetched += 1;
        if (await importReview(location, review, cutoff)) created += 1;
      }
      pageToken = page.nextPageToken;
    } while (pageToken);
    await prisma.location.update({
      where: { id: locationId },
      data: { lastSyncedAt: new Date(), lastSyncError: null },
    });
    await prisma.googleConnection.updateMany({
      where: { id: location.connectionId, apiError: { not: null } },
      data: { apiError: null },
    });
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    const message = err instanceof Error ? err.message : 'Sync failed';
    if (status === 401) {
      await markNeedsReconnect(location.connectionId);
    } else if (status === 403 || status === 404) {
      await prisma.location.update({
        where: { id: locationId },
        data: { status: 'access_lost', lastSyncError: message },
      });
    } else if (status === 429) {
      await prisma.googleConnection.update({
        where: { id: location.connectionId },
        data: {
          apiError:
            'Google has not approved API access for this project yet, so we cannot read reviews.',
        },
      });
    } else {
      await prisma.location.update({ where: { id: locationId }, data: { lastSyncError: message } });
    }
  }
  return { fetched, created };
}
