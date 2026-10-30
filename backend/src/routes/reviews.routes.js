const reviewService = require('../services/review.service');
const replyService = require('../services/reply.service');

module.exports = async function reviewsRoutes(app) {
  app.addHook('preHandler', app.authenticate);

  const wid = (request) => request.user.wid;
  const uid = (request) => request.user.sub;
  const fresh = (request) => reviewService.get(wid(request), request.params.id);

  app.get('/', async (request) => reviewService.list(wid(request), request.query));

  app.get('/:id', async (request) => fresh(request));

  app.put('/:id/reply', async (request) => {
    await replyService.saveDraft(wid(request), uid(request), request.params.id, request.body?.text || '');
    return fresh(request);
  });

  app.post('/:id/reply/regenerate', async (request) => {
    await replyService.regenerate(wid(request), uid(request), request.params.id, request.body?.instructions);
    return fresh(request);
  });

  app.post('/:id/reply/post', async (request) => {
    await replyService.postNow(wid(request), uid(request), request.params.id, request.body?.text);
    return fresh(request);
  });

  app.post('/:id/reply/cancel-schedule', async (request) => {
    await replyService.cancelSchedule(wid(request), uid(request), request.params.id);
    return fresh(request);
  });

  app.delete('/:id/reply', async (request) => {
    await replyService.deleteReply(wid(request), uid(request), request.params.id);
    return fresh(request);
  });
};
