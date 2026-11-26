import {
  PRICING,
  TRIAL_HOLD_MIN_HOURS,
  type BillingInterval,
  type BillingState,
  type BillingStatus,
} from '@replypilot/shared';
import type { Prisma } from '@prisma/client';
import * as Sentry from '@sentry/node';
import type Stripe from 'stripe';
import { env } from '../../config';
import { recordAudit } from '../../lib/audit';
import { HttpError, notFound } from '../../lib/errors';
import { withLock } from '../../lib/lock';
import { prisma } from '../../lib/prisma';
import { onWorkspaceDeleted, workspaceLock } from '../workspaces/lifecycle';
import {
  APP_TAG,
  PRICE_LOOKUP_KEYS,
  idOf,
  portalConfiguration,
  priceId,
  stripe,
  stripeAvailable,
} from './stripe';

// Stripe statuses that keep a workspace able to draft and post. past_due is Stripe still
// retrying a failed card, so the business isn't cut off while it fixes it.
export const LIVE_STATUSES = ['active', 'trialing', 'past_due'];

// Stripe statuses of a subscription that is over and charges nothing more.
const ENDED_STATUSES = ['canceled', 'incomplete_expired'];

// Every Stripe read and write for one customer, and so one workspace, takes this lock: a save of
// an older copy can't land after a newer one, and two new subscriptions can't both slip past the
// check for a second one. Each workspace has its own customer.
// The work gets the lock's transaction, for all its database reads and writes.
const customerLock = <T>(customerId: string, work: (tx: Prisma.TransactionClient) => Promise<T>) =>
  withLock(`stripe-customer:${customerId}`, work);

