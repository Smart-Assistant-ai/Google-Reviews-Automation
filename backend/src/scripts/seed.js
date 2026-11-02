// Creates the demo account. `npm run seed -- --connected` also connects the mock
// Google profile and syncs reviews, so the inbox is full straight after login.
const { sequelize, User, GoogleConnection, Workspace } = require('../models');
const authService = require('../services/auth.service');
const googleService = require('../services/google.service');
const syncService = require('../services/sync.service');
const draftQueue = require('../jobs/draft.queue');
const aes = require('../utils/crypto.aes');

const DEMO = { email: 'demo@replypilot.app', password: 'demo1234', name: 'Joe Fernandes', businessName: "Joe's Wood-Fired Pizza" };

async function waitForDrafts() {
  while (draftQueue.size() > 0) await new Promise((r) => setTimeout(r, 300));
}

async function main() {
  await sequelize.authenticate();
  const existing = await User.findOne({ where: { email: DEMO.email } });
  if (existing) await existing.destroy();

  const { workspace } = await authService.signup(DEMO);
  console.log(`Demo user: ${DEMO.email} / ${DEMO.password}`);

  if (process.argv.includes('--connected')) {
    await GoogleConnection.create({
      workspaceId: workspace.id, provider: 'mock', googleEmail: 'owner@joespizza.example',
      accessToken: aes.encrypt('mock-access'), refreshToken: aes.encrypt('mock-refresh'),
      expiresAt: new Date(Date.now() + 3600000), status: 'healthy',
    });
    await googleService.attachProfile(workspace.id);
    const result = await syncService.syncWorkspace(workspace.id);
    await waitForDrafts();
    await Workspace.update({ onboardingStep: 'done' }, { where: { id: workspace.id } });
    console.log(`Connected mock Google profile, synced ${result.fetched} reviews`);
  }
  await sequelize.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
