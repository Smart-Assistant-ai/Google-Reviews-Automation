import type { Review as ReviewDto, ReviewList, ReviewStatus, ReviewTab } from '@replypilot/shared';
import type { Prisma, Reply, Review } from '@prisma/client';
import { notFound } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import {
  accessibleLocationIds,
  assertLocationAccess,
  type MemberContext,
} from '../workspaces/access';

const BACKLOG_DAYS = 30;
const backlogCutoff = () => new Date(Date.now() - BACKLOG_DAYS * 86_400_000);

type ReviewRow = Review & { reply: Reply | null; location: { id: string; title: string } };

const REPLY_STATUS: Record<Reply['state'], ReviewStatus> = {
  drafting: 'drafting',
  draft: 'draft',
  posting: 'posting',
  pending_google: 'pending',
  live: 'live',
  rejected: 'rejected',
  failed: 'failed',
};

function statusOf(review: ReviewRow): ReviewStatus {
  if (review.reply) return REPLY_STATUS[review.reply.state];
  return review.createTime < backlogCutoff() ? 'backlog' : 'needs_reply';
}

export function reviewDto(review: ReviewRow): ReviewDto {
  const { reply } = review;
  return {
    id: review.id,
    location: { id: review.location.id, title: review.location.title },
    reviewerName: review.reviewerName,
    reviewerPhotoUrl: review.reviewerPhotoUrl,
    starRating: review.starRating,
    comment: review.comment,
    media: review.media as unknown[],
    createTime: review.createTime.toISOString(),
    language: review.language,
    sentiment: review.sentiment,
    topics: review.topics as string[],
    status: statusOf(review),
    purged: review.purgedAt !== null,
    reply: reply
      ? {
          id: reply.id,
          text: reply.text,
          source: reply.source,
          state: reply.state,
          googleReplyState: reply.googleReplyState,
          policyViolation: reply.policyViolation,
          error: reply.error,
          postedAt: reply.postedAt?.toISOString() ?? null,
        }
      : null,
  };
}

function tabFilter(tab: ReviewTab): Prisma.ReviewWhereInput {
  const cutoff = backlogCutoff();
  switch (tab) {
    case 'todo':
      return {
        OR: [
          { reply: { is: null }, createTime: { gte: cutoff } },
          { reply: { is: { state: { in: ['drafting', 'draft', 'rejected', 'failed'] } } } },
        ],
      };
    case 'posted':
      return { reply: { is: { state: { in: ['posting', 'pending_google', 'live'] } } } };
    case 'backlog':
      return { reply: { is: null }, createTime: { lt: cutoff } };
    default:
      return {};
  }
}

export interface ListOptions {
  locationId?: string;
  tab: ReviewTab;
  stars?: string;
  q?: string;
  page: number;
  pageSize: number;
}

// Filtering and counting happen in the database, so a business with thousands of reviews stays fast.
export async function listReviews(
  member: MemberContext,
  options: ListOptions,
): Promise<ReviewList> {
  if (options.locationId) await assertLocationAccess(member, options.locationId);
  const locationIds = options.locationId
    ? [options.locationId]
    : await accessibleLocationIds(member);

  const base: Prisma.ReviewWhereInput = {
    workspaceId: member.workspaceId,
    locationId: { in: locationIds },
    location: { status: { not: 'available' } },
    ...(options.stars ? { starRating: { in: options.stars.split(',').map(Number) } } : {}),
    ...(options.q
      ? {
          AND: [
            {
              OR: [
                { comment: { contains: options.q, mode: 'insensitive' } },
                { reviewerName: { contains: options.q, mode: 'insensitive' } },
              ],
            },
          ],
        }
      : {}),
  };

  const count = (tab: ReviewTab) => prisma.review.count({ where: { ...base, ...tabFilter(tab) } });
  const [rows, todo, posted, backlog, all] = await Promise.all([
    prisma.review.findMany({
      where: { ...base, ...tabFilter(options.tab) },
      include: { reply: true, location: { select: { id: true, title: true } } },
      orderBy: { createTime: 'desc' },
      skip: (options.page - 1) * options.pageSize,
      take: options.pageSize,
    }),
    count('todo'),
    count('posted'),
    count('backlog'),
    count('all'),
  ]);

  const counts = { todo, posted, backlog, all };
  return {
    reviews: rows.map(reviewDto),
    counts,
    page: options.page,
    pageSize: options.pageSize,
    total: counts[options.tab],
  };
}

// Goes through the access rule, so another workspace or an out-of-scope location answers 404.
export async function loadReview(member: MemberContext, reviewId: string) {
  const review = await prisma.review.findFirst({
    where: { id: reviewId, workspaceId: member.workspaceId },
    include: { reply: true, location: { include: { connection: true } } },
  });
  if (!review) throw notFound('Review not found');
  const allowed = await accessibleLocationIds(member);
  if (!allowed.includes(review.locationId)) throw notFound('Review not found');
  return review;
}

export async function getReview(member: MemberContext, reviewId: string): Promise<ReviewDto> {
  return reviewDto(await loadReview(member, reviewId));
}