// ReplyPilot's own line on a subscription. A subscription without one belongs to another product
// sharing the Stripe account, even one on a customer ReplyPilot made.
function ourItem(sub: Stripe.Subscription): Stripe.SubscriptionItem | undefined {
  const keys: string[] = Object.values(PRICE_LOOKUP_KEYS);
  return sub.items.data.find(
    (item) => item.price.metadata?.app === APP_TAG || keys.includes(item.price.lookup_key ?? ''),
  );
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export const billingOn = () => env.BILLING_PROVIDER === 'stripe';

interface Standing {
  // Empty until billing is switched on: the trial hasn't started yet.
  trialEndsAt: Date | null;
  subscription: { status: string | null } | null;
}

export function stateOf(workspace: Standing, now = new Date()): BillingState {
  if (!billingOn()) return 'free';
  const status = workspace.subscription?.status;
  if (status === 'active' || status === 'trialing') return 'active';
  if (status === 'past_due') return 'past_due';
  if (!workspace.trialEndsAt || workspace.trialEndsAt > now) return 'trial';
  return 'lapsed';
}

export const canWrite = (state: BillingState) => state !== 'lapsed';

// The workspaces that may have drafts written for them now, as a filter for queries over replies.
export function writableWorkspaceFilter(now = new Date()): Prisma.WorkspaceWhereInput {
  if (!billingOn()) return {};
  return {
    OR: [
      { trialEndsAt: null },
      { trialEndsAt: { gt: now } },
      { subscription: { is: { status: { in: LIVE_STATUSES } } } },
    ],
  };
}

// A trial starts when billing is switched on, not at sign-up: a workspace made while billing was
// off has had nothing to try yet. This gives every workspace without a trial its 14 days from now.
// A trial that already started keeps its end date, even if billing was switched off and on again
// meanwhile. A job runs it every minute, and the places that need the date call it for one
// workspace first.
export async function startTrials(workspaceId?: string): Promise<void> {
  if (!billingOn()) return;
  await prisma.workspace.updateMany({
    where: { trialEndsAt: null, ...(workspaceId ? { id: workspaceId } : {}) },
    data: { trialEndsAt: new Date(Date.now() + PRICING.trialDays * DAY) },
  });
}

// What the plan charges for: the locations the workspace has switched on.
export async function locationCount(
  workspaceId: string,
  db: Prisma.TransactionClient = prisma,
): Promise<number> {
  return db.location.count({ where: { workspaceId, status: 'active' } });
}

export async function billingStatus(workspaceId: string): Promise<BillingStatus> {
  await startTrials(workspaceId);
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
    trialEndsAt: workspace.trialEndsAt?.toISOString() ?? null,
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
async function ensureCustomer(
  db: Prisma.TransactionClient,
  workspaceId: string,
  userId: string,
): Promise<string> {
  const existing = await db.subscription.findUnique({ where: { workspaceId } });
  if (existing) return existing.stripeCustomerId;
  const [workspace, user] = await Promise.all([
    db.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { name: true } }),
    db.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } }),
  ]);
  // The same key returns the same customer if this is ever asked twice.
  const customer = await stripe().customers.create(
    { name: workspace.name, email: user.email, metadata: { workspaceId, app: APP_TAG } },
    { idempotencyKey: `${APP_TAG}-customer-${workspaceId}` },
  );
  const row = await db.subscription.upsert({
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
  await startTrials(workspaceId);
  // Under the workspace's lock, which deletion holds throughout. A checkout opened first is closed
  // by the deletion; one asked for meanwhile waits, then finds the workspace gone. Two clicks take
  // turns too, so each closes the checkout before it.
  return workspaceLock(workspaceId, async (tx) => {
    const workspace = await tx.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      select: { deletedAt: true, trialEndsAt: true, subscription: { select: { status: true } } },
    });
    if (workspace.deletedAt) throw notFound();
    if (LIVE_STATUSES.includes(workspace.subscription?.status ?? '')) {
      throw new HttpError(
        409,
        'This workspace already has a plan. Change it from Manage billing.',
        'already_subscribed',
      );
    }
    const customer = await ensureCustomer(tx, workspaceId, userId);
    // Only one checkout open at a time: one left open in another tab would otherwise let the owner
    // pay twice and end up with two subscriptions. Stripe refuses to expire a finished or already
    // expired checkout, which is fine.
    const open = await tx.subscription.findUnique({
      where: { workspaceId },
      select: { checkoutSessionId: true },
    });
    if (open?.checkoutSessionId) {
      await stripe()
        .checkout.sessions.expire(open.checkoutSessionId)
        .catch(() => undefined);
    }
    const price = await priceId(interval);
    const quantity = Math.max(1, await locationCount(workspaceId, tx));
    // Choosing a plan during the trial doesn't cut it short: the first charge waits for its end.
    // Stripe can't hold it for less than two days, so a plan chosen in the trial's last two days
    // starts at once. The Billing tab says so before the owner chooses.
    const trialEnd = workspace.trialEndsAt?.getTime() ?? 0;
    const keepTrial = trialEnd - Date.now() > TRIAL_HOLD_MIN_HOURS * HOUR;
    const session = await stripe().checkout.sessions.create({
      mode: 'subscription',
      customer,
      client_reference_id: workspaceId,
      line_items: [{ price, quantity }],
      // US dollars only. Stripe would otherwise show local prices abroad with a conversion fee;
      // this is set here rather than in the account settings, which other products may share.
      adaptive_pricing: { enabled: false },
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      customer_update: { address: 'auto', name: 'auto' },
      metadata: { workspaceId },
      subscription_data: {
        metadata: { workspaceId },
        ...(keepTrial ? { trial_end: Math.floor(trialEnd / 1000) } : {}),
      },
      success_url: `${env.APP_URL}/settings?tab=billing&checkout={CHECKOUT_SESSION_ID}`,
      cancel_url: `${env.APP_URL}/settings?tab=billing`,
    });
    if (!session.url) throw new Error('Stripe returned no checkout page');
    await tx.subscription.update({
      where: { workspaceId },
      data: { checkoutSessionId: session.id },
    });
    await recordAudit(
      {
        action: 'billing.checkout_started',
        workspaceId,
        actorUserId: userId,
        meta: { interval, quantity },
      },
      tx,
    );
    return session.url;
  });
}

// The owner is back from Stripe's page. Reads the outcome straight from Stripe, so the plan shows
// at once even before Stripe's webhook arrives, and on a machine Stripe can't reach.
export async function confirmCheckout(workspaceId: string, sessionId: string): Promise<void> {
  if (!billingOn()) return;
  const session = await stripe().checkout.sessions.retrieve(sessionId);
  if (session.client_reference_id !== workspaceId) throw notFound();
  if (session.subscription) {
    await syncSubscription(
      idOf(session.subscription),
      session.customer ? idOf(session.customer) : null,
    );
  }
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
    return_url: `${env.APP_URL}/settings?tab=billing&from=portal`,
    ...(configuration ? { configuration } : {}),
  });
  return session.url;
}

