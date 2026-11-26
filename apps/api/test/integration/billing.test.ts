import * as Sentry from '@sentry/node';
import type { FastifyInstance } from 'fastify';
import Stripe from 'stripe';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../../src/config';
import { prisma } from '../../src/lib/prisma';
import { purgeStripeEvents, syncBillingQuantities } from '../../src/modules/billing/jobs';
import { startTrials } from '../../src/modules/billing/service';
import { setStripeClient } from '../../src/modules/billing/stripe';
import { runDraftQueue } from '../../src/modules/reviews/jobs';
import {
  PASSWORD,
  signup,
  testApp,
  tokenFromEmail,
  uniqueEmail,
  type TestUser,
} from '../helpers/app';
import { resetDb } from '../helpers/db';
import { verifyEmail } from '../helpers/google';
import { addLocation } from '../helpers/seed-location';

// Sentry's reports are watched, so a test can check when one was raised.
vi.mock('@sentry/node', async (original) => ({
  ...(await original<typeof import('@sentry/node')>()),
  captureMessage: vi.fn(),
}));

// Billing runs against a real Stripe client whose network calls are stubbed, so the signature
// checks are Stripe's own code and nothing reaches Stripe.
const WEBHOOK_SECRET = 'whsec_test_replypilot';
const DAY = 24 * 60 * 60 * 1000;

let app: FastifyInstance;
let fake: Stripe;

beforeAll(async () => {
  app = await testApp();
});
afterAll(() => app.close());
beforeEach(async () => {
  await resetDb();
  env.SIGNUP_MODE = 'open';
  env.BILLING_PROVIDER = 'stripe';
  env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
  fake = new Stripe('sk_test_not_a_real_key');
  setStripeClient(fake);
  vi.spyOn(fake.prices, 'list').mockImplementation(((params: { lookup_keys: string[] }) =>
    Promise.resolve({
      data: [{ id: params.lookup_keys[0]!.includes('year') ? 'price_year' : 'price_month' }],
    })) as never);
  vi.spyOn(fake.checkout.sessions, 'expire').mockResolvedValue({} as never);
  vi.spyOn(fake.subscriptions, 'list').mockResolvedValue({ data: [] } as never);
});
afterEach(() => {
  env.BILLING_PROVIDER = 'off';
  env.STRIPE_WEBHOOK_SECRET = '';
  setStripeClient(null);
  vi.restoreAllMocks();
});

const call = (
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  user?: TestUser,
  payload?: object,
) => app.inject({ method, url: `/api/v1${url}`, headers: user?.headers, payload });

const status = async (user: TestUser) =>
  (await call('GET', `/workspaces/${user.workspaceId}/billing`, user)).json();

const endTrial = (workspaceId: string) =>
  prisma.workspace.update({
    where: { id: workspaceId },
    data: { trialEndsAt: new Date(Date.now() - DAY) },
  });

async function reviewWithDraft(workspaceId: string, state: 'draft' | 'drafting' = 'draft') {
  const location = await addLocation(workspaceId);
  const review = await prisma.review.create({
    data: {
      workspaceId,
      locationId: location.id,
      googleReviewId: `r-${Date.now()}-${Math.random()}`,
      reviewerName: 'Sam P.',
      starRating: 5,
      comment: 'Quick service and friendly staff.',
      createTime: new Date(),
    },
  });
  await prisma.reply.create({
    data: {
      workspaceId,
      reviewId: review.id,
      text: state === 'draft' ? 'Thank you, Sam!' : '',
      source: 'ai',
      state,
    },
  });
  return review;
}

// A subscription as Stripe returns it, with only the fields ReplyPilot reads.
function subscription(
  fields: {
    id?: string;
    status?: string;
    customer?: string;
    workspaceId?: string;
    quantity?: number;
    interval?: 'month' | 'year';
    // A plan from another product sharing the Stripe account.
    otherProduct?: boolean;
  } = {},
) {
  const interval = fields.interval ?? 'month';
  return {
    id: fields.id ?? 'sub_1',
    object: 'subscription',
    customer: fields.customer ?? 'cus_1',
    status: fields.status ?? 'active',
    metadata: fields.workspaceId ? { workspaceId: fields.workspaceId } : {},
    cancel_at_period_end: false,
    cancel_at: null,
    items: {
      data: [
        {
          id: 'si_1',
          quantity: fields.quantity ?? 1,
          current_period_end: Math.floor((Date.now() + 30 * DAY) / 1000),
          price: fields.otherProduct
            ? {
                id: 'price_other',
                lookup_key: 'other_app_pro',
                metadata: {},
                recurring: { interval },
              }
            : {
                id: `price_${interval}`,
                lookup_key: `replypilot_${interval}_v1`,
                metadata: { app: 'replypilot' },
                recurring: { interval },
              },
        },
      ],
    },
  };
}

function signedEvent(event: { id: string; type: string; object: object }) {
  const payload = JSON.stringify({
    id: event.id,
    object: 'event',
    type: event.type,
    data: { object: event.object },
  });
  const header = fake.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
  return { payload, header };
}

const sendWebhook = (payload: string, signature: string) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/billing/webhook',
    headers: { 'content-type': 'application/json', 'stripe-signature': signature },
    payload,
  });

async function invite(owner: TestUser, role: 'admin' | 'member') {
  const email = uniqueEmail(role);
  await call('POST', `/workspaces/${owner.workspaceId}/invitations`, owner, { email, role });
  return signup(app, { email, inviteToken: tokenFromEmail(email, '/invite') });
}

describe('with billing switched off', () => {
  it('keeps everything free, as before billing', async () => {
    env.BILLING_PROVIDER = 'off';
    const owner = await signup(app);
    await endTrial(owner.workspaceId);
    const body = await status(owner);
    expect(body.state).toBe('free');
    expect(body.canWrite).toBe(true);
    const review = await reviewWithDraft(owner.workspaceId);
    const res = await call(
      'PUT',
      `/workspaces/${owner.workspaceId}/reviews/${review.id}/reply`,
      owner,
      {
        text: 'Thanks so much!',
      },
    );
    expect(res.statusCode).toBe(200);
  });
});

