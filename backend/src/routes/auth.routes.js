const authService = require('../services/auth.service');

module.exports = async function authRoutes(app) {
  const issue = (reply, result) => {
    const token = app.jwt.sign({ sub: result.user.id, wid: result.workspace.id }, { expiresIn: '7d' });
    return reply.send({ token, ...authService.serialize(result) });
  };

  app.post('/signup', async (request, reply) => issue(reply, await authService.signup(request.body || {})));

  app.post('/login', async (request, reply) => issue(reply, await authService.login(request.body || {})));

  app.get('/me', { preHandler: app.authenticate }, async (request) => {
    const result = await authService.me(request.user.sub, request.user.wid);
    return authService.serialize(result);
  });
};
