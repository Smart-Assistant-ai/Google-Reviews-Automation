import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/health', { config: { access: 'public' } }, async (request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', database: 'ok' };
    } catch (err) {
      request.log.error({ err }, 'health check failed');
      return reply.code(503).send({ status: 'unavailable', database: 'unreachable' });
    }
  });
}
