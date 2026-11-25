import { PRICING, type BillingInterval } from '@replypilot/shared';
import Stripe from 'stripe';
import { env } from '../config';
import { APP_TAG, PRICE_LOOKUP_KEYS, stripe } from '../modules/billing/stripe';

// Sets up a Stripe account for ReplyPilot. Run it once with the test key, and once with the live
// key at launch. Running it again changes nothing that is already there.
//   pnpm --filter @replypilot/api stripe:setup
//   pnpm --filter @replypilot/api stripe:setup --webhook-url https://your-domain/api/v1/billing/webhook
//
// It makes the ReplyPilot product, a monthly and a yearly price from the numbers in PRICING, and
// the customer portal settings. With --webhook-url it also adds the webhook endpoint and prints
// its signing secret, which Stripe shows only once.

const WEBHOOK_EVENTS: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
  'invoice.paid',
  'invoice.payment_failed',
];

const cents = (dollars: number) => Math.round(dollars * 100);

async function findOrCreateProduct(client: Stripe): Promise<Stripe.Product> {
  for await (const product of client.products.list({ active: true, limit: 100 })) {
    if (product.metadata?.app === APP_TAG) return product;
  }
  return client.products.create({
    name: 'ReplyPilot',
    description: 'AI reply drafts for Google reviews, priced by connected location.',
    metadata: { app: APP_TAG },
  });
}

async function findOrCreatePrice(
  client: Stripe,
  product: Stripe.Product,
  interval: BillingInterval,
): Promise<{ price: Stripe.Price; created: boolean }> {
  const lookupKey = PRICE_LOOKUP_KEYS[interval];
  const { data } = await client.prices.list({ lookup_keys: [lookupKey], limit: 1 });
  if (data[0]) return { price: data[0], created: false };
  const months = interval === 'year' ? PRICING.yearlyMonths : 1;
  const price = await client.prices.create({
    product: product.id,
    currency: 'usd',
    lookup_key: lookupKey,
    nickname: interval === 'year' ? 'ReplyPilot yearly' : 'ReplyPilot monthly',
    recurring: { interval, usage_type: 'licensed' },
    billing_scheme: 'tiered',
    tiers_mode: 'graduated',
    // Graduated: each location is charged at the rate of the band it falls in.
    tiers: [
      { up_to: 1, unit_amount: cents(PRICING.firstLocation * months) },
      { up_to: PRICING.cutoff, unit_amount: cents(PRICING.upToCutoff * months) },
      { up_to: 'inf', unit_amount: cents(PRICING.afterCutoff * months) },
    ],
    metadata: { app: APP_TAG },
  });
  return { price, created: true };
}

async function ensurePortal(
  client: Stripe,
  product: Stripe.Product,
  prices: Stripe.Price[],
): Promise<{ id: string; created: boolean }> {
  for await (const config of client.billingPortal.configurations.list({
    active: true,
    limit: 100,
  })) {
    if (config.metadata?.app === APP_TAG) return { id: config.id, created: false };
  }
  // Stripe wants public links here, so they are left out on a machine without one.
  const links = env.APP_URL.startsWith('https://')
    ? {
        privacy_policy_url: `${env.APP_URL}/privacy`,
        terms_of_service_url: `${env.APP_URL}/terms`,
      }
    : {};
  const config = await client.billingPortal.configurations.create({
    business_profile: { headline: 'Manage your ReplyPilot plan', ...links },
    features: {
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      customer_update: { enabled: true, allowed_updates: ['email', 'name', 'address', 'tax_id'] },
      subscription_cancel: {
        enabled: true,
        mode: 'at_period_end',
        cancellation_reason: {
          enabled: true,
          options: ['too_expensive', 'missing_features', 'switched_service', 'unused', 'other'],
        },
      },
      // Monthly and yearly only. The number of locations follows what is connected in the app.
      subscription_update: {
        enabled: true,
        default_allowed_updates: ['price'],
        proration_behavior: 'create_prorations',
        products: [{ product: product.id, prices: prices.map((price) => price.id) }],
      },
    },
    metadata: { app: APP_TAG },
  });
  return { id: config.id, created: true };
}

async function ensureWebhook(client: Stripe, url: string): Promise<void> {
  for await (const endpoint of client.webhookEndpoints.list({ limit: 100 })) {
    if (endpoint.url === url) {
      console.log(`Webhook for ${url} already exists (${endpoint.id}).`);
      console.log('Its signing secret is in the Stripe dashboard, under Developers, Webhooks.');
      if (endpoint.api_version !== Stripe.API_VERSION) {
        console.log(
          `It sends events in Stripe API version ${endpoint.api_version ?? 'the account default'}, ` +
            `but ReplyPilot reads ${Stripe.API_VERSION}. Delete it in the dashboard and run this again.`,
        );
      }
      return;
    }
  }
  // Events arrive in the endpoint's API version. Pinning it to the SDK's version means they match
  // the fields the app reads, whatever version the Stripe account itself defaults to.
  const endpoint = await client.webhookEndpoints.create({
    url,
    api_version: Stripe.API_VERSION,
    enabled_events: WEBHOOK_EVENTS,
    description: 'ReplyPilot subscriptions',
    metadata: { app: APP_TAG },
  });
  console.log(`Webhook created for ${url}.`);
  console.log(`Put this in the server's .env as STRIPE_WEBHOOK_SECRET: ${endpoint.secret}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((arg) => arg !== '--');
  const webhookAt = args.indexOf('--webhook-url');
  const webhookUrl = webhookAt === -1 ? undefined : args[webhookAt + 1];
  if (webhookAt !== -1 && !webhookUrl?.startsWith('https://')) {
    console.log(
      'Usage: pnpm stripe:setup [--webhook-url https://your-domain/api/v1/billing/webhook]',
    );
    process.exitCode = 1;
    return;
  }

  const client = stripe();
  const mode = env.STRIPE_SECRET_KEY?.includes('_live_') ? 'LIVE' : 'test';
  console.log(`Setting up ReplyPilot in Stripe (${mode} mode).`);

  const product = await findOrCreateProduct(client);
  console.log(`Product: ${product.name} (${product.id})`);
  const prices: Stripe.Price[] = [];
  for (const interval of ['month', 'year'] as const) {
    const { price, created } = await findOrCreatePrice(client, product, interval);
    prices.push(price);
    console.log(`${created ? 'Created' : 'Found'} ${interval}ly price ${price.id}`);
  }
  const portal = await ensurePortal(client, product, prices);
  console.log(`${portal.created ? 'Created' : 'Found'} customer portal settings ${portal.id}`);
  if (webhookUrl) await ensureWebhook(client, webhookUrl);
  console.log('Done. Set BILLING_PROVIDER=stripe in the API .env to switch billing on.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