describe('the free trial', () => {
  it('starts when billing is switched on, not at sign-up', async () => {
    env.BILLING_PROVIDER = 'off';
    const owner = await signup(app);
    const before = await prisma.workspace.findUniqueOrThrow({ where: { id: owner.workspaceId } });
    expect(before.trialEndsAt).toBeNull();

    env.BILLING_PROVIDER = 'stripe';
    const body = await status(owner);
    expect(body.state).toBe('trial');
    expect((Date.parse(body.trialEndsAt) - Date.now()) / DAY).toBeGreaterThan(13.9);
  });

  it('gives every workspace waiting for a trial its 14 days, and leaves started ones alone', async () => {
    const waiting = await signup(app);
    const started = await signup(app);
    const end = new Date(Date.now() + 3 * DAY);
    await prisma.workspace.update({
      where: { id: started.workspaceId },
      data: { trialEndsAt: end },
    });

    await startTrials();
    const [a, b] = await Promise.all([
      prisma.workspace.findUniqueOrThrow({ where: { id: waiting.workspaceId } }),
      prisma.workspace.findUniqueOrThrow({ where: { id: started.workspaceId } }),
    ]);
    expect((a.trialEndsAt!.getTime() - Date.now()) / DAY).toBeGreaterThan(13.9);
    expect(b.trialEndsAt).toEqual(end);
  });

  it('writes drafts for a workspace whose trial has not started yet', async () => {
    const owner = await signup(app);
    const review = await reviewWithDraft(owner.workspaceId, 'drafting');
    await runDraftQueue();
    expect((await prisma.reply.findUniqueOrThrow({ where: { reviewId: review.id } })).state).toBe(
      'draft',
    );
  });

  it('gives a new workspace 14 days', async () => {
    const owner = await signup(app);
    const body = await status(owner);
    expect(body.state).toBe('trial');
    expect(body.canWrite).toBe(true);
    const days = (Date.parse(body.trialEndsAt) - Date.now()) / DAY;
    expect(days).toBeGreaterThan(13.9);
    expect(days).toBeLessThanOrEqual(14);
  });

  it('leaves a workspace able to read but not draft or post once it ends', async () => {
    const owner = await signup(app);
    await verifyEmail(app, owner);
    const review = await reviewWithDraft(owner.workspaceId);
    await endTrial(owner.workspaceId);

    const body = await status(owner);
    expect(body).toMatchObject({ state: 'lapsed', canWrite: false });
    const base = `/workspaces/${owner.workspaceId}/reviews/${review.id}`;
    expect((await call('GET', base, owner)).statusCode).toBe(200);
    for (const [method, url, payload] of [
      ['PUT', `${base}/reply`, { text: 'Thanks so much!' }],
      ['POST', `${base}/reply/regenerate`, {}],
      ['POST', `${base}/reply/post`, { text: 'Thanks so much!' }],
    ] as const) {
      const res = await call(method, url, owner, payload);
      expect(res.statusCode).toBe(402);
      expect(res.json().error.code).toBe('plan_required');
    }
    // Nothing was lost.
    expect((await prisma.reply.findUniqueOrThrow({ where: { reviewId: review.id } })).text).toBe(
      'Thank you, Sam!',
    );
  });

  it('holds new drafts for a lapsed workspace, and writes them once it subscribes', async () => {
    const owner = await signup(app);
    const review = await reviewWithDraft(owner.workspaceId, 'drafting');
    await endTrial(owner.workspaceId);

    await runDraftQueue();
    expect((await prisma.reply.findUniqueOrThrow({ where: { reviewId: review.id } })).state).toBe(
      'drafting',
    );

    await prisma.subscription.create({
      data: { workspaceId: owner.workspaceId, stripeCustomerId: 'cus_1', status: 'active' },
    });
    await runDraftQueue();
    expect((await prisma.reply.findUniqueOrThrow({ where: { reviewId: review.id } })).state).toBe(
      'draft',
    );
  });
});

