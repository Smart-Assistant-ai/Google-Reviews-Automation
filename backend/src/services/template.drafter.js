// Deterministic drafter used when OPENAI_API_KEY is not set, so the demo works offline.
// Several variants per case so consecutive replies don't read as templated.

const firstName = (name = '') => name.trim().split(/\s+/)[0] || 'there';

// Only mention topics that fit the review's mood, phrased naturally.
const PRAISE_PHRASES = {
  room: 'rooms', service: 'team', location: 'location', breakfast: 'breakfast', cleanliness: 'housekeeping team', amenities: 'amenities',
};
const ISSUE_PHRASES = {
  'check-in': 'the check-in', room: 'your room', cleanliness: 'the cleanliness of your room', noise: 'the noise',
  'price & billing': 'the billing issue', parking: 'parking', service: 'the service', breakfast: 'breakfast', amenities: 'the amenities',
};

function topicPhrase(topics, sentiment) {
  const phrases = sentiment === 'positive' ? PRAISE_PHRASES : ISSUE_PHRASES;
  const match = topics.find((t) => phrases[t]);
  return match ? phrases[match] : null;
}

const EN = {
  positive: {
    warm: [
      (n, t) => `Hi ${n}, thank you so much for the lovely words${t ? ` about our ${t}` : ''}! It genuinely made our day.`,
      (n, t) => `${n}, this is wonderful to read — thank you!${t ? ` We'll pass your note about our ${t} to the whole team.` : ''}`,
      (n) => `Thanks a ton, ${n}! Guests like you are the reason we love what we do.`,
      (n, t) => `What a kind review, ${n}.${t ? ` So glad our ${t} made your stay better.` : ''} We can't wait to welcome you back.`,
    ],
    professional: [
      (n, t) => `Dear ${n}, thank you for your review${t ? ` and your kind remarks on our ${t}` : ''}. We look forward to welcoming you again.`,
      (n) => `Thank you, ${n}. We appreciate you taking the time to share your experience.`,
    ],
    playful: [
      (n) => `${n}, you just made our front desk blush 🛎️ Thank you!`,
      (n) => `Woohoo, thanks ${n}! The whole crew is doing a happy dance. See you soon!`,
    ],
  },
  neutral: {
    any: [
      (n, t) => `Hi ${n}, thanks for the honest feedback${t ? ` about ${t}` : ''}. We're looking into it and hope to give you a five-star stay next time.`,
      (n, t) => `Thank you, ${n}. Glad parts of your stay worked for you —${t ? ` we've noted your point about ${t}` : ' we have noted your feedback'} and are on it.`,
    ],
  },
  negative: {
    any: [
      (n, t) => `Hi ${n}, we're truly sorry${t ? ` about ${t}` : ' your stay fell short'}. That's not the experience we want for anyone. Please reach out to us directly so we can make this right.`,
      (n, t) => `${n}, thank you for telling us, and we apologize.${t ? ` Your feedback about ${t} has been shared with our team` : ' Your feedback has been shared with our team'} so it doesn't happen again. We'd love the chance to do better.`,
      (n) => `We're sorry, ${n}. This isn't our standard, and we're reviewing what went wrong. Please contact our manager so we can follow up personally.`,
    ],
  },
};

const SPANISH = {
  positive: (n) => `¡Muchas gracias, ${n}! Nos alegra muchísimo que hayas disfrutado tu estancia. ¡Te esperamos pronto!`,
  neutral: (n) => `Gracias por tu opinión, ${n}. Ya estamos trabajando para mejorar.`,
  negative: (n) => `Lo sentimos mucho, ${n}. Por favor contáctanos para poder solucionarlo.`,
};

function draft({ review, analysis, voice, recentReplies = [] }) {
  const name = firstName(review.reviewerName);
  const topic = topicPhrase(analysis.topics, analysis.sentiment);
  const language = voice.languageMode === 'english' ? 'en' : analysis.language;
  let body;

  if (language === 'es') {
    body = SPANISH[analysis.sentiment](name);
  } else {
    const bucket = EN[analysis.sentiment];
    const variants = bucket[voice.tone] || bucket.warm || bucket.any;
    const openers = new Set(recentReplies.map((r) => r.slice(0, 25)));
    const candidates = variants.map((v) => v(name, topic));
    body = candidates.find((c) => !openers.has(c.slice(0, 25))) || candidates[Math.floor(Math.random() * candidates.length)];
    if (!review.comment && analysis.sentiment === 'positive') {
      body = `Thank you for the ${review.starRating}-star rating, ${name}! We really appreciate it.`;
    }
  }

  const signOff = voice.signOff || (voice.ownerName ? `– ${voice.ownerName}` : '');
  return signOff ? `${body}\n\n${signOff}` : body;
}

module.exports = { draft };
