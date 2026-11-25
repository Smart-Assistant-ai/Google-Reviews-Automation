import * as Sentry from '@sentry/node';
import type { JobDefinition } from '../../jobs/runner';
import { prisma } from '../../lib/prisma';
import { billingOn, LIVE_STATUSES, startTrials, syncQuantity } from './service';

const MINUTE = 60_000;

// Locations are switched on and off in several places: choosing them, Google losing access,
// disconnecting an account. Rather than each remembering to tell Stripe, this brings every paying
// workspace's location count in line every few minutes.
export async function syncBillingQuantities(): Promise<void> {
  if (!billingOn()) return;
  const paying = await prisma.subscription.findMany({
    // A deleted workspace's plan is cancelled when it is deleted; there is nothing left to count.
    where: {
      status: { in: LIVE_STATUSES },
      stripeSubscriptionId: { not: null },
      workspace: { deletedAt: null },
    },
    select: { workspaceId: true },
  });
  for (const { workspaceId } of paying) {
    try {
      await syncQuantity(workspaceId);
    } catch (err) {
      // One workspace's problem mustn't hold up the rest. Reported, so it doesn't fail quietly.
      console.warn('[billing] could not update the location count:', (err as Error).message);
      Sentry.captureException(err, { extra: { workspaceId } });
    }
  }
}

export const billingJobs: JobDefinition[] = [
  { name: 'start-trials', everyMs: MINUTE, run: () => startTrials() },
  { name: 'sync-billing-quantities', everyMs: 10 * MINUTE, run: syncBillingQuantities },
];
