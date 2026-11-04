import { prisma } from '../../lib/prisma';

const RETENTION_DAYS = 30;

// Our reading of Google's policy: its content may be kept for 30 days from when we last fetched it.
// Sync refreshes that date for everything Google still lists, so this mostly touches reviews deleted
// from Google or locations whose sync has stopped. Owner-written replies and the numbers stay.
export async function purgeExpiredContent(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 86_400_000);
  const expired = await prisma.review.findMany({
    where: { lastFetchedAt: { lt: cutoff }, purgedAt: null },
    select: { id: true },
    take: 1000,
  });
  const ids = expired.map((review) => review.id);
  if (ids.length === 0) return 0;

  await prisma.$transaction([
    prisma.review.updateMany({
      where: { id: { in: ids } },
      data: { comment: null, reviewerName: null, reviewerPhotoUrl: null, media: [], purgedAt: now },
    }),
    prisma.reply.updateMany({ where: { reviewId: { in: ids }, source: 'google' }, data: { text: '' } }),
  ]);
  return ids.length;
}
