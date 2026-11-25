import type { BillingInterval, BillingState, BillingStatus } from '@replypilot/shared';
import type { Prisma } from '@prisma/client';
import type Stripe from 'stripe';
import { env } from '../../config';
import { recordAudit } from '../../lib/audit';
import { HttpError, notFound } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { APP_TAG, idOf, portalConfiguration, priceId, stripe } from './stripe';

// Stripe statuses that keep a workspace able to draft and post. past_due is Stripe still
// retrying a failed card, so the business isn't cut off while it fixes it.
export const LIVE_STATUSES = ['active', 'trialing', 'past_due'];

const HOUR = 60 * 60 * 1000;

export const billingOn = () => env.BILLING_PROVIDER === 'stripe';

interface Standing {
  trialEndsAt: Date;
  subscription: { status: string | null } | null;
}

export function stateOf(workspace: Standing, now = new Date()): BillingState {
  if (!billingOn()) return 'free';
  const status = workspace.subscription?.status;
  if (status === 'active' || status === 'trialing') return 'active';
  if (status === 'past_due') return 'past_due';
  if (workspace.trialEndsAt > now) return 'trial';
  return 'lapsed';
}

export const canWrite = (state: BillingState) => state !== 'lapsed';

// The workspaces that may have drafts written for them now, as a filter for queries over replies.
export function writableWorkspaceFilter(now = new Date()): Prisma.WorkspaceWhereInput {
  if (!billingOn()) return {};
  return {
    OR: [{ trialEndsAt: { gt: now } }, { subscription: { is: { status: { in: LIVE_STATUSES } } } }],
  };
}

// What the plan charges for: the locations the workspace has switched on.
export async function locationCount(workspaceId: string): Promise<number> {
  return prisma.location.count({ where: { workspaceId, status: 'active' } });
}

export async function billingStatus(workspaceId: string): Promise<BillingStatus> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { trialEndsAt: true, subscription: true },
  });
  if (!workspace) throw notFound();
  const state = stateOf(workspace);
  const sub = workspace.subscription;
  return {
    state,
    canWrite: canWrite(state),
    trialEndsAt: workspace.trialEndsAt.toISOString(),
    locations: await locationCount(workspaceId),
    plan: sub?.status
      ? {
          interval: sub.interval === 'month' || sub.interval === 'year' ? sub.interval : null,
          quantity: sub.quantity,
          status: sub.status,
          renewsAt: sub.currentPeriodEnd?.toISOString() ?? null,
          cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
        }
      : null,
  };
}

// Called before anything that drafts or posts a reply. Reading stays open, and nothing is deleted.
export async function assertCanWrite(workspaceId: string): Promise<void> {
  if (!billingOn()) return;
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { trialEndsAt: true, subscription: { select: { status: true } } },
  });
  if (workspace && !canWrite(stateOf(workspace))) {
    throw new HttpError(
      402,
      'This workspace has no active plan. Choose one in Settings, under Billing, to draft and post replies again. Your reviews and replies are all still here.',
      'plan_required',
    );
  }
}

// One Stripe customer per workspace, made the first time it opens checkout. It is never looked
// up by email, so it can't attach to a customer another product made in the same Stripe account.
async function ensureCustomer(workspaceId: string, userId: string): Promise<string> {
  const existing = await prisma.subscription.findUnique({ where: { workspaceId } });
  if (existing) return existing.stripeCustomerId;
  const [workspace, user] = await Promise.all([
    prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { name: true } }),
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } }),
  ]);
  // The same key returns the same customer if two clicks race.
  const customer = await stripe().customers.create(
    { name: workspace.name, email: user.email, metadata: { workspaceId, app: APP_TAG } },
    { idempotencyKey: `${APP_TAG}-customer-${workspaceId}` },
  );
  const row = await prisma.subscription.upsert({
    where: { workspaceId },
    create: { workspaceId, stripeCustomerId: customer.id },
    update: {},
  });
  return row.stripeCustomerId;
}

