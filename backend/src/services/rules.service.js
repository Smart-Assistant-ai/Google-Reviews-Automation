const { Reply, Review, Location, AutoReplyRule, AuditLog } = require('../models');
const { HttpError } = require('../utils/errors');

// v1 policy: low ratings always need a human (design §5.4).
const MIN_AUTO_STARS = 4;

function matches(rule, review) {
  if (!rule.enabled || !rule.consentedAt) return false;
  if (review.starRating < Math.max(rule.minStars, MIN_AUTO_STARS) || review.starRating > rule.maxStars) return false;
  const hasText = !!(review.comment && review.comment.trim());
  if (rule.textCondition === 'with_text' && !hasText) return false;
  if (rule.textCondition === 'without_text' && hasText) return false;
  // Rules never apply to reviews written before the owner consented (no surprise posts on old reviews).
  return new Date(review.createTime) >= new Date(rule.consentedAt);
}

// Called whenever a fresh AI draft is ready. Schedules an auto-post if an opted-in rule matches.
async function evaluate(replyId) {
  const reply = await Reply.findByPk(replyId, { include: [{ model: Review, include: [Location] }] });
  if (!reply || reply.state !== 'draft' || reply.source !== 'ai') return null;
  const review = reply.Review;
  const rules = await AutoReplyRule.findAll({
    where: { workspaceId: review.Location.workspaceId, enabled: true },
    order: [['delay_minutes', 'ASC']],
  });
  const rule = rules.find((r) => matches(r, review));
  if (!rule) return null;

  await reply.update({
    state: 'scheduled',
    autoRuleId: rule.id,
    scheduledFor: new Date(Date.now() + rule.delayMinutes * 60000),
  });
  await AuditLog.create({
    workspaceId: review.Location.workspaceId, reviewId: review.id, action: 'reply.scheduled',
    meta: { ruleId: rule.id, ruleName: rule.name, delayMinutes: rule.delayMinutes },
  });
  return rule;
}

const serialize = (r) => ({
  id: r.id, name: r.name, minStars: r.minStars, maxStars: r.maxStars, textCondition: r.textCondition,
  delayMinutes: r.delayMinutes, enabled: r.enabled, consentedAt: r.consentedAt,
});

async function list(workspaceId) {
  const rules = await AutoReplyRule.findAll({ where: { workspaceId }, order: [['created_at', 'ASC']] });
  return rules.map(serialize);
}

async function update(workspaceId, userId, ruleId, { enabled, delayMinutes, consent }) {
  const rule = await AutoReplyRule.findOne({ where: { id: ruleId, workspaceId } });
  if (!rule) throw new HttpError(404, 'Rule not found');
  const changes = {};
  if (delayMinutes !== undefined) changes.delayMinutes = Math.max(0, Math.min(10080, Number(delayMinutes) || 0));
  if (enabled === true && !rule.enabled) {
    // Google policy: no automated replies without the business's explicit consent.
    if (consent !== true) throw new HttpError(400, 'Please confirm you allow ReplyPilot to post these replies automatically');
    Object.assign(changes, { enabled: true, consentedAt: new Date(), consentedBy: userId });
  }
  if (enabled === false) Object.assign(changes, { enabled: false });
  await rule.update(changes);
  await AuditLog.create({ workspaceId, userId, action: 'rule.updated', meta: { ruleId, ...changes } });

  if (enabled === false) {
    // Turning a rule off cancels anything it had queued.
    await Reply.update({ state: 'draft', scheduledFor: null, autoRuleId: null }, { where: { autoRuleId: ruleId, state: 'scheduled' } });
  }
  return serialize(rule);
}

module.exports = { evaluate, list, update, matches, MIN_AUTO_STARS };
