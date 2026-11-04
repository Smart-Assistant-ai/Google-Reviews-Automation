import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildApp } from '../../src/app';
import { env } from '../../src/config';
import { HttpError } from '../../src/lib/errors';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp({
    extraRoutes: (instance) => {
      instance.get('/test/boom', { config: { access: 'public' } }, async () => {
        throw new Error('connection to db-prod-7 failed with password hunter2');
      });
      instance.get('/test/safe', { config: { access: 'public' } }, async () => {
        throw new HttpError(409, 'That email is taken', 'email_taken');
      });
      instance.post(
        '/test/validate',
        { config: { access: 'public' }, schema: { body: z.object({ email: z.string().email() }) } },
        async () => ({ ok: true }),
      );
      instance.get('/test/private', { config: { access: 'authenticated' } }, async () => ({ ok: true }));
    },
  });
});

afterAll(() => app.close());

describe('request pipeline', () => {
  it('refuses to start if a route does not declare who can reach it', async () => {
    await expect(
      buildApp({
        extraRoutes: (instance) => {
          instance.get('/test/forgot', async () => ({ ok: true }));
        },
      }),
    ).rejects.toThrow(/GET \/test\/forgot must declare config\.access/);
  });

  it('refuses a workspace rule on a route with no workspace in its URL', async () => {
    await expect(
      buildApp({
        extraRoutes: (instance) => {
          instance.get('/test/wrong', { config: { access: 'member' } }, async () => ({ ok: true }));
        },
      }),
    ).rejects.toThrow(/needs :workspaceId/);
  });

  it('hides internal error details and gives a request id', async () => {
    const res = await app.inject({ url: '/test/boom' });
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain('hunter2');
    expect(res.body).not.toContain('db-prod');
    const { error } = res.json();
    expect(error.code).toBe('internal_error');
    expect(error.requestId).toBeTruthy();
  });

  it('shows the message of an error meant for users', async () => {
    const res = await app.inject({ url: '/test/safe' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatchObject({ code: 'email_taken', message: 'That email is taken' });
  });

  it('explains which field failed validation', async () => {
    const res = await app.inject({ method: 'POST', url: '/test/validate', payload: { email: 'nope' } });
    expect(res.statusCode).toBe(400);
    const { error } = res.json();
    expect(error.code).toBe('validation_error');
    expect(error.fields[0].path).toBe('email');
  });

  it('answers malformed JSON with a 400, not a 500', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/test/validate',
      headers: { 'content-type': 'application/json' },
      payload: '{not json',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('bad_request');
  });

  it('answers an unknown route with the same error shape', async () => {
    const res = await app.inject({ url: '/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('not_found');
  });

  it('requires a login on an authenticated route', async () => {
    const res = await app.inject({ url: '/test/private' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('unauthorized');
  });

  it('refuses a forged token', async () => {
    const res = await app.inject({ url: '/test/private', headers: { authorization: 'Bearer abc.def.ghi' } });
    expect(res.statusCode).toBe(401);
  });

  it('sends security headers', async () => {
    const res = await app.inject({ url: '/api/v1/health' });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toBeTruthy();
  });

  it('health check confirms the database answers and reveals nothing else', async () => {
    const res = await app.inject({ url: '/api/v1/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', database: 'ok' });
  });

  it('lists every route with its access rule', () => {
    const routes = (app as FastifyInstance & { routeAccess: { url: string; access: string }[] }).routeAccess;
    expect(routes.find((r) => r.url === '/api/v1/health')?.access).toBe('public');
  });
});

describe('behind the proxy', () => {
  it('uses the address Nginx saw, so a client cannot fake its way around rate limits', async () => {
    const before = env.TRUST_PROXY;
    env.TRUST_PROXY = true;
    const proxied = await buildApp({
      extraRoutes: (instance) => {
        instance.get('/test/ip', { config: { access: 'public' } }, async (request) => ({ ip: request.ip }));
      },
    });
    env.TRUST_PROXY = before;
    // What Nginx forwards when a client sends its own forged header: the fake first, the real last.
    const res = await proxied.inject({
      url: '/test/ip',
      remoteAddress: '127.0.0.1',
      headers: { 'x-forwarded-for': '6.6.6.6, 203.0.113.9' },
    });
    expect(res.json().ip).toBe('203.0.113.9');
    await proxied.close();
  });
});

describe('rate limiting', () => {
  it('slows down a client making too many requests', async () => {
    const limited = await buildApp({ rateLimit: { max: 3 } });
    const codes: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      codes.push((await limited.inject({ url: '/api/v1/health' })).statusCode);
    }
    expect(codes).toEqual([200, 200, 200, 429]);
    const res = await limited.inject({ url: '/api/v1/health' });
    expect(res.json().error.code).toBe('rate_limited');
    await limited.close();
  });
});
