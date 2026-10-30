const statsService = require('../services/stats.service');

module.exports = async function statsRoutes(app) {
  app.get('/', { preHandler: app.authenticate }, async (request) => statsService.overview(request.user.wid, request.query));
};
