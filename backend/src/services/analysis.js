// Lightweight, offline review analysis used when no LLM key is configured
// (and as a fallback if the LLM call fails).

const TOPIC_KEYWORDS = {
  'check-in': ['check-in', 'check in', 'check-out', 'checkout', 'waited', 'reservation', 'not ready', 'recepción', 'esperar'],
  cleanliness: ['clean', 'dirty', 'stain', 'spotless', 'housekeeping', 'smell', 'limpi', 'sucia', 'humedad'],
  service: ['staff', 'concierge', 'front desk', 'friendly', 'helpful', 'polite', 'personal', 'atento', 'amable'],
  location: ['location', 'walking distance', 'cable car', ' view', 'ubicación', 'céntrico', 'vista'],
  noise: ['noise', 'noisy', 'loud', 'quiet', 'ruido'],
  breakfast: ['breakfast', 'desayuno'],
  amenities: ['wi-fi', 'wifi', 'rooftop', ' bar ', 'gym', 'pool'],
  'price & billing': ['charged', 'refund', ' fee', 'expensive', 'overpriced', 'pricey', 'cobraron'],
  parking: ['parking', 'valet', 'estacionamiento'],
  // Generic, so last: drafts mention the first match, and a specific topic reads better.
  room: ['room', 'bed', 'shower', 'elevator', 'heating', 'habitación', 'cómoda', 'aire acondicionado'],
};

// Offline fallback for the two languages V1 sells in. With an LLM key, the LLM reports the language instead.
const SPANISH_MARKERS = /[¡¿]|\b(muy|fue|estuvo|estaba|pero|nos|habitaci[oó]n|desayuno|ubicaci[oó]n|gracias|excelente|hotel maravilloso)\b/i;

function detectLanguage(text) {
  return SPANISH_MARKERS.test(text || '') ? 'es' : 'en';
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