// The owner is back from Stripe's portal. Reads the plan straight from Stripe, so a switch to
// yearly or a cancellation shows at once rather than whenever the webhook lands.
export async function refreshPlan(workspaceId: string): Promise<void> {
  if (!billingOn()) return;
  const row = await prisma.subscription.findUnique({
    where: { workspaceId },
    select: { stripeSubscriptionId: true, stripeCustomerId: true },
  });
  if (row?.stripeSubscriptionId) {
    await syncSubscription(row.stripeSubscriptionId, row.stripeCustomerId);
  }
}

// Reads a subscription fresh from Stripe rather than trusting an event's copy, so events that
// arrive late or out of order still leave the latest state. The read happens inside the
// customer's lock, so a copy read before a change can't be saved after it.
export async function syncSubscription(
  subscriptionId: string,
  customerId: string | null,
): Promise<void> {
  const customer =
    customerId ?? idOf((await stripe().subscriptions.retrieve(subscriptionId)).customer);
  await customerLock(customer, async (tx) => {
    await saveSubscription(tx, await stripe().subscriptions.retrieve(subscriptionId));
  });
}

// Cancels a subscription nobody should be paying for, at once. Anything it already took may need
// a refund, so that is reported first: were the server to stop just after the cancel, Stripe's
// resend would find the plan already ended, and the refund would never be raised.
async function cancelUnwanted(
  db: Prisma.TransactionClient,
  sub: Stripe.Subscription,
  workspaceId: string,
  action: string,
  reason: string,
  meta: Record<string, string | null>,
): Promise<void> {
  Sentry.captureMessage(`${reason}; check whether it needs a refund`, {
    extra: { workspaceId, cancelled: sub.id, ...meta },
  });
  await stripe().subscriptions.cancel(sub.id);
  await recordAudit({ action, workspaceId, meta: { cancelled: sub.id, ...meta } }, db);
}

// A subscription as Stripe has it now. Empty if Stripe has no such subscription, such as one made
// with a different Stripe account's key. Any other failure is thrown, so the caller can try again.
async function currentSubscription(id: string): Promise<Stripe.Subscription | null> {
  try {
    return await stripe().subscriptions.retrieve(id);
  } catch (err) {
    if ((err as { code?: string }).code === 'resource_missing') return null;
    throw err;
  }
}

// Saves Stripe's copy of a subscription. Callers hold the customer's lock and pass its
// transaction, so the reads, the decisions and the write below can't interleave with another save
// for the same workspace.
async function saveSubscription(
  db: Prisma.TransactionClient,
  sub: Stripe.Subscription,
): Promise<void> {
  const item = ourItem(sub);
  // Another product's subscription in a shared Stripe account, whichever customer it is on.
  if (!item) return;
  const customerId = idOf(sub.customer);
  const byCustomer = await db.subscription.findUnique({
    where: { stripeCustomerId: customerId },
  });
  const workspaceId = byCustomer?.workspaceId ?? sub.metadata?.workspaceId;
  if (!workspaceId) return;
  const row = byCustomer ?? (await db.subscription.findUnique({ where: { workspaceId } }));
  // Metadata naming a workspace that already pays through a different customer.
  if (row && row.stripeCustomerId !== customerId) return;
  const workspace = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { deletedAt: true },
  });
  // A workspace this database has never had. It may be another environment's, such as a
  // developer's machine sharing the test server's Stripe sandbox, so it is left alone.
  if (!workspace) return;
  const live = LIVE_STATUSES.includes(sub.status);
  // A plan that started after its workspace was deleted, from a checkout paid late. Nobody can use
  // it, so it stops at once.
  if (workspace.deletedAt && live) {
    await cancelUnwanted(
      db,
      sub,
      workspaceId,
      'billing.cancelled_after_delete',
      'Cancelling a plan started after its workspace was deleted',
      {},
    );
    return;
  }
  const other = row?.stripeSubscriptionId && row.stripeSubscriptionId !== sub.id ? row : null;
  // News of a different plan that gives no access, such as an old one ending or a new one still
  // waiting for its first payment, replaces ours only once ours is over. Until then the new one
  // takes over only when it goes live, below, where Stripe decides what happens to the old one.
  if (other && !live && !ENDED_STATUSES.includes(other.status ?? '')) return;
  // A new live plan while the workspace already has one. Our copy of the old one may be behind,
  // so Stripe decides what happens to it.
  if (other?.stripeSubscriptionId && live) {
    const previous = await currentSubscription(other.stripeSubscriptionId);
    // The old plan still gives access, or came back, for example once an unpaid invoice was paid.
    // It stays, and this one is cancelled so the card isn't charged twice. Two checkouts paid in
    // two tabs end up here too. The old plan's own event brings our copy of it up to date.
    if (previous && LIVE_STATUSES.includes(previous.status)) {
      await cancelUnwanted(
        db,
        sub,
        workspaceId,
        'billing.duplicate_cancelled',
        'Cancelling a duplicate subscription',
        { kept: previous.id },
      );
      return;
    }
    // The old plan gives no access but Stripe may still hold it open, such as one left unpaid
    // after its payments failed. It is closed so it doesn't linger, and the new one replaces it.
    if (previous && !ENDED_STATUSES.includes(previous.status)) {
      await stripe().subscriptions.cancel(previous.id);
    }
    await recordAudit(
      {
        action: 'billing.plan_replaced',
        workspaceId,
        meta: { replaced: other.stripeSubscriptionId, by: sub.id },
      },
      db,
    );
  }
  const fields = {
    stripeSubscriptionId: sub.id,
    status: sub.status,
    interval: item.price.recurring?.interval ?? null,
    quantity: item.quantity ?? null,
    currentPeriodEnd: new Date(item.current_period_end * 1000),
    cancelAtPeriodEnd: sub.cancel_at_period_end || sub.cancel_at !== null,
  };
  await db.subscription.upsert({
    where: { workspaceId },
    create: { workspaceId, stripeCustomerId: customerId, ...fields },
    update: fields,
  });
}

