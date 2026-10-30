// Lightweight, offline review analysis used when no LLM key is configured
// (and as a fallback if the LLM call fails).

const TOPIC_KEYWORDS = {
  'wait time': ['wait', 'waited', 'slow', 'late', 'seated', 'took', 'वेळ'],
  'food quality': ['cold', 'lukewarm', 'undercooked', 'burnt', 'stale', 'salty', 'hair'],
  taste: ['delicious', 'best', 'tasty', 'amazing', 'incredible', 'unreal', 'addictive', 'स्वादिष्ट', 'छान', 'अप्रतिम', 'mejor'],
  service: ['staff', 'service', 'friendly', 'polite', 'attentive', 'manager', 'स्टाफ़', 'personal'],
  'price & billing': ['price', 'pricey', 'charged', 'refund', 'value', 'expensive'],
  delivery: ['delivery', 'driver', 'missing', 'order'],
  ambience: ['ambience', 'music', 'loud', 'noisy', 'ac ', 'hot inside', 'cozy'],
  parking: ['parking'],
  hygiene: ['hair', 'dirty', 'hygiene'],
  dessert: ['tiramisu', 'dessert'],
};

function detectLanguage(text) {
  text = text || '';
  if (/[ऀ-ॿ]/.test(text)) {
    return /(आहे|होता|छान|खूप|पुन्हा|अप्रतिम|पण)/.test(text) ? 'mr' : 'hi';
  }
  if (/[¡¿]|\b(muy|mejor|que|personal|fue)\b/i.test(text)) return 'es';
  return 'en';
}

function sentimentFor(stars) {
  if (stars >= 4) return 'positive';
  if (stars === 3) return 'neutral';
  return 'negative';
}

function topicsFor(text) {
  const lower = ` ${(text || '').toLowerCase()} `;
  return Object.entries(TOPIC_KEYWORDS)
    .filter(([, words]) => words.some((w) => lower.includes(w)))
    .map(([topic]) => topic)
    .slice(0, 3);
}

function analyze(review) {
  return {
    language: detectLanguage(review.comment),
    sentiment: sentimentFor(review.starRating),
    topics: topicsFor(review.comment),
  };
}

module.exports = { analyze, detectLanguage };
