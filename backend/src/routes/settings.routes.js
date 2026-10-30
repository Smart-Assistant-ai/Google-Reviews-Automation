const { VoiceProfile, Workspace, AuditLog } = require('../models');
const rulesService = require('../services/rules.service');
const { usingLlm } = require('../services/draft.service');

const VOICE_FIELDS = ['businessName', 'tone', 'signOff', 'ownerName', 'alwaysSay', 'neverSay', 'languageMode'];

const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]));

module.exports = async function settingsRoutes(app) {
  app.addHook('preHandler', app.authenticate);

  app.get('/voice', async (request) => {
    const voice = await VoiceProfile.findOne({ where: { workspaceId: request.user.wid } });
    return { ...pick(voice.toJSON(), VOICE_FIELDS), drafter: usingLlm ? 'openai' : 'template' };
  });

  app.put('/voice', async (request) => {
    const voice = await VoiceProfile.findOne({ where: { workspaceId: request.user.wid } });
    await voice.update(pick(request.body || {}, VOICE_FIELDS));
    const workspace = await Workspace.findByPk(request.user.wid);
    if (workspace.onboardingStep === 'voice') await workspace.update({ onboardingStep: 'rules' });
    if (request.body?.businessName) await workspace.update({ name: request.body.businessName });
    return pick(voice.toJSON(), VOICE_FIELDS);
  });

  app.get('/rules', async (request) => rulesService.list(request.user.wid));

  app.put('/rules/:id', async (request) =>
    rulesService.update(request.user.wid, request.user.sub, request.params.id, request.body || {}));

  app.post('/onboarding/complete', async (request) => {
    await Workspace.update({ onboardingStep: 'done' }, { where: { id: request.user.wid } });
    return { ok: true };
  });

  app.get('/activity', async (request) => {
    const rows = await AuditLog.findAll({ where: { workspaceId: request.user.wid }, order: [['created_at', 'DESC']], limit: 50 });
    return rows.map((r) => ({ id: r.id, action: r.action, reviewId: r.reviewId, meta: r.meta, createdAt: r.createdAt }));
  });
};