// Sends the owner to Stripe's own page to pay. Prices come from Stripe by key, never from the
// browser, and the location count is read here.
export async function startCheckout(
  workspaceId: string,
  userId: string,
  interval: BillingInterval,
): Promise<string> {
  if (!billingOn()) throw new HttpError(409, 'Billing is switched off', 'billing_off');
  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
    select: { trialEndsAt: true, subscription: { select: { status: true } } },
  });
  if (LIVE_STATUSES.includes(workspace.subscription?.status ?? '')) {
    throw new HttpError(
      409,
      'This workspace already has a plan. Change it from Manage billing.',
      'already_subscribed',
    );
  }
  const customer = await ensureCustomer(workspaceId, userId);
  const price = await priceId(interval);
  const quantity = Math.max(1, await locationCount(workspaceId));
  // Choosing a plan during the trial doesn't cut it short: the first charge waits for its end.
  // Stripe only accepts a trial end at least two days away.
  const keepTrial = workspace.trialEndsAt.getTime() - Date.now() > 49 * HOUR;
  const session = await stripe().checkout.sessions.create({
    mode: 'subscription',
    customer,
    client_reference_id: workspaceId,
    line_items: [{ price, quantity }],
    // US dollars only. Stripe would otherwise show local prices abroad with a conversion fee; this
    // is set here rather than in the account settings, which other products may share.
    adaptive_pricing: { enabled: false },
    allow_promotion_codes: true,
    billing_address_collection: 'auto',
    customer_update: { address: 'auto', name: 'auto' },
    metadata: { workspaceId },
    subscription_data: {
      metadata: { workspaceId },
      ...(keepTrial ? { trial_end: Math.floor(workspace.trialEndsAt.getTime() / 1000) } : {}),
    },
    success_url: `${env.APP_URL}/settings?tab=billing&checkout={CHECKOUT_SESSION_ID}`,
    cancel_url: `${env.APP_URL}/settings?tab=billing`,
  });
  if (!session.url) throw new Error('Stripe returned no checkout page');
  await recordAudit({
    action: 'billing.checkout_started',
    workspaceId,
    actorUserId: userId,
    meta: { interval, quantity },
  });
  return session.url;
}

// The owner is back from Stripe's page. Reads the outcome straight from Stripe, so the plan shows
// at once even before Stripe's webhook arrives, and on a machine Stripe can't reach.
export async function confirmCheckout(workspaceId: string, sessionId: string): Promise<void> {
  if (!billingOn()) return;
  const session = await stripe().checkout.sessions.retrieve(sessionId);
  if (session.client_reference_id !== workspaceId) throw notFound();
  if (session.subscription) await syncSubscription(idOf(session.subscription));
}

// Stripe's own page for changing the card, switching monthly and yearly, seeing invoices and
// cancelling.
export async function portalUrl(workspaceId: string): Promise<string> {
  if (!billingOn()) throw new HttpError(409, 'Billing is switched off', 'billing_off');
  const row = await prisma.subscription.findUnique({ where: { workspaceId } });
  if (!row) throw new HttpError(409, 'Choose a plan first.', 'no_plan');
  const configuration = await portalConfiguration();
  const session = await stripe().billingPortal.sessions.create({
    customer: row.stripeCustomerId,
    return_url: `${env.APP_URL}/settings?tab=billing`,
    ...(configuration ? { configuration } : {}),
  });
  return session.url;
}

// Reads a subscription fresh from Stripe rather than trusting an event's copy, so events that
// arrive late or out of order still leave the latest state.
export async function syncSubscription(subscriptionId: string): Promise<void> {
  await saveSubscription(await stripe().subscriptions.retrieve(subscriptionId));
}

