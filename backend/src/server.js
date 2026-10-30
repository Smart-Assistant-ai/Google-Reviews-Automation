const env = require('./config/env');
const { buildApp } = require('./app');

async function start() {
  const app = buildApp();
  await app.listen({ port: env.port, host: '0.0.0.0' });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
