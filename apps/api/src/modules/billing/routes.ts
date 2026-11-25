import {
  billingRedirectSchema,
  billingStatusSchema,
  checkoutBody,
  confirmCheckoutBody,
  uuidSchema,
} from '@replypilot/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type Stripe from 'stripe';
import { z } from 'zod';
import { env } from '../../config';
import { HttpError, notFound } from '../../lib/errors';
import { currentMember } from '../../plugins/access';
import {
  billingStatus,
  confirmCheckout,
  handleEvent,
  portalUrl,
  refreshPlan,
  startCheckout,
} from './service';
import { stripe, stripeAvailable } from './stripe';

const workspaceParams = z.object({ workspaceId: uuidSchema });

// Everyone in a workspace can see its plan, so the app can say why drafting stopped. Only the
// owner can pay or change the plan, as the roles table in the product plan sets out.
export async function billingRoutes(instance: FastifyInstance): Promise<void> {
  const app = instance.withTypeProvider<ZodTypeProvider>();

  app.get(
    '/',
    {
      config: { access: 'member' },
      schema: { params: workspaceParams, response: { 200: billingStatusSchema } },
    },
    async (request) => billingStatus(currentMember(request).workspaceId),
  );

  app.post(
    '/checkout',
    {
      config: { access: 'owner', rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        params: workspaceParams,
        body: checkoutBody,
        response: { 200: billingRedirectSchema },
      },
    },
    async (request) => {
      const member = currentMember(request);
      const url = await startCheckout(member.workspaceId, member.userId, request.body.interval);
      return { url };
    },
  );

  app.post(
    '/checkout/confirm',
    {
      config: { access: 'owner' },
      schema: {
        params: workspaceParams,
        body: confirmCheckoutBody,
        response: { 200: billingStatusSchema },
      },
    },
    async (request) => {
      const { workspaceId } = currentMember(request);
      await confirmCheckout(workspaceId, request.body.sessionId);
      return billingStatus(workspaceId);
    },
  );

  app.post(
    '/portal',
    {
      config: { access: 'owner', rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: { params: workspaceParams, response: { 200: billingRedirectSchema } },
    },
    async (request) => ({ url: await portalUrl(currentMember(request).workspaceId) }),
  );

  app.post(
    '/refresh',
    {
      config: { access: 'owner', rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: { params: workspaceParams, response: { 200: billingStatusSchema } },
    },
    async (request) => {
      const { workspaceId } = currentMember(request);
      await refreshPlan(workspaceId);
      return billingStatus(workspaceId);
    },
  );
}

// Stripe calls this when a subscription changes. Stripe signs the exact bytes it sent, so this
// route, and only this one, reads the body as bytes rather than JSON.
export async function billingWebhookRoutes(app: FastifyInstance): Promise<void> {
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_request, body, done) =>
    done(null, body),
  );

  // Events are handled even while BILLING_PROVIDER is off: Stripe keeps renewing and cancelling
  // subscriptions meanwhile, and answering with errors would make it give up on the endpoint and
  // leave stale plans for when billing is switched back on.
  app.post('/webhook', { config: { access: 'public' } }, async (request) => {
    if (!env.STRIPE_WEBHOOK_SECRET || !stripeAvailable()) throw notFound();
    const signature = request.headers['stripe-signature'];
    let event: Stripe.Event;
    try {
      event = stripe().webhooks.constructEvent(
        request.body as Buffer,
        typeof signature === 'string' ? signature : '',
        env.STRIPE_WEBHOOK_SECRET,
      );
    } catch {
      throw new HttpError(400, 'The Stripe signature did not match', 'bad_signature');
    }
    await handleEvent(event);
    return { received: true };
  });
}
