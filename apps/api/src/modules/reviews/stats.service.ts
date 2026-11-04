import type { Stats } from '@replypilot/shared';
import { prisma } from '../../lib/prisma';
import { accessibleLocationIds, assertLocationAccess, type MemberContext } from '../workspaces/access';

const DAY = 86_400_000;

function weekStart(date: Date): string {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

const average = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
const round = (value: number | null, places = 1) => (value === null ? null : Math.round(value * 10 ** places) / 10 ** places);

export async function overview(member: MemberContext, options: { days: number; locationId?: string }): Promise<Stats> {
  if (options.locationId) await assertLocationAccess(member, options.locationId);
  const locationIds = options.locationId ? [options.locationId] : await accessibleLocationIds(member);

  const since = new Date(Date.now() - options.days * DAY);
  const prevSince = new Date(since.getTime() - options.days * DAY);
  const reviews = await prisma.review.findMany({
    where: { locationId: { in: locationIds }, createTime: { gte: since } },
    select: {
      starRating: true,
      createTime: true,
      sentiment: true,
      topics: true,
      reply: { select: { state: true, postedAt: true } },
    },
    orderBy: { createTime: 'asc' },
  });
  const previous = await prisma.review.findMany({
    where: { locationId: { in: locationIds }, createTime: { gte: prevSince, lt: since } },
    select: { starRating: true },
  });

  const replied = reviews.filter((r) => r.reply && ['pending_google', 'live'].includes(r.reply.state));
  const responseHours = replied
    .filter((r) => r.reply?.postedAt)
    .map((r) => (r.reply!.postedAt!.getTime() - r.createTime.getTime()) / 3_600_000)
    .filter((hours) => hours >= 0);

  type Week = { week: string; 1: number; 2: number; 3: number; 4: number; 5: number; ratings: number[] };
  const weeks = new Map<string, Week>();
  for (const review of reviews) {
    const key = weekStart(review.createTime);
    const week = weeks.get(key) ?? { week: key, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, ratings: [] };
    if (review.starRating >= 1 && review.starRating <= 5) week[review.starRating as 1 | 2 | 3 | 4 | 5] += 1;
    week.ratings.push(review.starRating);
    weeks.set(key, week);
  }
  const weekly = [...weeks.values()].map(({ ratings, ...week }) => ({ ...week, avgRating: round(average(ratings), 2), total: ratings.length }));

  const sentiment = { positive: 0, neutral: 0, negative: 0 };
  const topics = new Map<string, { topic: string; positive: number; negative: number; neutral: number }>();
  for (const review of reviews) {
    const mood = (review.sentiment ?? 'neutral') as keyof typeof sentiment;
    if (review.sentiment) sentiment[mood] += 1;
    for (const topic of (review.topics as string[]) ?? []) {
      const row = topics.get(topic) ?? { topic, positive: 0, negative: 0, neutral: 0 };
      row[mood] += 1;
      topics.set(topic, row);
    }
  }

  const avgRating = average(reviews.map((r) => r.starRating));
  const prevAvg = average(previous.map((r) => r.starRating));
  return {
    rangeDays: options.days,
    kpis: {
      avgRating: round(avgRating, 2),
      avgRatingDelta: avgRating !== null && prevAvg !== null ? round(avgRating - prevAvg, 2) : null,
      totalReviews: reviews.length,
      previousTotal: previous.length,
      responseRate: reviews.length ? Math.round((replied.length / reviews.length) * 100) : null,
      avgResponseHours: round(average(responseHours)),
      awaitingReply: reviews.filter((r) => !r.reply || ['drafting', 'draft', 'failed', 'rejected'].includes(r.reply.state)).length,
    },
    starDistribution: [5, 4, 3, 2, 1].map((stars) => ({ stars, count: reviews.filter((r) => r.starRating === stars).length })),
    weekly,
    sentiment,
    topics: [...topics.values()]
      .sort((a, b) => b.positive + b.negative + b.neutral - (a.positive + a.negative + a.neutral))
      .slice(0, 8),
  };
}
