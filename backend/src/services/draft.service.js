const OpenAI = require('openai');
const env = require('../config/env');
const { Review, Reply, Location, VoiceProfile } = require('../models');
const { analyze } = require('./analysis');
const templateDrafter = require('./template.drafter');
const { byteLength, DRAFT_TARGET_BYTES } = require('../utils/bytes');

const openai = env.openai.apiKey ? new OpenAI({ apiKey: env.openai.apiKey }) : null;

const TONES = {
  warm: 'warm, personal and genuine',
  professional: 'polite, concise and professional',
  playful: 'friendly and lightly playful (one emoji at most)',
};

function systemPrompt(voice) {
  return [
    `You write public replies to Google reviews on behalf of ${voice.businessName || 'a hotel'}.`,
    `Tone: ${TONES[voice.tone] || TONES.warm}.`,
    voice.languageMode === 'english' ? 'Always reply in English.' : 'Reply in the same language the reviewer used.',
    voice.signOff ? `End with this sign-off on its own line: "${voice.signOff}"` : '',
    voice.alwaysSay ? `Where natural, include: ${voice.alwaysSay}` : '',
    voice.neverSay ? `Never mention: ${voice.neverSay}` : '',
    'Rules: address the reviewer by first name; reference something specific they said; 2-4 sentences;',
    'never offer discounts, freebies or anything in exchange for changing a review; never admit legal liability;',
    'never include phone numbers, emails or links; for negative reviews apologize and invite them to contact the hotel;',
    'do not start with the same words as the recent replies provided.',
    'Respond as JSON: {"reply": string, "sentiment": "positive"|"neutral"|"negative", "topics": string[] (max 3, short), "language": ISO 639-1 code}.',
  ].filter(Boolean).join('\n');
}

async function llmDraft({ review, voice, recentReplies, instructions }) {
  const user = [
    `Rating: ${review.starRating}/5`,
    `Reviewer: ${review.reviewerName || 'Anonymous'}`,
    `Review: ${review.comment || '(no text, rating only)'}`,
    recentReplies.length ? `Recent replies (vary from these):\n- ${recentReplies.join('\n- ')}` : '',
    instructions ? `Extra instruction from the owner: ${instructions}` : '',
  ].filter(Boolean).join('\n');

  const res = await openai.chat.completions.create({
    model: env.openai.model,
    response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: systemPrompt(voice) }, { role: 'user', content: user }],
  });
  const parsed = JSON.parse(res.choices[0].message.content);
  if (!parsed.reply) throw new Error('LLM returned no reply');
  return parsed;
}

// Drafts (or re-drafts) the AI reply for a review. Never touches replies already posted.
async function draftForReview(reviewId, { instructions } = {}) {
  const review = await Review.findByPk(reviewId, { include: [Location, Reply] });
  if (!review) return null;
  const reply = review.Reply;
  if (reply && !['drafting', 'draft', 'rejected', 'failed'].includes(reply.state)) return reply;

  const voice = (await VoiceProfile.findOne({ where: { workspaceId: review.Location.workspaceId } }))
    || { tone: 'warm', languageMode: 'match' };
  const recent = await Reply.findAll({
    include: [{ model: Review, where: { locationId: review.locationId }, attributes: [] }],
    where: { state: ['live', 'pending_google', 'draft'] },
    order: [['updated_at', 'DESC']],
    limit: 5,
  });
  const recentReplies = recent.filter((r) => r.reviewId !== review.id).map((r) => r.text).filter(Boolean);

  let analysis = analyze(review);
  let text;
  if (openai) {
    try {
      let result = await llmDraft({ review, voice, recentReplies, instructions });
      if (byteLength(result.reply) > DRAFT_TARGET_BYTES) {
        result = await llmDraft({ review, voice, recentReplies, instructions: 'Make it noticeably shorter.' });
      }
      text = result.reply;
      analysis = {
        language: result.language || analysis.language,
        sentiment: result.sentiment || analysis.sentiment,
        topics: Array.isArray(result.topics) && result.topics.length ? result.topics.slice(0, 3) : analysis.topics,
      };
    } catch (err) {
      console.warn('[draft] LLM failed, using template drafter:', err.message);
    }
  }
  if (!text) text = templateDrafter.draft({ review, analysis, voice, recentReplies });

  await review.update(analysis);
  const values = { text, source: 'ai', state: 'draft', error: null, policyViolation: null, googleReplyState: null };
  return reply ? reply.update(values) : Reply.create({ reviewId: review.id, ...values });
}

module.exports = { draftForReview, usingLlm: !!openai };
