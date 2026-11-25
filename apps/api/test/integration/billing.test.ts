import type { FastifyInstance } from 'fastify';
import Stripe from 'stripe';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../../src/config';
import { prisma } from '../../src/lib/prisma';
import { syncBillingQuantities } from '../../src/modules/billing/jobs';
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
  } = {},
) {
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
          price: { id: 'price_month', recurring: { interval: fields.interval ?? 'month' } },
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
    });
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
    vi.spyOn(fake.subscriptions, 'retrieve').mockResolvedValue(
      subscription({ id: 'sub_2', status: 'active' }) as never,
    );
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

  it('cancels its plan, so the card stops being charged', async () => {
    const owner = await signup(app);
    await paying(owner.workspaceId);
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
});
