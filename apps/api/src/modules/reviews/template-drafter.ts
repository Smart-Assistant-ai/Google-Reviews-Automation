import type { Analysis } from './analysis';

// Offline drafter, used with no AI key, so everything works without one. Several variants
// per case stop consecutive replies from reading as templated.
const firstName = (name: string | null) => (name ?? '').trim().split(/\s+/)[0] || 'there';

// Only mentions topics that fit the review's mood, phrased naturally.
const PRAISE_PHRASES: Record<string, string> = {
  service: 'team',
  location: 'location',
  quality: 'quality',
  cleanliness: 'attention to detail',
};
const ISSUE_PHRASES: Record<string, string> = {
  'wait time': 'the wait',
  service: 'the service',
  'price & billing': 'the billing issue',
  cleanliness: 'the cleanliness',
  communication: 'how we communicated',
  quality: 'the quality',
  location: 'getting to us',
};

function topicPhrase(topics: string[], sentiment: string): string | null {
  const phrases = sentiment === 'positive' ? PRAISE_PHRASES : ISSUE_PHRASES;
  const match = topics.find((topic) => phrases[topic]);
  return match ? phrases[match]! : null;
}

type Variant = (name: string, topic: string | null) => string;

const EN_POSITIVE: Record<string, Variant[]> = {
  warm: [
    (n, t) =>
      `Hi ${n}, thank you so much for the lovely words${t ? ` about our ${t}` : ''}! It genuinely made our day.`,
    (n, t) =>
      `${n}, this is wonderful to read, thank you!${t ? ` We'll pass your note about our ${t} to the whole team.` : ''}`,
    (n) => `Thanks a ton, ${n}! Customers like you are the reason we love what we do.`,
    (n, t) =>
      `What a kind review, ${n}.${t ? ` So glad our ${t} made your visit better.` : ''} We can't wait to see you again.`,
  ],
  professional: [
    (n, t) =>
      `Dear ${n}, thank you for your review${t ? ` and your kind remarks on our ${t}` : ''}. We look forward to serving you again.`,
    (n) => `Thank you, ${n}. We appreciate you taking the time to share your experience.`,
  ],
  playful: [
    (n) => `${n}, you just made the whole team blush. Thank you!`,
    (n) => `Woohoo, thanks ${n}! Everyone here is doing a happy dance. See you soon!`,
  ],
};

const EN_NEUTRAL: Variant[] = [
  (n, t) =>
    `Hi ${n}, thanks for the honest feedback${t ? ` about ${t}` : ''}. We're looking into it and hope to earn five stars next time.`,
  (n, t) =>
    `Thank you, ${n}. Glad parts of your visit worked for you.${t ? ` We've noted your point about ${t}` : ' We have noted your feedback'} and are on it.`,
];

const EN_NEGATIVE: Variant[] = [
  (n, t) =>
    `Hi ${n}, we're truly sorry${t ? ` about ${t}` : ' we fell short'}. That's not the experience we want for anyone. Please reach out to us directly so we can make this right.`,
  (n, t) =>
    `${n}, thank you for telling us, and we apologize.${t ? ` Your feedback about ${t} has been shared with our team` : ' Your feedback has been shared with our team'} so it doesn't happen again. We'd love the chance to do better.`,
  (n) =>
    `We're sorry, ${n}. This isn't our standard, and we're reviewing what went wrong. Please contact our manager so we can follow up personally.`,
];

const SPANISH: Record<string, (name: string) => string> = {
  positive: (n) =>
    `¡Muchas gracias, ${n}! Nos alegra muchísimo que hayas disfrutado tu visita. ¡Te esperamos pronto!`,
  neutral: (n) => `Gracias por tu opinión, ${n}. Ya estamos trabajando para mejorar.`,
  negative: (n) => `Lo sentimos mucho, ${n}. Por favor contáctanos para poder solucionarlo.`,
};

export interface DraftVoice {
  tone: string;
  languageMode: string;
  signOff: string | null;
  ownerName: string | null;
}

export interface DraftInput {
  review: { reviewerName: string | null; starRating: number; comment: string | null };
  analysis: Analysis;
  voice: DraftVoice;
  recentReplies?: string[];
}

export function draftFromTemplate({
  review,
  analysis,
  voice,
  recentReplies = [],
}: DraftInput): string {
  const name = firstName(review.reviewerName);
  const topic = topicPhrase(analysis.topics, analysis.sentiment);
  const language = voice.languageMode === 'english' ? 'en' : analysis.language;
  let body: string;

  if (language === 'es') {
    body = SPANISH[analysis.sentiment]!(name);
  } else if (!review.comment && analysis.sentiment === 'positive') {
    body = `Thank you for the ${review.starRating}-star rating, ${name}! We really appreciate it.`;
  } else {
    const variants =
      analysis.sentiment === 'positive'
        ? (EN_POSITIVE[voice.tone] ?? EN_POSITIVE.warm!)
        : analysis.sentiment === 'neutral'
          ? EN_NEUTRAL
          : EN_NEGATIVE;
    const openers = new Set(recentReplies.map((reply) => reply.slice(0, 25)));
    const candidates = variants.map((variant) => variant(name, topic));
    body =
      candidates.find((candidate) => !openers.has(candidate.slice(0, 25))) ??
      candidates[Math.floor(Math.random() * candidates.length)]!;
  }

  const signOff = voice.signOff ?? (voice.ownerName ? `– ${voice.ownerName}` : '');
  return signOff ? `${body}\n\n${signOff}` : body;
}
