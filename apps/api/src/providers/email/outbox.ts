import { outboxResponse } from '@replypilot/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { env } from '../../config';
import { sentEmails } from './mock';

// Only while email is the local mock. Production refuses that setting, so this never exists there.
export const devOutboxEnabled = () =>
  env.EMAIL_PROVIDER === 'mock' && env.NODE_ENV !== 'production';

export async function devOutboxRoutes(instance: FastifyInstance): Promise<void> {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  app.get(
    '/outbox',
    { config: { access: 'public' }, schema: { response: { 200: outboxResponse } } },
    async () => ({
      emails: [...sentEmails]
        .reverse()
        .slice(0, 50)
        .map(({ to, subject, text, sentAt }) => ({ to, subject, text, sentAt })),
    }),
  );
}