describe('choosing a plan', () => {
  it('lets only the owner open checkout', async () => {
    const owner = await signup(app);
    const admin = await invite(owner, 'admin');
    const res = await call('POST', `/workspaces/${owner.workspaceId}/billing/checkout`, admin, {
      interval: 'month',
    });
    expect(res.statusCode).toBe(403);
  });

  it("charges for the connected locations at Stripe's price, and keeps the rest of the trial", async () => {
    const owner = await signup(app);
    await addLocation(owner.workspaceId, 'North');
    await addLocation(owner.workspaceId, 'South');
    const createCustomer = vi
      .spyOn(fake.customers, 'create')
      .mockResolvedValue({ id: 'cus_1' } as never);
    const createSession = vi
      .spyOn(fake.checkout.sessions, 'create')
      .mockResolvedValue({ url: 'https://checkout.stripe.com/c/pay/cs_test_1' } as never);

    const res = await call('POST', `/workspaces/${owner.workspaceId}/billing/checkout`, owner, {
      interval: 'year',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().url).toBe('https://checkout.stripe.com/c/pay/cs_test_1');

    const [customer, customerOptions] = createCustomer.mock.calls[0]!;
    expect(customer).toMatchObject({
      email: owner.email,
      metadata: { workspaceId: owner.workspaceId },
    });
    expect(customerOptions).toEqual({ idempotencyKey: `replypilot-customer-${owner.workspaceId}` });

    const session = createSession.mock.calls[0]![0]!;
    const workspace = await prisma.workspace.findUniqueOrThrow({
      where: { id: owner.workspaceId },
    });
    expect(session).toMatchObject({
      mode: 'subscription',
      customer: 'cus_1',
      client_reference_id: owner.workspaceId,
      line_items: [{ price: 'price_year', quantity: 2 }],
      adaptive_pricing: { enabled: false },
      subscription_data: {
        metadata: { workspaceId: owner.workspaceId },
        trial_end: Math.floor(workspace.trialEndsAt!.getTime() / 1000),
      },
    });

    // A second visit reuses the same customer.
    await call('POST', `/workspaces/${owner.workspaceId}/billing/checkout`, owner, {
      interval: 'month',
    });
    expect(createCustomer).toHaveBeenCalledTimes(1);
  });

  it('starts billing at once when the trial has ended', async () => {
    const owner = await signup(app);
    await endTrial(owner.workspaceId);
    vi.spyOn(fake.customers, 'create').mockResolvedValue({ id: 'cus_1' } as never);
    const createSession = vi
      .spyOn(fake.checkout.sessions, 'create')
      .mockResolvedValue({ url: 'https://checkout.stripe.com/c/pay/cs_test_2' } as never);
    await call('POST', `/workspaces/${owner.workspaceId}/billing/checkout`, owner, {
      interval: 'month',
    });
    const session = createSession.mock.calls[0]![0]!;
    expect(session.subscription_data).not.toHaveProperty('trial_end');
    expect(session.line_items).toEqual([{ price: 'price_month', quantity: 1 }]);
  });

  it('closes the previous checkout when a new one opens, so both cannot be paid', async () => {
    const owner = await signup(app);
    vi.spyOn(fake.customers, 'create').mockResolvedValue({ id: 'cus_1' } as never);
    vi.spyOn(fake.checkout.sessions, 'create')
      .mockResolvedValueOnce({ id: 'cs_1', url: 'https://checkout.stripe.com/c/pay/cs_1' } as never)
      .mockResolvedValueOnce({
        id: 'cs_2',
        url: 'https://checkout.stripe.com/c/pay/cs_2',
      } as never);
    const expire = vi.spyOn(fake.checkout.sessions, 'expire');

    await call('POST', `/workspaces/${owner.workspaceId}/billing/checkout`, owner, {
      interval: 'month',
    });
    expect(expire).not.toHaveBeenCalled();
    await call('POST', `/workspaces/${owner.workspaceId}/billing/checkout`, owner, {
      interval: 'year',
    });
    expect(expire).toHaveBeenCalledWith('cs_1');
  });

  it("doesn't open a second checkout for a workspace that already pays", async () => {
    const owner = await signup(app);
    await prisma.subscription.create({
      data: { workspaceId: owner.workspaceId, stripeCustomerId: 'cus_1', status: 'active' },
    });
    const res = await call('POST', `/workspaces/${owner.workspaceId}/billing/checkout`, owner, {
      interval: 'month',
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('already_subscribed');
  });

  it('shows the plan as soon as the owner is back from Stripe', async () => {
    const owner = await signup(app);
    await prisma.subscription.create({
      data: { workspaceId: owner.workspaceId, stripeCustomerId: 'cus_1' },
    });
    vi.spyOn(fake.checkout.sessions, 'retrieve').mockResolvedValue({
      client_reference_id: owner.workspaceId,
      subscription: 'sub_1',
    } as never);
    vi.spyOn(fake.subscriptions, 'retrieve').mockResolvedValue(
      subscription({ status: 'trialing', interval: 'year' }) as never,
    );

    const res = await call(
      'POST',
      `/workspaces/${owner.workspaceId}/billing/checkout/confirm`,
      owner,
      {
        sessionId: 'cs_test_1',
      },
    );
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      state: 'active',
      canWrite: true,
      plan: { interval: 'year', quantity: 1, status: 'trialing', cancelAtPeriodEnd: false },
    });
  });

  it("won't confirm another workspace's checkout", async () => {
    const owner = await signup(app);
    vi.spyOn(fake.checkout.sessions, 'retrieve').mockResolvedValue({
      client_reference_id: '00000000-0000-4000-8000-000000000000',
      subscription: 'sub_1',
    } as never);
    const res = await call(
      'POST',
      `/workspaces/${owner.workspaceId}/billing/checkout/confirm`,
      owner,
      {
        sessionId: 'cs_test_other',
      },
    );
    expect(res.statusCode).toBe(404);
  });

  it("opens Stripe's portal with ReplyPilot's own settings", async () => {
    const owner = await signup(app);
    await prisma.subscription.create({
      data: { workspaceId: owner.workspaceId, stripeCustomerId: 'cus_1', status: 'active' },
    });
    vi.spyOn(fake.billingPortal.configurations, 'list').mockResolvedValue({
      data: [
        { id: 'bpc_other', metadata: {} },
        { id: 'bpc_replypilot', metadata: { app: 'replypilot' } },
      ],
    } as never);
    const createPortal = vi
      .spyOn(fake.billingPortal.sessions, 'create')
      .mockResolvedValue({ url: 'https://billing.stripe.com/p/session/test_1' } as never);

    const res = await call('POST', `/workspaces/${owner.workspaceId}/billing/portal`, owner);
    expect(res.json().url).toBe('https://billing.stripe.com/p/session/test_1');
    expect(createPortal.mock.calls[0]![0]).toMatchObject({
      customer: 'cus_1',
      configuration: 'bpc_replypilot',
      return_url: `${env.APP_URL}/settings?tab=billing&from=portal`,
    });
  });

  it("shows a change made on Stripe's portal as soon as the owner is back", async () => {
    const owner = await signup(app);
    await prisma.subscription.create({
      data: {
        workspaceId: owner.workspaceId,
        stripeCustomerId: 'cus_1',
        stripeSubscriptionId: 'sub_1',
        status: 'trialing',
        interval: 'month',
        quantity: 1,
      },
    });
    // Switched to yearly and cancelled on Stripe's page; the webhook hasn't arrived yet.
    const switched = { ...subscription({ interval: 'year' }), cancel_at_period_end: true };
    const retrieve = vi.spyOn(fake.subscriptions, 'retrieve').mockResolvedValue(switched as never);

    const res = await call('POST', `/workspaces/${owner.workspaceId}/billing/refresh`, owner);
    expect(res.statusCode).toBe(200);
    expect(retrieve).toHaveBeenCalledWith('sub_1');
    expect(res.json().plan).toMatchObject({
      interval: 'year',
      status: 'active',
      cancelAtPeriodEnd: true,
    });
  });

  it('has nothing to read back for a workspace that never chose a plan', async () => {
    const owner = await signup(app);
    const retrieve = vi.spyOn(fake.subscriptions, 'retrieve');
    const res = await call('POST', `/workspaces/${owner.workspaceId}/billing/refresh`, owner);
    expect(res.statusCode).toBe(200);
    expect(res.json().plan).toBeNull();
    expect(retrieve).not.toHaveBeenCalled();
  });
});

describe('handled Stripe events', () => {
  it('are forgotten after 30 days, long after Stripe stops retrying', async () => {
    await prisma.stripeEvent.createMany({
      data: [
        { id: 'evt_old', type: 'invoice.paid', receivedAt: new Date(Date.now() - 31 * DAY) },
        { id: 'evt_recent', type: 'invoice.paid', receivedAt: new Date(Date.now() - 2 * DAY) },
      ],
    });
    expect(await purgeStripeEvents()).toBe(1);
    const left = await prisma.stripeEvent.findMany({ select: { id: true } });
    expect(left).toEqual([{ id: 'evt_recent' }]);
  });
});

describe('the portal settings', () => {
  it('finds settings made after the server started, without a restart', async () => {
    const owner = await signup(app);
    await prisma.subscription.create({
      data: { workspaceId: owner.workspaceId, stripeCustomerId: 'cus_1', status: 'active' },
    });
    vi.spyOn(fake.billingPortal.configurations, 'list')
      .mockResolvedValueOnce({ data: [] } as never)
      .mockResolvedValueOnce({
        data: [{ id: 'bpc_replypilot', metadata: { app: 'replypilot' } }],
      } as never);
    const createPortal = vi
      .spyOn(fake.billingPortal.sessions, 'create')
      .mockResolvedValue({ url: 'https://billing.stripe.com/p/session/test_2' } as never);

    await call('POST', `/workspaces/${owner.workspaceId}/billing/portal`, owner);
    expect(createPortal.mock.calls[0]![0]).not.toHaveProperty('configuration');
    // stripe:setup runs now. The next visit picks the settings up.
    await call('POST', `/workspaces/${owner.workspaceId}/billing/portal`, owner);
    expect(createPortal.mock.calls[1]![0]).toMatchObject({ configuration: 'bpc_replypilot' });
  });
});

describe("Stripe's webhook", () => {
  it('keeps up with Stripe while billing is switched off', async () => {
    env.BILLING_PROVIDER = 'off';
    const owner = await signup(app);
    await prisma.subscription.create({
      data: { workspaceId: owner.workspaceId, stripeCustomerId: 'cus_1', status: 'active' },
    });
    vi.spyOn(fake.subscriptions, 'retrieve').mockResolvedValue(
      subscription({ status: 'canceled' }) as never,
    );
    const { payload, header } = signedEvent({
      id: 'evt_while_off',
      type: 'customer.subscription.deleted',
      object: subscription({ status: 'canceled' }),
    });
    expect((await sendWebhook(payload, header)).statusCode).toBe(200);
    const row = await prisma.subscription.findUniqueOrThrow({
      where: { workspaceId: owner.workspaceId },
    });
    expect(row.status).toBe('canceled');
  });

  it('refuses an event without a valid signature', async () => {
    const { payload } = signedEvent({
      id: 'evt_1',
      type: 'customer.subscription.updated',
      object: subscription(),
    });
    const res = await sendWebhook(payload, 't=1,v1=forged');
    expect(res.statusCode).toBe(400);
  });

  it('handles each event once, however often Stripe sends it', async () => {
    const owner = await signup(app);
    await prisma.subscription.create({
      data: { workspaceId: owner.workspaceId, stripeCustomerId: 'cus_1' },
    });
    const retrieve = vi
      .spyOn(fake.subscriptions, 'retrieve')
      .mockResolvedValue(subscription({ status: 'past_due', quantity: 3 }) as never);
    const { payload, header } = signedEvent({
      id: 'evt_2',
      type: 'customer.subscription.updated',
      object: subscription(),
    });

    expect((await sendWebhook(payload, header)).statusCode).toBe(200);
    expect((await sendWebhook(payload, header)).statusCode).toBe(200);
    expect(retrieve).toHaveBeenCalledTimes(1);
    // A failed card is retried by Stripe, so the business can keep replying meanwhile.
    expect(await status(owner)).toMatchObject({
      state: 'past_due',
      canWrite: true,
      plan: { quantity: 3 },
    });
  });

  it('turns a workspace read-only when its plan ends after the trial', async () => {
    const owner = await signup(app);
    await endTrial(owner.workspaceId);
    await prisma.subscription.create({
      data: {
        workspaceId: owner.workspaceId,
        stripeCustomerId: 'cus_1',
        stripeSubscriptionId: 'sub_1',
        status: 'active',
      },
    });
    vi.spyOn(fake.subscriptions, 'retrieve').mockResolvedValue(
      subscription({ status: 'canceled' }) as never,
    );
    const { payload, header } = signedEvent({
      id: 'evt_3',
      type: 'customer.subscription.deleted',
      object: subscription({ status: 'canceled' }),
    });
    await sendWebhook(payload, header);
    expect(await status(owner)).toMatchObject({ state: 'lapsed', canWrite: false });
  });

  // Stripe sends events in the endpoint's API version. A sandbox made before 2025 defaults to an
  // older one, where an invoice names its subscription directly rather than under `parent`.
  it.each([
    ['current', { parent: { subscription_details: { subscription: 'sub_1' } } }],
    ['older', { subscription: 'sub_1' }],
  ])('reads a failed payment in the %s event format', async (_format, invoice) => {
    const owner = await signup(app);
    await prisma.subscription.create({
      data: { workspaceId: owner.workspaceId, stripeCustomerId: 'cus_1', status: 'active' },
    });
    const retrieve = vi
      .spyOn(fake.subscriptions, 'retrieve')
      .mockResolvedValue(subscription({ status: 'past_due' }) as never);
    const { payload, header } = signedEvent({
      id: `evt_invoice_${_format}`,
      type: 'invoice.payment_failed',
      object: { id: 'in_1', object: 'invoice', customer: 'cus_1', ...invoice },
    });
    expect((await sendWebhook(payload, header)).statusCode).toBe(200);
    expect(retrieve).toHaveBeenCalledWith('sub_1');
    expect(await status(owner)).toMatchObject({ state: 'past_due', canWrite: true });
  });

  it('cancels a second live subscription for a workspace that already pays', async () => {
    const owner = await signup(app);
    await prisma.subscription.create({
      data: {
        workspaceId: owner.workspaceId,
        stripeCustomerId: 'cus_1',
        stripeSubscriptionId: 'sub_1',
        status: 'active',
      },
    });
    vi.spyOn(fake.subscriptions, 'retrieve').mockImplementation(((id: string) =>
      Promise.resolve(subscription({ id }))) as never);
    const cancel = vi
      .spyOn(fake.subscriptions, 'cancel')
      .mockResolvedValue(subscription({ id: 'sub_2', status: 'canceled' }) as never);
    const { payload, header } = signedEvent({
      id: 'evt_duplicate',
      type: 'customer.subscription.created',
      object: subscription({ id: 'sub_2' }),
    });

    expect((await sendWebhook(payload, header)).statusCode).toBe(200);
    expect(cancel).toHaveBeenCalledWith('sub_2');
    const row = await prisma.subscription.findUniqueOrThrow({
      where: { workspaceId: owner.workspaceId },
    });
    expect(row).toMatchObject({ stripeSubscriptionId: 'sub_1', status: 'active' });
  });

  it("ignores another product's subscriptions in the same Stripe account", async () => {
    vi.spyOn(fake.subscriptions, 'retrieve').mockResolvedValue(
      subscription({ customer: 'cus_someone_else' }) as never,
    );
    const { payload, header } = signedEvent({
      id: 'evt_4',
      type: 'customer.subscription.created',
      object: subscription({ customer: 'cus_someone_else' }),
    });
    expect((await sendWebhook(payload, header)).statusCode).toBe(200);
    expect(await prisma.subscription.count()).toBe(0);
  });

  it("doesn't let news of an old, ended subscription replace the one in use", async () => {
    const owner = await signup(app);
    await prisma.subscription.create({
      data: {
        workspaceId: owner.workspaceId,
        stripeCustomerId: 'cus_1',
        stripeSubscriptionId: 'sub_new',
        status: 'active',
      },
    });
    vi.spyOn(fake.subscriptions, 'retrieve').mockResolvedValue(
      subscription({ id: 'sub_old', status: 'canceled' }) as never,
    );
    const { payload, header } = signedEvent({
      id: 'evt_5',
      type: 'customer.subscription.deleted',
      object: subscription({ id: 'sub_old', status: 'canceled' }),
    });
    await sendWebhook(payload, header);
    const row = await prisma.subscription.findUniqueOrThrow({
      where: { workspaceId: owner.workspaceId },
    });
    expect(row).toMatchObject({ stripeSubscriptionId: 'sub_new', status: 'active' });
  });

  it("leaves another product's plan on a ReplyPilot customer alone", async () => {
    const owner = await signup(app);
    await prisma.subscription.create({
      data: {
        workspaceId: owner.workspaceId,
        stripeCustomerId: 'cus_1',
        stripeSubscriptionId: 'sub_1',
        status: 'active',
      },
    });
    const theirs = subscription({ id: 'sub_theirs', otherProduct: true });
    vi.spyOn(fake.subscriptions, 'retrieve').mockResolvedValue(theirs as never);
    const cancel = vi.spyOn(fake.subscriptions, 'cancel');
    const { payload, header } = signedEvent({
      id: 'evt_theirs',
      type: 'customer.subscription.created',
      object: theirs,
    });

    expect((await sendWebhook(payload, header)).statusCode).toBe(200);
    expect(cancel).not.toHaveBeenCalled();
    const row = await prisma.subscription.findUniqueOrThrow({
      where: { workspaceId: owner.workspaceId },
    });
    expect(row).toMatchObject({ stripeSubscriptionId: 'sub_1', status: 'active' });
  });

  it('keeps the newer state when two updates to one plan arrive together', async () => {
    const owner = await signup(app);
    await prisma.subscription.create({
      data: {
        workspaceId: owner.workspaceId,
        stripeCustomerId: 'cus_1',
        stripeSubscriptionId: 'sub_1',
        status: 'active',
      },
    });
    // The first handler reads the plan just before it is cancelled, and Stripe holds that answer
    // until the test lets it go. Every later read sees it cancelled.
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    let reads = 0;
    vi.spyOn(fake.subscriptions, 'retrieve').mockImplementation((async () => {
      reads += 1;
      if (reads > 1) return subscription({ status: 'canceled' });
      await held;
      return subscription();
    }) as never);
    const first = signedEvent({
      id: 'evt_first',
      type: 'customer.subscription.updated',
      object: subscription(),
    });
    // An invoice without its customer: the second handler reads the plan once to learn whose it
    // is, then waits for the lock, then reads it again.
    const second = signedEvent({
      id: 'evt_second',
      type: 'invoice.paid',
      object: {
        id: 'in_1',
        object: 'invoice',
        customer: null,
        parent: { subscription_details: { subscription: 'sub_1' } },
      },
    });

    // inject only sends a request once something waits on it, so each is started here.
    const sentFirst = Promise.resolve(sendWebhook(first.payload, first.header));
    await vi.waitFor(() => expect(reads).toBe(1));
    const sentSecond = Promise.resolve(sendWebhook(second.payload, second.header));
    await vi.waitFor(() => expect(reads).toBe(2));
    // Without the lock, the second handler's next read would follow at once.
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(reads).toBe(2);
    release();

    const responses = await Promise.all([sentFirst, sentSecond]);
    expect(responses.map((res) => res.statusCode)).toEqual([200, 200]);
    expect(reads).toBe(3);
    const row = await prisma.subscription.findUniqueOrThrow({
      where: { workspaceId: owner.workspaceId },
    });
    expect(row.status).toBe('canceled');
  });

  it('cancels one of two plans paid at the same moment, whichever lands first', async () => {
    const owner = await signup(app);
    await prisma.subscription.create({
      data: { workspaceId: owner.workspaceId, stripeCustomerId: 'cus_1' },
    });
    vi.spyOn(fake.subscriptions, 'retrieve').mockImplementation(((id: string) =>
      Promise.resolve(subscription({ id }))) as never);
    const cancel = vi
      .spyOn(fake.subscriptions, 'cancel')
      .mockImplementation(((id: string) =>
        Promise.resolve(subscription({ id, status: 'canceled' }))) as never);
    const events = ['sub_a', 'sub_b'].map((id) =>
      signedEvent({
        id: `evt_${id}`,
        type: 'customer.subscription.created',
        object: subscription({ id }),
      }),
    );

    await Promise.all(events.map((e) => sendWebhook(e.payload, e.header)));
    expect(cancel).toHaveBeenCalledTimes(1);
    const row = await prisma.subscription.findUniqueOrThrow({
      where: { workspaceId: owner.workspaceId },
    });
    expect(row.status).toBe('active');
    expect(cancel.mock.calls[0]![0]).not.toBe(row.stripeSubscriptionId);
  });

  it('records an event as handled only once the work is done', async () => {
    const owner = await signup(app);
    await prisma.subscription.create({
      data: { workspaceId: owner.workspaceId, stripeCustomerId: 'cus_1' },
    });
    let recordedDuringWork: number | null = null;
    vi.spyOn(fake.subscriptions, 'retrieve').mockImplementation((async () => {
      recordedDuringWork = await prisma.stripeEvent.count();
      return subscription();
    }) as never);
    const { payload, header } = signedEvent({
      id: 'evt_order',
      type: 'customer.subscription.created',
      object: subscription(),
    });

    expect((await sendWebhook(payload, header)).statusCode).toBe(200);
    // Had the server stopped mid-way, nothing would mark the event handled, and Stripe's resend
    // would be acted on.
    expect(recordedDuringWork).toBe(0);
    expect(await prisma.stripeEvent.count()).toBe(1);
  });

  it('closes a plan left unpaid once a new one starts', async () => {
    const owner = await signup(app);
    await prisma.subscription.create({
      data: {
        workspaceId: owner.workspaceId,
        stripeCustomerId: 'cus_1',
        stripeSubscriptionId: 'sub_unpaid',
        status: 'unpaid',
      },
    });
    vi.spyOn(fake.subscriptions, 'retrieve').mockImplementation(((id: string) =>
      Promise.resolve(
        subscription({ id, status: id === 'sub_unpaid' ? 'unpaid' : 'active' }),
      )) as never);
    const cancel = vi
      .spyOn(fake.subscriptions, 'cancel')
      .mockResolvedValue(subscription({ id: 'sub_unpaid', status: 'canceled' }) as never);
    const { payload, header } = signedEvent({
      id: 'evt_new_plan',
      type: 'customer.subscription.created',
      object: subscription({ id: 'sub_new' }),
    });

    expect((await sendWebhook(payload, header)).statusCode).toBe(200);
    expect(cancel).toHaveBeenCalledWith('sub_unpaid');
    const row = await prisma.subscription.findUniqueOrThrow({
      where: { workspaceId: owner.workspaceId },
    });
    expect(row).toMatchObject({ stripeSubscriptionId: 'sub_new', status: 'active' });
    expect(await status(owner)).toMatchObject({ state: 'active', canWrite: true });
  });

  const heldPlan = (workspaceId: string, status: string) =>
    prisma.subscription.create({
      data: {
        workspaceId,
        stripeCustomerId: 'cus_1',
        stripeSubscriptionId: 'sub_old',
        status,
      },
    });
  const newPlanEvent = () =>
    signedEvent({
      id: 'evt_new_plan',
      type: 'customer.subscription.created',
      object: subscription({ id: 'sub_new' }),
    });

  it('keeps the old plan if Stripe says it came back, and cancels the new one', async () => {
    const owner = await signup(app);
    // Our copy says paused, but the owner has since paid and Stripe has it running again.
    await heldPlan(owner.workspaceId, 'paused');
    vi.spyOn(fake.subscriptions, 'retrieve').mockImplementation(((id: string) =>
      Promise.resolve(subscription({ id }))) as never);
    const cancel = vi
      .spyOn(fake.subscriptions, 'cancel')
      .mockResolvedValue(subscription({ id: 'sub_new', status: 'canceled' }) as never);
    const { payload, header } = newPlanEvent();

    expect((await sendWebhook(payload, header)).statusCode).toBe(200);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledWith('sub_new');
    const row = await prisma.subscription.findUniqueOrThrow({
      where: { workspaceId: owner.workspaceId },
    });
    expect(row.stripeSubscriptionId).toBe('sub_old');
  });

  it("leaves the event for Stripe to resend when it can't say what became of the old plan", async () => {
    const owner = await signup(app);
    await heldPlan(owner.workspaceId, 'unpaid');
    vi.spyOn(fake.subscriptions, 'retrieve').mockImplementation(((id: string) =>
      id === 'sub_old'
        ? Promise.reject(new Error('Stripe is down'))
        : Promise.resolve(subscription({ id }))) as never);
    const cancel = vi.spyOn(fake.subscriptions, 'cancel');
    const { payload, header } = newPlanEvent();

    expect((await sendWebhook(payload, header)).statusCode).toBe(500);
    expect(cancel).not.toHaveBeenCalled();
    expect(await prisma.stripeEvent.count()).toBe(0);
    const row = await prisma.subscription.findUniqueOrThrow({
      where: { workspaceId: owner.workspaceId },
    });
    expect(row).toMatchObject({ stripeSubscriptionId: 'sub_old', status: 'unpaid' });
  });

  it('keeps the old plan while a new one waits for its first payment, and closes it once that is paid', async () => {
    const owner = await signup(app);
    await heldPlan(owner.workspaceId, 'paused');
    let newStatus = 'incomplete';
    vi.spyOn(fake.subscriptions, 'retrieve').mockImplementation(((id: string) =>
      Promise.resolve(
        subscription({ id, status: id === 'sub_old' ? 'paused' : newStatus }),
      )) as never);
    const cancel = vi
      .spyOn(fake.subscriptions, 'cancel')
      .mockResolvedValue(subscription({ id: 'sub_old', status: 'canceled' }) as never);
    const waiting = signedEvent({
      id: 'evt_waiting',
      type: 'customer.subscription.created',
      object: subscription({ id: 'sub_new', status: 'incomplete' }),
    });

    expect((await sendWebhook(waiting.payload, waiting.header)).statusCode).toBe(200);
    const before = await prisma.subscription.findUniqueOrThrow({
      where: { workspaceId: owner.workspaceId },
    });
    expect(before).toMatchObject({ stripeSubscriptionId: 'sub_old', status: 'paused' });

    newStatus = 'active';
    const paid = signedEvent({
      id: 'evt_paid',
      type: 'customer.subscription.updated',
      object: subscription({ id: 'sub_new' }),
    });
    expect((await sendWebhook(paid.payload, paid.header)).statusCode).toBe(200);
    expect(cancel).toHaveBeenCalledWith('sub_old');
    const after = await prisma.subscription.findUniqueOrThrow({
      where: { workspaceId: owner.workspaceId },
    });
    expect(after).toMatchObject({ stripeSubscriptionId: 'sub_new', status: 'active' });
  });

  it('takes the new plan when Stripe has never heard of the old one', async () => {
    const owner = await signup(app);
    // For example, one saved while this server used a different Stripe account's key.
    await heldPlan(owner.workspaceId, 'unpaid');
    vi.spyOn(fake.subscriptions, 'retrieve').mockImplementation(((id: string) =>
      id === 'sub_old'
        ? Promise.reject(
            Object.assign(new Error('No such subscription'), { code: 'resource_missing' }),
          )
        : Promise.resolve(subscription({ id }))) as never);
    const cancel = vi.spyOn(fake.subscriptions, 'cancel');
    const { payload, header } = newPlanEvent();

    expect((await sendWebhook(payload, header)).statusCode).toBe(200);
    expect(cancel).not.toHaveBeenCalled();
    const row = await prisma.subscription.findUniqueOrThrow({
      where: { workspaceId: owner.workspaceId },
    });
    expect(row).toMatchObject({ stripeSubscriptionId: 'sub_new', status: 'active' });
  });
});

describe('deleting a workspace', () => {
  const paying = (workspaceId: string) =>
    prisma.subscription.create({
      data: {
        workspaceId,
        stripeCustomerId: 'cus_1',
        stripeSubscriptionId: 'sub_1',
        status: 'active',
      },
    });

  // What Stripe lists for the customer.
  const listed = (...subs: object[]) =>
    vi.spyOn(fake.subscriptions, 'list').mockResolvedValue({ data: subs } as never);

  it('cancels its plan, so the card stops being charged', async () => {
    const owner = await signup(app);
    await paying(owner.workspaceId);
    listed(subscription());
    const cancel = vi
      .spyOn(fake.subscriptions, 'cancel')
      .mockResolvedValue(subscription({ status: 'canceled' }) as never);

    const res = await call('DELETE', `/workspaces/${owner.workspaceId}`, owner);
    expect(res.statusCode).toBe(200);
    expect(cancel).toHaveBeenCalledWith('sub_1');
    const row = await prisma.subscription.findUniqueOrThrow({
      where: { workspaceId: owner.workspaceId },
    });
    expect(row.status).toBe('canceled');
  });

  it('cancels it when the owner deletes their whole account too', async () => {
    const owner = await signup(app);
    await paying(owner.workspaceId);
    listed(subscription());
    const cancel = vi
      .spyOn(fake.subscriptions, 'cancel')
      .mockResolvedValue(subscription({ status: 'canceled' }) as never);
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/auth/me',
      headers: owner.headers,
      payload: { password: PASSWORD },
    });
    expect(res.statusCode).toBe(200);
    expect(cancel).toHaveBeenCalledWith('sub_1');
  });

  it("keeps the workspace when Stripe can't cancel the plan, so the owner can try again", async () => {
    const owner = await signup(app);
    await paying(owner.workspaceId);
    listed(subscription());
    vi.spyOn(fake.subscriptions, 'cancel').mockRejectedValue(new Error('Stripe is down'));
    vi.spyOn(fake.subscriptions, 'retrieve').mockResolvedValue(subscription() as never);

    const res = await call('DELETE', `/workspaces/${owner.workspaceId}`, owner);
    expect(res.statusCode).toBe(502);
    expect(res.json().error.code).toBe('billing_cancel_failed');
    const workspace = await prisma.workspace.findUniqueOrThrow({
      where: { id: owner.workspaceId },
    });
    expect(workspace.deletedAt).toBeNull();
  });

  it('keeps the workspace when this server has no Stripe key to cancel the plan with', async () => {
    const owner = await signup(app);
    await paying(owner.workspaceId);
    setStripeClient(null);
    const key = env.STRIPE_SECRET_KEY;
    env.STRIPE_SECRET_KEY = '';
    try {
      const res = await call('DELETE', `/workspaces/${owner.workspaceId}`, owner);
      expect(res.statusCode).toBe(502);
      expect(res.json().error.code).toBe('billing_cancel_failed');
    } finally {
      env.STRIPE_SECRET_KEY = key;
    }
    const workspace = await prisma.workspace.findUniqueOrThrow({
      where: { id: owner.workspaceId },
    });
    expect(workspace.deletedAt).toBeNull();
  });

  it('closes a checkout left open, so it cannot be paid afterwards', async () => {
    const owner = await signup(app);
    await prisma.subscription.create({
      data: {
        workspaceId: owner.workspaceId,
        stripeCustomerId: 'cus_1',
        checkoutSessionId: 'cs_open',
      },
    });
    const expire = vi.spyOn(fake.checkout.sessions, 'expire').mockResolvedValue({} as never);

    const res = await call('DELETE', `/workspaces/${owner.workspaceId}`, owner);
    expect(res.statusCode).toBe(200);
    expect(expire).toHaveBeenCalledWith('cs_open');
  });

  const openCheckout = (workspaceId: string) =>
    prisma.subscription.create({
      data: { workspaceId, stripeCustomerId: 'cus_1', checkoutSessionId: 'cs_open' },
    });

  it("keeps the workspace when a checkout left open can't be closed", async () => {
    const owner = await signup(app);
    await openCheckout(owner.workspaceId);
    vi.spyOn(fake.checkout.sessions, 'expire').mockRejectedValue(new Error('Stripe is down'));
    vi.spyOn(fake.checkout.sessions, 'retrieve').mockResolvedValue({ status: 'open' } as never);

    const res = await call('DELETE', `/workspaces/${owner.workspaceId}`, owner);
    expect(res.statusCode).toBe(502);
    const workspace = await prisma.workspace.findUniqueOrThrow({
      where: { id: owner.workspaceId },
    });
    expect(workspace.deletedAt).toBeNull();
  });

  it('goes ahead when the checkout left open was paid just before, and cancels its plan', async () => {
    const owner = await signup(app);
    await openCheckout(owner.workspaceId);
    // Stripe won't expire a checkout that was paid.
    vi.spyOn(fake.checkout.sessions, 'expire').mockRejectedValue(new Error('Already paid'));
    vi.spyOn(fake.checkout.sessions, 'retrieve').mockResolvedValue({
      status: 'complete',
    } as never);
    listed(subscription({ id: 'sub_just_paid' }));
    const cancel = vi
      .spyOn(fake.subscriptions, 'cancel')
      .mockResolvedValue(subscription({ id: 'sub_just_paid', status: 'canceled' }) as never);

    const res = await call('DELETE', `/workspaces/${owner.workspaceId}`, owner);
    expect(res.statusCode).toBe(200);
    expect(cancel).toHaveBeenCalledWith('sub_just_paid');
  });

  it('cancels plans on every page Stripe lists', async () => {
    const owner = await signup(app);
    await paying(owner.workspaceId);
    const list = vi.spyOn(fake.subscriptions, 'list').mockImplementation(((params: {
      starting_after?: string;
    }) =>
      Promise.resolve(
        params.starting_after === 'sub_1'
          ? { data: [subscription({ id: 'sub_2' })], has_more: false }
          : { data: [subscription({ id: 'sub_1' })], has_more: true },
      )) as never);
    const cancel = vi
      .spyOn(fake.subscriptions, 'cancel')
      .mockImplementation(((id: string) =>
        Promise.resolve(subscription({ id, status: 'canceled' }))) as never);

    const res = await call('DELETE', `/workspaces/${owner.workspaceId}`, owner);
    expect(res.statusCode).toBe(200);
    expect(list).toHaveBeenCalledTimes(2);
    expect(cancel.mock.calls.map(([id]) => id)).toEqual(['sub_1', 'sub_2']);
  });

  it("keeps the record of a plan it cancelled when another one can't be", async () => {
    const owner = await signup(app);
    await paying(owner.workspaceId);
    listed(subscription({ id: 'sub_1' }), subscription({ id: 'sub_2' }));
    const cancel = vi.spyOn(fake.subscriptions, 'cancel').mockImplementation(((id: string) =>
      id === 'sub_2'
        ? Promise.reject(new Error('Stripe is down'))
        : Promise.resolve(subscription({ id, status: 'canceled' }))) as never);
    vi.spyOn(fake.subscriptions, 'retrieve').mockImplementation(((id: string) =>
      Promise.resolve(subscription({ id }))) as never);
    const cancelledOnDelete = () =>
      prisma.auditLog.findMany({
        where: { workspaceId: owner.workspaceId, action: 'billing.canceled_on_delete' },
      });

    const res = await call('DELETE', `/workspaces/${owner.workspaceId}`, owner);
    expect(res.statusCode).toBe(502);
    expect(cancel.mock.calls.map(([id]) => id)).toEqual(['sub_1', 'sub_2']);
    expect((await cancelledOnDelete()).map((entry) => entry.meta)).toEqual([
      { subscription: 'sub_1' },
    ]);
    const row = await prisma.subscription.findUniqueOrThrow({
      where: { workspaceId: owner.workspaceId },
    });
    expect(row.status).toBe('canceled');
    const workspace = await prisma.workspace.findUniqueOrThrow({
      where: { id: owner.workspaceId },
    });
    expect(workspace.deletedAt).toBeNull();
  });

  it('opens no checkout once the deletion has started', async () => {
    const owner = await signup(app);
    await prisma.subscription.create({
      data: { workspaceId: owner.workspaceId, stripeCustomerId: 'cus_1' },
    });
    // The deletion waits on Stripe's list of plans until the test lets it go.
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    let listing = false;
    vi.spyOn(fake.subscriptions, 'list').mockImplementation((async () => {
      listing = true;
      await held;
      return { data: [] };
    }) as never);
    const create = vi
      .spyOn(fake.checkout.sessions, 'create')
      .mockResolvedValue({ id: 'cs_late', url: 'https://checkout.stripe.com/c/pay/cs' } as never);

    const started: Promise<Awaited<ReturnType<typeof call>>>[] = [];
    try {
      started.push(Promise.resolve(call('DELETE', `/workspaces/${owner.workspaceId}`, owner)));
      await vi.waitFor(() => expect(listing).toBe(true));
      // Asked for while the deletion is under way, after the workspace was last checked as live.
      started.push(
        Promise.resolve(
          call('POST', `/workspaces/${owner.workspaceId}/billing/checkout`, owner, {
            interval: 'month',
          }),
        ),
      );
      await new Promise((resolve) => setTimeout(resolve, 250));
    } finally {
      release();
      await Promise.allSettled(started);
    }
    const [deleted, checkout] = await Promise.all(started);

    expect(deleted!.statusCode).toBe(200);
    expect(checkout!.statusCode).toBe(404);
    expect(create).not.toHaveBeenCalled();
  });

  it("cancels a plan paid moments before, whose news hasn't arrived yet", async () => {
    const owner = await signup(app);
    // Checkout was opened, and our copy has no plan yet.
    await prisma.subscription.create({
      data: { workspaceId: owner.workspaceId, stripeCustomerId: 'cus_1' },
    });
    listed(
      subscription({ id: 'sub_just_paid' }),
      subscription({ id: 'sub_long_gone', status: 'canceled' }),
      subscription({ id: 'sub_theirs', otherProduct: true }),
    );
    const cancel = vi
      .spyOn(fake.subscriptions, 'cancel')
      .mockResolvedValue(subscription({ id: 'sub_just_paid', status: 'canceled' }) as never);

    const res = await call('DELETE', `/workspaces/${owner.workspaceId}`, owner);
    expect(res.statusCode).toBe(200);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledWith('sub_just_paid');
    const row = await prisma.subscription.findUniqueOrThrow({
      where: { workspaceId: owner.workspaceId },
    });
    expect(row).toMatchObject({ stripeSubscriptionId: 'sub_just_paid', status: 'canceled' });
  });

  it("keeps the workspace when Stripe can't list its plans", async () => {
    const owner = await signup(app);
    await paying(owner.workspaceId);
    vi.spyOn(fake.subscriptions, 'list').mockRejectedValue(new Error('Stripe is down'));

    const res = await call('DELETE', `/workspaces/${owner.workspaceId}`, owner);
    expect(res.statusCode).toBe(502);
    const workspace = await prisma.workspace.findUniqueOrThrow({
      where: { id: owner.workspaceId },
    });
    expect(workspace.deletedAt).toBeNull();
  });

  it('cancels a plan paid for after the workspace was deleted', async () => {
    const owner = await signup(app);
    await prisma.subscription.create({
      data: { workspaceId: owner.workspaceId, stripeCustomerId: 'cus_1' },
    });
    await prisma.workspace.update({
      where: { id: owner.workspaceId },
      data: { deletedAt: new Date() },
    });
    vi.spyOn(fake.subscriptions, 'retrieve').mockResolvedValue(subscription() as never);
    const cancel = vi
      .spyOn(fake.subscriptions, 'cancel')
      .mockResolvedValue(subscription({ status: 'canceled' }) as never);
    const report = vi.mocked(Sentry.captureMessage);
    report.mockClear();
    const { payload, header } = signedEvent({
      id: 'evt_late_checkout',
      type: 'customer.subscription.created',
      object: subscription(),
    });

    expect((await sendWebhook(payload, header)).statusCode).toBe(200);
    expect(cancel).toHaveBeenCalledWith('sub_1');
    // The refund check is raised before the cancel, so a crash in between can't lose it.
    expect(report.mock.invocationCallOrder[0]!).toBeLessThan(cancel.mock.invocationCallOrder[0]!);
  });
});

