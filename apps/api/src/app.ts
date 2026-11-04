import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import { env } from './config';
import { accessPlugin } from './plugins/access';
import { registerErrorHandling } from './plugins/errors';
import { healthRoutes } from './plugins/health';
import { authRoutes } from './modules/auth/routes';
import { googleCallbackRoutes, googleRoutes } from './modules/google/routes';
import { invitationRoutes, workspaceRoutes } from './modules/workspaces/routes';
import { securityPlugin, type SecurityOptions } from './plugins/security';

export interface BuildOptions extends SecurityOptions {
  extraRoutes?: (app: FastifyInstance) => void;
}

// Order matters: errors first so everything is covered, then security, then the access rules
// that every route below must declare.
export async function buildApp(options: BuildOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: env.LOG_LEVEL === 'silent' ? false : { level: env.LOG_LEVEL },
    trustProxy: env.TRUST_PROXY,
    bodyLimit: 1024 * 1024,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerErrorHandling(app);

  await app.register(securityPlugin, {
    rateLimit: options.rateLimit ?? (env.NODE_ENV === 'test' ? false : undefined),
  });
  await app.register(accessPlugin);

  await app.register(healthRoutes);
  await app.register(authRoutes, { prefix: '/api/v1/auth' });
  await app.register(workspaceRoutes, { prefix: '/api/v1/workspaces' });
  await app.register(invitationRoutes, { prefix: '/api/v1/invitations' });
  await app.register(googleRoutes, { prefix: '/api/v1/workspaces/:workspaceId/google' });
  await app.register(googleCallbackRoutes, { prefix: '/api/v1/google' });
  options.extraRoutes?.(app);

  await app.ready();
  return app;
}
