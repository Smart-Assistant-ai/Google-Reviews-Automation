const env = require('../config/env');
const googleService = require('../services/google.service');
const syncService = require('../services/sync.service');

module.exports = async function googleRoutes(app) {
  app.get('/connect', { preHandler: app.authenticate }, async (request) => googleService.startConnect(request.user.wid));

  // Public: Google (or the mock consent page) redirects the browser here.
  app.get('/callback', async (request, reply) => {
    try {
      await googleService.handleCallback(request.query);
      return reply.redirect(`${env.frontendUrl}/onboarding?google_connected=true`);
    } catch (err) {
      request.log.warn(err, 'google callback failed');
      return reply.redirect(`${env.frontendUrl}/onboarding?google_connected=false&error=${encodeURIComponent(err.message)}`);
    }
  });

  app.get('/status', { preHandler: app.authenticate }, async (request) => googleService.getStatus(request.user.wid));

  app.get('/locations', { preHandler: app.authenticate }, async (request) => googleService.listLocations(request.user.wid));

  app.post('/locations/select', { preHandler: app.authenticate }, async (request) => {
    const location = await googleService.selectLocation(request.user.wid, request.body?.locationId);
    const result = await syncService.syncLocation(location.id, { initial: true });
    return { ok: true, sync: result };
  });

  app.post('/sync', { preHandler: app.authenticate }, async (request) => syncService.syncWorkspace(request.user.wid));

  app.delete('/connection', { preHandler: app.authenticate }, async (request) => {
    await googleService.disconnect(request.user.wid, request.user.sub);
    return { ok: true };
  });
};
