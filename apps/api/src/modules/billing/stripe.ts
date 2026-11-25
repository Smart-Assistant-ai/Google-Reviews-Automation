import type { BillingInterval } from '@replypilot/shared';
import Stripe from 'stripe';
import { env } from '../../config';
import { HttpError } from '../../lib/errors';

// Prices are found by these keys, which `pnpm stripe:setup` gives them. A price change is a new
// price under a new key; people already subscribed stay on the old one until they are moved.
export const PRICE_LOOKUP_KEYS: Record<BillingInterval, string> = {
  month: 'replypilot_month_v1',
  year: 'replypilot_year_v1',
};

// Marks what belongs to ReplyPilot in a Stripe account that other products may share.
export const APP_TAG = 'replypilot';

let client: Stripe | null = null;
const priceIds = new Map<BillingInterval, string>();
let portalConfigId: string | null | undefined;

// The SDK pins the Stripe API version it was built for, so its types match what Stripe sends.
export function stripe(): Stripe {
  if (!client) {
    if (!env.STRIPE_SECRET_KEY) {
      throw new HttpError(503, 'Billing is not set up on this server', 'billing_off');
    }
    client = new Stripe(env.STRIPE_SECRET_KEY, {
      maxNetworkRetries: 2,
      appInfo: { name: 'ReplyPilot' },
    });
  }
  return client;
}

// Tests swap in a client whose network calls are stubbed.
export function setStripeClient(next: Stripe | null): void {
  client = next;
  priceIds.clear();
  portalConfigId = undefined;
}

export async function priceId(interval: BillingInterval): Promise<string> {
  const known = priceIds.get(interval);
  if (known) return known;
  const { data } = await stripe().prices.list({
    lookup_keys: [PRICE_LOOKUP_KEYS[interval]],
    active: true,
    limit: 1,
  });
  const price = data[0];
  if (!price) {
    throw new HttpError(
      503,
      'Plans are not set up in Stripe yet. Run pnpm --filter @replypilot/api stripe:setup.',
      'billing_not_set_up',
    );
  }
  priceIds.set(interval, price.id);
  return price.id;
}

// The customer portal settings `stripe:setup` made. Without them Stripe uses the account's
// default settings, which another product may have chosen.
export async function portalConfiguration(): Promise<string | undefined> {
  if (portalConfigId === undefined) {
    const { data } = await stripe().billingPortal.configurations.list({ active: true, limit: 100 });
    portalConfigId = data.find((config) => config.metadata?.app === APP_TAG)?.id ?? null;
  }
  return portalConfigId ?? undefined;
}

// Stripe fields that may hold an id or the expanded object.
export const idOf = (value: string | { id: string }): string =>
  typeof value === 'string' ? value : value.id;
