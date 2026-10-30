const test = require('node:test');
const assert = require('node:assert');
const { analyze, detectLanguage } = require('../src/services/analysis');
const templateDrafter = require('../src/services/template.drafter');
const { byteLength, GOOGLE_REPLY_MAX_BYTES } = require('../src/utils/bytes');

test('byte length counts UTF-8 bytes, not characters', () => {
  assert.equal(byteLength('abc'), 3);
  assert.equal(byteLength('पिझ्झा'), 18);
  assert.equal(GOOGLE_REPLY_MAX_BYTES, 4096);
});

test('detects Hindi, Marathi, Spanish and English', () => {
  assert.equal(detectLanguage('बहुत ही स्वादिष्ट पिज़्ज़ा!'), 'hi');
  assert.equal(detectLanguage('पिझ्झा छान होता, पण थोडा वेळ लागला.'), 'mr');
  assert.equal(detectLanguage('¡El personal fue muy amable!'), 'es');
  assert.equal(detectLanguage('Great crust'), 'en');
});

test('analysis maps stars to sentiment and finds topics', () => {
  const a = analyze({ starRating: 2, comment: 'Waited 40 minutes and the pizza was cold' });
  assert.equal(a.sentiment, 'negative');
  assert.ok(a.topics.includes('wait time'));
  assert.ok(a.topics.includes('food quality'));
});

test('template drafts avoid repeating the opener of recent replies and add the sign-off', () => {
  const review = { reviewerName: 'Rahul Kulkarni', starRating: 5, comment: 'Best crust in Pune' };
  const voice = { tone: 'warm', signOff: '– Team Joe', languageMode: 'match' };
  const analysis = analyze(review);
  const first = templateDrafter.draft({ review, analysis, voice, recentReplies: [] });
  const second = templateDrafter.draft({ review, analysis, voice, recentReplies: [first] });
  assert.ok(first.includes('Rahul'));
  assert.ok(first.endsWith('– Team Joe'));
  assert.notEqual(first.slice(0, 25), second.slice(0, 25));
});

test('template drafts never offer incentives', () => {
  const review = { reviewerName: 'Sneha', starRating: 1, comment: 'Found a hair in my pizza' };
  const draft = templateDrafter.draft({ review, analysis: analyze(review), voice: { tone: 'warm' } });
  assert.doesNotMatch(draft, /discount|coupon|free/i);
});

test('analysis handles rating-only reviews (null comment)', () => {
  const a = analyze({ starRating: 5, comment: null });
  assert.equal(a.language, 'en');
  assert.deepEqual(a.topics, []);
});

test('positive drafts only mention praise-worthy topics', () => {
  const review = { reviewerName: 'Ananya', starRating: 4, comment: 'Great pasta, slightly pricey but worth it' };
  const draft = templateDrafter.draft({ review, analysis: { language: 'en', sentiment: 'positive', topics: ['price & billing'] }, voice: { tone: 'warm' } });
  assert.doesNotMatch(draft, /price|billing/);
});