// Keeps Stripe charging for the locations switched on now. Changes are prorated, so a location
// added mid-month costs only the rest of the month.
export async function syncQuantity(workspaceId: string): Promise<void> {
  if (!billingOn()) return;
  const known = await prisma.subscription.findUnique({ where: { workspaceId } });
  if (!known?.stripeSubscriptionId || !LIVE_STATUSES.includes(known.status ?? '')) return;
  // Our copy is trusted for a day at most. Stripe reports each change back by webhook, but one
  // that never arrives, or a change that reached Stripe late, such as from a holder of the lock
  // that ran out of time, is put right by asking Stripe again.
  const fresh = Date.now() - known.updatedAt.getTime() < DAY;
  if (fresh && known.quantity === Math.max(1, await locationCount(workspaceId))) return;
  await customerLock(known.stripeCustomerId, async (tx) => {
    const row = await tx.subscription.findUnique({ where: { workspaceId } });
    if (!row?.stripeSubscriptionId) return;
    // Counted again under the lock, in case a location was switched off while waiting for it.
    const want = Math.max(1, await locationCount(workspaceId, tx));
    const sub = await stripe().subscriptions.retrieve(row.stripeSubscriptionId);
    const item = ourItem(sub);
    if (!item || !LIVE_STATUSES.includes(sub.status) || item.quantity === want) {
      await saveSubscription(tx, sub);
      return;
    }
    const updated = await stripe().subscriptions.update(sub.id, {
      items: [{ id: item.id, quantity: want }],
      proration_behavior: 'create_prorations',
    });
    await saveSubscription(tx, updated);
    await recordAudit(
      {
        action: 'billing.locations_changed',
        workspaceId,
        meta: { from: item.quantity ?? null, to: want },
      },
      tx,
    );
  });
}

const cancelFailed = () =>
  new HttpError(
    502,
    "We couldn't cancel this workspace's plan with Stripe, so nothing was deleted. Please try again in a moment.",
    'billing_cancel_failed',
  );

