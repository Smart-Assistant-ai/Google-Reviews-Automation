import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { safeEqual } from '../../lib/crypto';
import { GOOGLE_COOKIE_PATH } from '../../lib/google-redirect';
import { verifyState } from '../../lib/signed-state';

type Payload = Record<string, unknown>;

export interface GoogleCallbackQuery {
  code?: string;
  state?: string;
  error?: string;
}

// Each Google flow registers here: signing in, and connecting a Business Profile. They share one
// return address, and the signed state says which flow a visitor is in.
export interface GoogleCallbackFlow {
  purpose: string;
  cookie: string;
  failUrl: (reason: string, payload?: Payload) => string;
  handle: (
    request: FastifyRequest,
    reply: FastifyReply,
    payload: Payload,
    query: GoogleCallbackQuery,
  ) => Promise<FastifyReply>;
}

const flows = new Map<string, GoogleCallbackFlow>();

export function registerGoogleCallbackFlow(flow: GoogleCallbackFlow): void {
  flows.set(flow.purpose, flow);
}

export async function googleCallbackRoutes(instance: FastifyInstance): Promise<void> {
  const app = instance.withTypeProvider<ZodTypeProvider>();

  // Google redirects the browser here, so it is public. The signed state and matching cookie are the proof.
  app.get(
    '/callback',
    {
      config: { access: 'public', rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: {
        querystring: z.object({
          code: z.string().optional(),
          state: z.string().optional(),
          error: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      const all = [...flows.values()];
      for (const flow of all) reply.clearCookie(flow.cookie, { path: GOOGLE_COOKIE_PATH });

      for (const flow of all) {
        const payload = verifyState(flow.purpose, request.query.state);
        if (!payload) continue;
        // The cookie proves this browser started the flow, so a link can't be sent to someone else to finish.
        const cookie = request.cookies[flow.cookie];
        if (!cookie || !safeEqual(cookie, String(payload.nonce))) {
          return reply.redirect(flow.failUrl('google_state', payload));
        }
        return flow.handle(request, reply, payload, request.query);
      }

      // A forged or expired state. Send them back to where they started, judged by the cookie they carry.
      const started = all.find((flow) => request.cookies[flow.cookie]) ?? all[0];
      return reply.redirect(started ? started.failUrl('google_state') : '/');
    },
  );
}
