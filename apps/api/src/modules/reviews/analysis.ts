// Lightweight offline analysis, used with no AI key and as the fallback when an AI call fails.
// Topics fit any small business. With an AI key, the model reports these instead.
const TOPIC_KEYWORDS: Record<string, string[]> = {
  'wait time': ['wait', 'slow', 'queue', 'took too long', 'took far too long', 'delay', 'late', 'esper', 'tarde'],
  cleanliness: ['clean', 'dirty', 'spotless', 'messy', 'limpi', 'sucia', 'sucio'],
  'price & billing': ['charged', 'refund', ' fee', 'expensive', 'overpriced', 'pricey', 'price', 'cobraron', 'caro', 'precio'],
  communication: ['called', 'call back', 'phone', 'answer', 'email', 'no response', 'told us', 'respond', 'llam'],
  location: ['location', 'parking', 'easy to find', 'walking distance', 'ubicación', 'céntrico', 'estacionamiento'],
  quality: ['quality', 'excellent', 'poor', 'worth', 'calidad', 'excelente'],
  // Broad, so last: drafts mention the first match, and a specific topic reads better.
  service: ['staff', 'team', 'friendly', 'helpful', 'polite', 'rude', 'service', 'personal', 'atento', 'amable'],
};

// Offline fallback only. Avoids bare words that also appear in English reviews, such as "personal"
// and place names like El Paso, Las Vegas and Buena Vista.
const SPANISH_MARKERS = /[¡¿]|\b(muy|fue|estuvo|estaba|pero|nos|ubicaci[oó]n|gracias|excelente|el personal|amables?|atent[oa]s?|limpi[oa]s?|suci[oa]s?|tuvimos)\b/i;

export function detectLanguage(text: string | null | undefined): 'es' | 'en' {
  return SPANISH_MARKERS.test(text ?? '') ? 'es' : 'en';
}

export type Sentiment = 'positive' | 'neutral' | 'negative';

function sentimentFor(stars: number): Sentiment {
  if (stars >= 4) return 'positive';
  return stars === 3 ? 'neutral' : 'negative';
}

function topicsFor(text: string | null | undefined): string[] {
  const lower = ` ${(text ?? '').toLowerCase()} `;
  return Object.entries(TOPIC_KEYWORDS)
    .filter(([, words]) => words.some((word) => lower.includes(word)))
    .map(([topic]) => topic)
    .slice(0, 3);
}

export interface Analysis {
  language: string;
  sentiment: Sentiment;
  topics: string[];
}

export function analyze(review: { starRating: number; comment: string | null }): Analysis {
  return {
    language: detectLanguage(review.comment),
    sentiment: sentimentFor(review.starRating),
    topics: topicsFor(review.comment),
  };
}
