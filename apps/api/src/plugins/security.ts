import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { env } from '../config';
import { HttpError } from '../lib/errors';

export interface SecurityOptions {
  rateLimit?: { max: number } | false;
}

export const ACCESS_TOKEN_TTL = '15m';

export const securityPlugin = fp<SecurityOptions>(async (app: FastifyInstance, options) => {
  await app.register(helmet);
  await app.register(cors, { origin: env.APP_URL, credentials: true });
  await app.register(cookie);
  await app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: { algorithm: 'HS256', expiresIn: ACCESS_TOKEN_TTL },
    verify: { algorithms: ['HS256'] },
  });
  // Kept in memory, which is correct while the API runs as one process.
  if (options.rateLimit !== false) {
    await app.register(rateLimit, {
      max: options.rateLimit?.max ?? 300,
      timeWindow: '1 minute',
      errorResponseBuilder: () => new HttpError(429, 'Too many requests. Please slow down and try again.', 'rate_limited'),
    });
  }
});
