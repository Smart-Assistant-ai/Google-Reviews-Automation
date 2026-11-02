const test = require('node:test');
const assert = require('node:assert');
const { analyze, detectLanguage } = require('../src/services/analysis');
const templateDrafter = require('../src/services/template.drafter');
const { byteLength, GOOGLE_REPLY_MAX_BYTES } = require('../src/utils/bytes');

test('byte length counts UTF-8 bytes, not characters', () => {
  assert.equal(byteLength('abc'), 3);
  assert.equal(byteLength('habitación'), 11);
  assert.equal(GOOGLE_REPLY_MAX_BYTES, 4096);
});

test('detects Spanish and English', () => {
  assert.equal(detectLanguage('¡El personal fue muy amable!'), 'es');
  assert.equal(detectLanguage('La habitación estaba limpia'), 'es');
  assert.equal(detectLanguage('Great room and a very personal touch'), 'en');
  assert.equal(detectLanguage('Nice cafe near the hotel'), 'en');
});

test('analysis maps stars to sentiment and finds topics', () => {
  const a = analyze({ starRating: 2, comment: 'Waited 40 minutes at check-in and the room was dirty' });
  assert.equal(a.sentiment, 'negative');
  assert.ok(a.topics.includes('check-in'));
  assert.ok(a.topics.includes('cleanliness'));
});

test('template drafts avoid repeating the opener of recent replies and add the sign-off', () => {
  const review = { reviewerName: 'David Kim', starRating: 5, comment: 'Best hotel on Nob Hill' };
  const voice = { tone: 'warm', signOff: '– The Harbor team', languageMode: 'match' };
  const analysis = analyze(review);
  const first = templateDrafter.draft({ review, analysis, voice, recentReplies: [] });
  const second = templateDrafter.draft({ review, analysis, voice, recentReplies: [first] });
  assert.ok(first.includes('David'));
  assert.ok(first.endsWith('– The Harbor team'));
  assert.notEqual(first.slice(0, 25), second.slice(0, 25));
});

test('template drafts never offer incentives', () => {
  const review = { reviewerName: 'Jason', starRating: 1, comment: 'Found stains on the sheets' };
  const draft = templateDrafter.draft({ review, analysis: analyze(review), voice: { tone: 'warm' } });
  assert.doesNotMatch(draft, /discount|coupon|free/i);
});

test('analysis handles rating-only reviews (null comment)', () => {
  const a = analyze({ starRating: 5, comment: null });
  assert.equal(a.language, 'en');
  assert.deepEqual(a.topics, []);
});

test('positive drafts only mention praise-worthy topics', () => {
  const review = { reviewerName: 'Ashley', starRating: 4, comment: 'Great room, slightly pricey but worth it' };
  const draft = templateDrafter.draft({ review, analysis: { language: 'en', sentiment: 'positive', topics: ['price & billing'] }, voice: { tone: 'warm' } });
  assert.doesNotMatch(draft, /price|billing/);
});

test('Spanish reviews get a Spanish draft in the matching mood', () => {
  const review = { reviewerName: 'Miguel Herrera', starRating: 2, comment: 'La habitación estaba sucia y nadie nos respondió.' };
  const analysis = analyze(review);
  assert.equal(analysis.language, 'es');
  assert.ok(analysis.topics.includes('cleanliness'));
  const draft = templateDrafter.draft({ review, analysis, voice: { tone: 'warm', languageMode: 'match' } });
  assert.match(draft, /^Lo sentimos mucho, Miguel/);
});

test('every Spanish fixture is detected as Spanish and every other fixture as English', () => {
  const { SEED_REVIEWS, SIMULATED_POOL } = require('../src/providers/gbp/mock.fixtures');
  const spanish = /[áéíóúñ¡¿]|\b(Excelente|Nos)\b/;
  for (const r of [...SEED_REVIEWS, ...SIMULATED_POOL].filter((x) => x.text)) {
    assert.equal(detectLanguage(r.text), spanish.test(r.text) ? 'es' : 'en', r.text);
  }
});

test('offline drafts have no leftovers from another industry', () => {
  const { SEED_REVIEWS } = require('../src/providers/gbp/mock.fixtures');
  for (const r of SEED_REVIEWS) {
    const review = { reviewerName: r.name, starRating: r.stars, comment: r.text || null };
    for (const tone of ['warm', 'professional', 'playful']) {
      const draft = templateDrafter.draft({ review, analysis: analyze(review), voice: { tone } });
      assert.doesNotMatch(draft, /pizza|oven|menu|food|dinner/i, draft);
    }
  }
});
