const mockProvider = require('../providers/gbp/mock.provider');
const syncService = require('../services/sync.service');
const { selectedLocation } = require('../services/review.service');
const { getStatus } = require('../services/google.service');
const { HttpError } = require('../utils/errors');

// Demo helpers, only available while an account is using the sample profile.
module.exports = async function devRoutes(app) {
  app.addHook('preHandler', app.authenticate);

  app.post('/simulate-review', async (request) => {
    const { sample } = await getStatus(request.user.wid);
    if (!sample) throw new HttpError(404, 'Not found');
    const location = await selectedLocation(request.user.wid);
    const overrides = {};
    if (request.body?.stars) overrides.stars = Number(request.body.stars);
    if (request.body?.text !== undefined) overrides.text = request.body.text;
    if (request.body?.name) overrides.name = request.body.name;
    const review = mockProvider.simulateNewReview(location.googleAccountName, location.googleLocationName, overrides);
    const sync = await syncService.syncLocation(location.id);
    return { review, sync };
  });
};
