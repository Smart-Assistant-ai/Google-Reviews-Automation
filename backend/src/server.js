const env = require('./config/env');
const { buildApp } = require('./app');
const { sequelize } = require('./models');
const runner = require('./jobs/runner');

async function start() {
  await sequelize.authenticate();
  const app = buildApp();
  await app.listen({ port: env.port, host: '0.0.0.0' });
  runner.start();
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
