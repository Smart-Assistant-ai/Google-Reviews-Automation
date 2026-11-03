const env = require('../config/env');
const googleService = require('../services/google.service');
const syncService = require('../services/sync.service');
const connectionService = require('../services/connection.service');
const { Workspace } = require('../models');

module.exports = async function googleRoutes(app) {
  app.get('/connect', { preHandler: app.authenticate }, async (request) => googleService.startConnect(request.user.wid));

  // Public: Google (or the mock consent page) redirects the browser here.
  app.get('/callback', async (request, reply) => {
    try {
      const workspaceId = await googleService.handleCallback(request.query);
      await connectionService.loadProfile(workspaceId);
      await Workspace.update({ onboardingStep: 'done' }, { where: { id: workspaceId } });
      return reply.redirect(`${env.frontendUrl}/onboarding?google_connected=true`);
    } catch (err) {
      request.log.warn(err, 'google callback failed');
      const conflict = err.code === 'google_account_conflict' ? '&conflict=true' : '';
      return reply.redirect(`${env.frontendUrl}/onboarding?google_connected=false${conflict}&error=${encodeURIComponent(err.message)}`);
    }
  });

  app.get('/status', { preHandler: app.authenticate }, async (request) => googleService.getStatus(request.user.wid));

  app.post('/sync', { preHandler: app.authenticate }, async (request) => syncService.syncWorkspace(request.user.wid));

  // Reads the profile again, for example once Google has approved API access.
  app.post('/recheck', { preHandler: app.authenticate }, async (request) => {
    await connectionService.requireConnection(request.user.wid);
    await connectionService.loadProfile(request.user.wid);
    return googleService.getStatus(request.user.wid);
  });

  app.post('/sample-data', { preHandler: app.authenticate }, async (request) => {
    await connectionService.useSampleData(request.user.wid, request.user.sub);
    return googleService.getStatus(request.user.wid);
  });

  app.delete('/sample-data', { preHandler: app.authenticate }, async (request) => {
    await connectionService.stopSampleData(request.user.wid, request.user.sub);
    return googleService.getStatus(request.user.wid);
  });

  app.delete('/connection', { preHandler: app.authenticate }, async (request) => {
    await googleService.disconnect(request.user.wid, request.user.sub);
    return { ok: true };
  });
};