// A deleted workspace, on its own or with its owner's account, stops paying at once. This runs
// before the workspace is marked deleted, so if Stripe can't be reached the deletion stops and the
// owner can try again, rather than a card being charged for a workspace that no longer exists.
export async function cancelForDeletedWorkspace(
  workspaceId: string,
  actorUserId: string | null,
): Promise<void> {
  // No customer means checkout was never opened, so there is nothing to cancel.
  const known = await prisma.subscription.findUnique({ where: { workspaceId } });
  if (!known) return;
  if (!stripeAvailable()) {
    if (!known.stripeSubscriptionId || ENDED_STATUSES.includes(known.status ?? '')) return;
    // Billing was set up and later removed from this server. The plan can't be cancelled from
    // here, so nothing is deleted until someone puts the key back or cancels it in Stripe.
    Sentry.captureMessage('Workspace deletion stopped: its plan needs cancelling in Stripe', {
      extra: { workspaceId, subscription: known.stripeSubscriptionId },
    });
    throw new HttpError(
      502,
      "We couldn't cancel this workspace's plan, so nothing was deleted. Please contact us and we'll sort it out.",
      'billing_cancel_failed',
    );
  }
  const allCancelled = await customerLock(known.stripeCustomerId, async (tx) => {
    // A checkout left open in another tab could otherwise still be paid once the workspace is gone.
    const row = await tx.subscription.findUnique({ where: { workspaceId } });
    if (row?.checkoutSessionId) await closeCheckout(row.checkoutSessionId);
    // Stripe's own list rather than our copy, which may not have caught up: it includes a plan
    // paid moments ago, or one that replaced the plan we know about. Anything Stripe hasn't ended
    // is cancelled, including a plan left unpaid or paused.
    const subs = await customerSubscriptions(known.stripeCustomerId).catch(() => {
      throw cancelFailed();
    });
    let cancelledAll = true;
    for (const sub of subs) {
      if (!ourItem(sub) || ENDED_STATUSES.includes(sub.status)) continue;
      const canceled = await stripe()
        .subscriptions.cancel(sub.id)
        .catch(async () => {
          // Already cancelled in Stripe since the list was read is fine.
          const current = await currentSubscription(sub.id).catch(() => null);
          return current && ENDED_STATUSES.includes(current.status) ? current : null;
        });
      // The rest are still tried, so each one cancelled is saved and recorded below.
      if (!canceled) {
        cancelledAll = false;
        continue;
      }
      await saveSubscription(tx, canceled);
      await recordAudit(
        {
          action: 'billing.canceled_on_delete',
          workspaceId,
          actorUserId,
          meta: { subscription: canceled.id },
        },
        tx,
      );
    }
    return cancelledAll;
  });
  // Stopped only now, once the plans that were cancelled are saved: Stripe doesn't undo a cancel,
  // so neither should the record of it.
  if (!allCancelled) throw cancelFailed();
}

// Every subscription the customer has, page by page.
async function customerSubscriptions(customer: string): Promise<Stripe.Subscription[]> {
  const all: Stripe.Subscription[] = [];
  for (;;) {
    const last = all.at(-1);
    const page = await stripe().subscriptions.list({
      customer,
      status: 'all',
      limit: 100,
      ...(last ? { starting_after: last.id } : {}),
    });
    all.push(...page.data);
    if (!page.has_more || page.data.length === 0) return all;
  }
}

// Makes sure a checkout can't be paid any more. Stripe won't expire one that was paid or has
// already expired, which is fine: a plan it started is cancelled with the rest. One that may still
// be open stops the deletion, so the owner can try again.
async function closeCheckout(sessionId: string): Promise<void> {
  const closed = await stripe()
    .checkout.sessions.expire(sessionId)
    .then(
      () => true,
      async () => {
        try {
          const session = await stripe().checkout.sessions.retrieve(sessionId);
          return session.status === 'expired' || session.status === 'complete';
        } catch (err) {
          // Stripe has no such checkout, so nobody can pay it.
          return (err as { code?: string }).code === 'resource_missing';
        }
      },
    );
  if (!closed) throw cancelFailed();
}

onWorkspaceDeleted(cancelForDeletedWorkspace);

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

// The events the webhook acts on. One already handled is skipped, however often Stripe sends it.
// An event is recorded as handled only once the work is done, so one cut short, even by the server
// stopping halfway, is handled when Stripe sends it again. Handling one twice does no harm: each
// reads the latest state from Stripe.
export async function handleEvent(event: Stripe.Event): Promise<void> {
  const seen = await prisma.stripeEvent.findUnique({
    where: { id: event.id },
    select: { id: true },
  });
  if (seen) return;
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      if (session.mode === 'subscription' && session.subscription) {
        await syncSubscription(
          idOf(session.subscription),
          session.customer ? idOf(session.customer) : null,
        );
      }
      break;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
    case 'customer.subscription.paused':
    case 'customer.subscription.resumed':
      await syncSubscription(event.data.object.id, idOf(event.data.object.customer));
      break;
    case 'invoice.paid':
    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      const subscription = invoiceSubscription(invoice);
      if (subscription) {
        await syncSubscription(subscription, invoice.customer ? idOf(invoice.customer) : null);
      }
      break;
    }
    default:
      break;
  }
  await prisma.stripeEvent.createMany({
    data: [{ id: event.id, type: event.type }],
    skipDuplicates: true,
  });
}
