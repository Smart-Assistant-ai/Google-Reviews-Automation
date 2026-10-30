const Fastify = require('fastify');
const env = require('./config/env');

function buildApp() {
  const app = Fastify({ logger: { level: 'info' } });

  app.register(require('@fastify/cors'), { origin: env.frontendUrl, credentials: true });
  app.register(require('@fastify/jwt'), { secret: env.jwtSecret });

  app.decorate('authenticate', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      reply.code(401).send({ error: 'Unauthorized' });
    }
  });

  app.setErrorHandler((err, request, reply) => {
    const status = err.statusCode || 500;
    if (status >= 500) request.log.error(err);
    reply.code(status).send({ error: err.message });
  });

  app.register(require('./routes/auth.routes'), { prefix: '/api/v1/auth' });

  app.get('/health', async () => ({ ok: true, gbpProvider: env.gbpProvider }));

  return app;
}

module.exports = { buildApp };