export async function saveSubscription(sub: Stripe.Subscription): Promise<void> {
  const customerId = idOf(sub.customer);
  const byCustomer = await prisma.subscription.findUnique({
    where: { stripeCustomerId: customerId },
  });
  const workspaceId = byCustomer?.workspaceId ?? sub.metadata?.workspaceId;
  // Another product's subscription in a shared Stripe account.
  if (!workspaceId) return;
  const row = byCustomer ?? (await prisma.subscription.findUnique({ where: { workspaceId } }));
  if (!row) {
    const exists = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!exists) return;
  } else if (row.stripeCustomerId !== customerId) {
    // Metadata naming a workspace that already pays through a different customer.
    return;
  }
  // An event about an older subscription mustn't replace the one in use.
  if (
    row?.stripeSubscriptionId &&
    row.stripeSubscriptionId !== sub.id &&
    LIVE_STATUSES.includes(row.status ?? '') &&
    !LIVE_STATUSES.includes(sub.status)
  ) {
    return;
  }
  const item = sub.items.data[0];
  const fields = {
    stripeSubscriptionId: sub.id,
    status: sub.status,
    interval: item?.price.recurring?.interval ?? null,
    quantity: item?.quantity ?? null,
    currentPeriodEnd: item ? new Date(item.current_period_end * 1000) : null,
    cancelAtPeriodEnd: sub.cancel_at_period_end || sub.cancel_at !== null,
  };
  await prisma.subscription.upsert({
    where: { workspaceId },
    create: { workspaceId, stripeCustomerId: customerId, ...fields },
    update: fields,
  });
}

// Keeps Stripe charging for the locations switched on now. Changes are prorated, so a location
// added mid-month costs only the rest of the month.
export async function syncQuantity(workspaceId: string): Promise<void> {
  if (!billingOn()) return;
  const row = await prisma.subscription.findUnique({ where: { workspaceId } });
  if (!row?.stripeSubscriptionId || !LIVE_STATUSES.includes(row.status ?? '')) return;
  const want = Math.max(1, await locationCount(workspaceId));
  if (row.quantity === want) return;
  const sub = await stripe().subscriptions.retrieve(row.stripeSubscriptionId);
  const item = sub.items.data[0];
  if (!item || item.quantity === want) {
    await saveSubscription(sub);
    return;
  }
  const updated = await stripe().subscriptions.update(sub.id, {
    items: [{ id: item.id, quantity: want }],
    proration_behavior: 'create_prorations',
  });
  await saveSubscription(updated);
  await recordAudit({
    action: 'billing.locations_changed',
    workspaceId,
    meta: { from: item.quantity ?? null, to: want },
  });
}

// Which subscription an invoice belongs to. Events come in the webhook endpoint's Stripe API
// version, which is the account's default unless stripe:setup pinned it. Older versions (before
// 2025) keep it in `subscription`; newer ones under `parent`. Both are read, so an endpoint made
// by hand in the dashboard still works.
export function invoiceSubscription(invoice: Stripe.Invoice): string | null {
  const current = invoice.parent?.subscription_details?.subscription;
  const older = (invoice as unknown as { subscription?: string | { id: string } | null })
    .subscription;
  const found = current ?? older;
  return found ? idOf(found) : null;
}

// The events the webhook acts on. Each is handled once, however often Stripe sends it.
export async function handleEvent(event: Stripe.Event): Promise<void> {
  const fresh = await prisma.stripeEvent.createMany({
    data: [{ id: event.id, type: event.type }],
    skipDuplicates: true,
  });
  if (fresh.count === 0) return;
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        if (session.mode === 'subscription' && session.subscription) {
          await syncSubscription(idOf(session.subscription));
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
      case 'customer.subscription.paused':
      case 'customer.subscription.resumed':
        await syncSubscription(event.data.object.id);
        break;
      case 'invoice.paid':
      case 'invoice.payment_failed': {
        const subscription = invoiceSubscription(event.data.object);
        if (subscription) await syncSubscription(subscription);
        break;
      }
      default:
        break;
    }
  } catch (err) {
    // Lets Stripe's retry try again rather than being skipped as already handled.
    await prisma.stripeEvent.delete({ where: { id: event.id } }).catch(() => undefined);
    throw err;
  }
}
