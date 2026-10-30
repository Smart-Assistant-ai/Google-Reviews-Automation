// Deterministic drafter used when OPENAI_API_KEY is not set, so the demo works offline.
// Several variants per case so consecutive replies don't read as templated.

const firstName = (name = '') => name.trim().split(/\s+/)[0] || 'there';

const EN = {
  positive: {
    warm: [
      (n, t) => `Hi ${n}, thank you so much for the lovely words${t ? ` about our ${t}` : ''}! It genuinely made our day.`,
      (n, t) => `${n}, this is wonderful to read — thank you!${t ? ` We'll pass your note about the ${t} to the whole team.` : ''}`,
      (n) => `Thanks a ton, ${n}! Guests like you are the reason we fire up the oven every morning.`,
      (n, t) => `What a kind review, ${n}.${t ? ` So glad the ${t} hit the spot.` : ''} We can't wait to welcome you back.`,
    ],
    professional: [
      (n, t) => `Dear ${n}, thank you for your review${t ? ` and your kind remarks on our ${t}` : ''}. We look forward to serving you again.`,
      (n) => `Thank you, ${n}. We appreciate you taking the time to share your experience.`,
    ],
    playful: [
      (n) => `${n}, you just made our pizza oven blush 🍕 Thank you!`,
      (n, t) => `Woohoo, thanks ${n}!${t ? ` The ${t} team is doing a happy dance.` : ''} See you soon!`,
    ],
  },
  neutral: {
    any: [
      (n, t) => `Hi ${n}, thanks for the honest feedback${t ? ` on the ${t}` : ''}. We're looking into it and hope to give you a five-star visit next time.`,
      (n, t) => `Thank you, ${n}. Glad parts of your visit worked for you —${t ? ` we've noted your point about the ${t}` : ' we have noted your feedback'} and are on it.`,
    ],
  },
  negative: {
    any: [
      (n, t) => `Hi ${n}, we're truly sorry${t ? ` about the ${t}` : ' your visit fell short'}. That's not the experience we want for anyone. Please reach out to us directly so we can make this right.`,
      (n, t) => `${n}, thank you for telling us, and we apologise.${t ? ` The issue with ${t} has been shared with our team` : ' Your feedback has been shared with our team'} so it doesn't happen again. We'd love the chance to do better.`,
      (n) => `We're sorry, ${n}. This isn't our standard, and we're reviewing what went wrong. Please contact our manager so we can follow up personally.`,
    ],
  },
};

const OTHER = {
  hi: {
    positive: (n) => `${n} जी, आपके प्यारे शब्दों के लिए बहुत-बहुत धन्यवाद! आपसे फिर मिलने का इंतज़ार रहेगा।`,
    neutral: (n) => `${n} जी, आपकी राय के लिए धन्यवाद। हम सुधार पर काम कर रहे हैं।`,
    negative: (n) => `${n} जी, हमें खेद है कि आपका अनुभव अच्छा नहीं रहा। कृपया हमसे संपर्क करें ताकि हम इसे ठीक कर सकें।`,
  },
  mr: {
    positive: (n) => `${n}, तुमच्या सुंदर अभिप्रायाबद्दल मनःपूर्वक धन्यवाद! लवकरच पुन्हा भेटूया.`,
    neutral: (n) => `${n}, तुमच्या अभिप्रायाबद्दल धन्यवाद. आम्ही नक्की सुधारणा करू.`,
    negative: (n) => `${n}, तुमचा अनुभव चांगला न झाल्याबद्दल आम्ही दिलगीर आहोत. कृपया आमच्याशी संपर्क साधा.`,
  },
  es: {
    positive: (n) => `¡Muchas gracias, ${n}! Nos alegra muchísimo que hayas disfrutado. ¡Te esperamos pronto!`,
    neutral: (n) => `Gracias por tu opinión, ${n}. Ya estamos trabajando para mejorar.`,
    negative: (n) => `Lo sentimos mucho, ${n}. Por favor contáctanos para poder solucionarlo.`,
  },
};

function draft({ review, analysis, voice, recentReplies = [] }) {
  const name = firstName(review.reviewerName);
  const topic = analysis.topics[0];
  const language = voice.languageMode === 'english' ? 'en' : analysis.language;
  let body;

  if (language !== 'en' && OTHER[language]) {
    body = OTHER[language][analysis.sentiment](name);
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