describe('the location count', () => {
  it('follows the locations switched on, with prorated changes', async () => {
    const owner = await signup(app);
    await addLocation(owner.workspaceId, 'North');
    await addLocation(owner.workspaceId, 'South');
    await prisma.subscription.create({
      data: {
        workspaceId: owner.workspaceId,
        stripeCustomerId: 'cus_1',
        stripeSubscriptionId: 'sub_1',
        status: 'active',
        quantity: 1,
      },
    });
    vi.spyOn(fake.subscriptions, 'retrieve').mockResolvedValue(
      subscription({ quantity: 1 }) as never,
    );
    const update = vi
      .spyOn(fake.subscriptions, 'update')
      .mockResolvedValue(subscription({ quantity: 2 }) as never);

    await syncBillingQuantities();
    expect(update).toHaveBeenCalledWith('sub_1', {
      items: [{ id: 'si_1', quantity: 2 }],
      proration_behavior: 'create_prorations',
    });
    expect((await status(owner)).plan.quantity).toBe(2);

    // Already in line: nothing more is sent.
    await syncBillingQuantities();
    expect(update).toHaveBeenCalledTimes(1);
  });

  // Two locations are on, and our copy says Stripe charges for both.
  async function inLine(workspaceId: string) {
    await addLocation(workspaceId, 'North');
    await addLocation(workspaceId, 'South');
    await prisma.subscription.create({
      data: {
        workspaceId,
        stripeCustomerId: 'cus_1',
        stripeSubscriptionId: 'sub_1',
        status: 'active',
        quantity: 2,
      },
    });
  }

  it('puts right a count Stripe reports changed, such as one that reached it late', async () => {
    const owner = await signup(app);
    await inLine(owner.workspaceId);
    // A change to 1 that reached Stripe late, and Stripe's news of it.
    vi.spyOn(fake.subscriptions, 'retrieve').mockResolvedValue(
      subscription({ quantity: 1 }) as never,
    );
    const update = vi
      .spyOn(fake.subscriptions, 'update')
      .mockResolvedValue(subscription({ quantity: 2 }) as never);
    const { payload, header } = signedEvent({
      id: 'evt_late_change',
      type: 'customer.subscription.updated',
      object: subscription({ quantity: 1 }),
    });
    expect((await sendWebhook(payload, header)).statusCode).toBe(200);

    await syncBillingQuantities();
    expect(update).toHaveBeenCalledWith('sub_1', {
      items: [{ id: 'si_1', quantity: 2 }],
      proration_behavior: 'create_prorations',
    });
  });

  it('asks Stripe again once a day, even when our copy is in line', async () => {
    const owner = await signup(app);
    await inLine(owner.workspaceId);
    await prisma.$executeRaw`UPDATE subscriptions SET updated_at = ${new Date(Date.now() - 2 * DAY)}
      WHERE workspace_id = ${owner.workspaceId}::uuid`;
    // Stripe charges for 1, and its news of that never arrived.
    const retrieve = vi
      .spyOn(fake.subscriptions, 'retrieve')
      .mockResolvedValue(subscription({ quantity: 1 }) as never);
    const update = vi
      .spyOn(fake.subscriptions, 'update')
      .mockResolvedValue(subscription({ quantity: 2 }) as never);

    await syncBillingQuantities();
    expect(update).toHaveBeenCalledWith('sub_1', {
      items: [{ id: 'si_1', quantity: 2 }],
      proration_behavior: 'create_prorations',
    });

    // Checked just now, so the next run trusts our copy.
    await syncBillingQuantities();
    expect(retrieve).toHaveBeenCalledTimes(1);
  });
});
