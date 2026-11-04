import { DRAFT_TARGET_BYTES, byteLength, type Voice } from '@replypilot/shared';
import OpenAI from 'openai';
import { env } from '../../config';
import { prisma } from '../../lib/prisma';
import { analyze, type Analysis } from './analysis';
import { draftFromTemplate } from './template-drafter';
import { effectiveVoice } from './voice.service';

const openai = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;

export const usingAi = () => openai !== null;

const TONES: Record<string, string> = {
  warm: 'warm, personal and genuine',
  professional: 'polite, concise and professional',
  playful: 'friendly and lightly playful (one emoji at most)',
};

function systemPrompt(voice: Voice): string {
  return [
    `You write public replies to Google reviews on behalf of ${voice.businessName || 'a small business'}.`,
    `Tone: ${TONES[voice.tone] ?? TONES.warm}.`,
    voice.languageMode === 'english' ? 'Always reply in English.' : 'Reply in the same language the reviewer used.',
    voice.signOff ? `End with this sign-off on its own line: "${voice.signOff}"` : '',
    voice.alwaysSay ? `Where natural, include: ${voice.alwaysSay}` : '',
    voice.neverSay ? `Never mention: ${voice.neverSay}` : '',
    'Rules: address the reviewer by first name; reference something specific they said; 2-4 sentences;',
    'never offer discounts, freebies or anything in exchange for changing a review; never admit legal liability;',
    'never include phone numbers, emails or links; for negative reviews apologize and invite them to contact the business;',
    'do not assume what kind of business this is beyond what the review says;',
    'do not start with the same words as the recent replies provided.',
    'Respond as JSON: {"reply": string, "sentiment": "positive"|"neutral"|"negative", "topics": string[] (max 3, short), "language": ISO 639-1 code}.',
  ]
    .filter(Boolean)
    .join('\n');
}

interface AiDraft {
  reply: string;
  sentiment?: Analysis['sentiment'];
  topics?: string[];
  language?: string;
}

interface ReviewForDraft {
  starRating: number;
  reviewerName: string | null;
  comment: string | null;
}

async function aiDraft(review: ReviewForDraft, voice: Voice, recentReplies: string[], instructions?: string): Promise<AiDraft> {
  const user = [
    `Rating: ${review.starRating}/5`,
    `Reviewer: ${review.reviewerName ?? 'Anonymous'}`,
    `Review: ${review.comment ?? '(no text, rating only)'}`,
    recentReplies.length ? `Recent replies (vary from these):\n- ${recentReplies.join('\n- ')}` : '',
    instructions ? `Extra instruction from the owner: ${instructions}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const res = await openai!.chat.completions.create({
    model: env.OPENAI_MODEL,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt(voice) },
      { role: 'user', content: user },
    ],
  });
  const parsed = JSON.parse(res.choices[0]?.message.content ?? '{}') as Partial<AiDraft>;
  if (!parsed.reply) throw new Error('The AI returned no reply');
  return parsed as AiDraft;
}

// Writes or rewrites the draft for a review. Never touches a reply that has been posted.
export async function draftForReview(reviewId: string, options: { instructions?: string } = {}) {
  const review = await prisma.review.findUnique({ where: { id: reviewId }, include: { reply: true } });
  if (!review) return null;
  const reply = review.reply;
  if (reply && !['drafting', 'draft', 'rejected', 'failed'].includes(reply.state)) return reply;

  const { voice } = await effectiveVoice(review.workspaceId, review.locationId);
  const recent = await prisma.reply.findMany({
    where: { review: { locationId: review.locationId }, state: { in: ['live', 'pending_google', 'draft'] }, reviewId: { not: review.id } },
    orderBy: { updatedAt: 'desc' },
    take: 5,
    select: { text: true },
  });
  const recentReplies = recent.map((row) => row.text).filter(Boolean);

  let analysis = analyze(review);
  let text: string | null = null;
  if (openai) {
    try {
      let result = await aiDraft(review, voice, recentReplies, options.instructions);
      if (byteLength(result.reply) > DRAFT_TARGET_BYTES) {
        result = await aiDraft(review, voice, recentReplies, 'Make it noticeably shorter.');
      }
      text = result.reply;
      analysis = {
        language: result.language ?? analysis.language,
        sentiment: result.sentiment ?? analysis.sentiment,
        topics: result.topics?.length ? result.topics.slice(0, 3) : analysis.topics,
      };
    } catch (err) {
      console.warn('[draft] AI call failed, using the offline drafter:', (err as Error).message);
    }
  }
  text ??= draftFromTemplate({ review, analysis, voice, recentReplies });

  await prisma.review.update({ where: { id: review.id }, data: analysis });
  const values = { text, source: 'ai' as const, state: 'draft' as const, error: null, policyViolation: null, googleReplyState: null };
  return reply
    ? prisma.reply.update({ where: { id: reply.id }, data: values })
    : prisma.reply.create({ data: { workspaceId: review.workspaceId, reviewId: review.id, ...values } });
}
