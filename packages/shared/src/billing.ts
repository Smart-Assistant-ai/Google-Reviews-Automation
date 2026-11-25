import { z } from 'zod';

// The prices ReplyPilot charges, in US dollars. The Stripe prices are made from these numbers
// (pnpm --filter @replypilot/api stripe:setup), and the web app shows them, so both say the same.
// A business pays by the number of locations it connects: the first at one price, the next few
// at a lower one, and every one after that at the lowest.
export const PRICING = {
  trialDays: 14,
  firstLocation: 19,
  upToCutoff: 9,
  afterCutoff: 5,
  // The last location charged the middle price.
  cutoff: 10,
  // A year costs this many months.
  yearlyMonths: 10,
} as const;

export const billingIntervalSchema = z.enum(['month', 'year']);
export type BillingInterval = z.infer<typeof billingIntervalSchema>;

// What a workspace pays for this many locations, in whole dollars.
export function planTotal(locations: number, interval: BillingInterval): number {
  const count = Math.max(1, Math.floor(locations));
  const middle = Math.min(count, PRICING.cutoff) - 1;
  const after = Math.max(0, count - PRICING.cutoff);
  const monthly = PRICING.firstLocation + middle * PRICING.upToCutoff + after * PRICING.afterCutoff;
  return interval === 'year' ? monthly * PRICING.yearlyMonths : monthly;
}

// free: billing is switched off on this server, so everything is allowed, as before billing.
// trial: inside the free trial. active: a paid plan, or one chosen during the trial that starts
// billing when the trial ends. past_due: a payment failed and Stripe is retrying; still allowed.
// lapsed: the trial ended or the plan stopped. The workspace can read but not draft or post.
export const billingStateSchema = z.enum(['free', 'trial', 'active', 'past_due', 'lapsed']);
export type BillingState = z.infer<typeof billingStateSchema>;

export const billingStatusSchema = z.object({
  state: billingStateSchema,
  // Whether replies can be drafted and posted.
  canWrite: z.boolean(),
  // Empty while billing is switched off, before any trial has started.
  trialEndsAt: z.string().nullable(),
  // Locations connected now, which is what the plan charges for.
  locations: z.number().int(),
  plan: z
    .object({
      interval: billingIntervalSchema.nullable(),
      // Locations Stripe is charging for. Brought in line with `locations` within minutes.
      quantity: z.number().int().nullable(),
      // Stripe's own word, such as active, trialing, past_due or canceled.
      status: z.string(),
      // When the plan next renews, or ends if it is cancelled.
      renewsAt: z.string().nullable(),
      cancelAtPeriodEnd: z.boolean(),
    })
    .nullable(),
});
export type BillingStatus = z.infer<typeof billingStatusSchema>;

export const checkoutBody = z.object({ interval: billingIntervalSchema });
export const confirmCheckoutBody = z.object({ sessionId: z.string().min(1).max(255) });
export const billingRedirectSchema = z.object({ url: z.string().url() });
