process.env.AES_SECRET_KEY = process.env.AES_SECRET_KEY || 'test-key';
const test = require('node:test');
const assert = require('node:assert');
const { matches } = require('../src/services/rules.service');

const consented = new Date('2026-10-01T00:00:00Z');
const rule = (over = {}) => ({
  enabled: true, consentedAt: consented, minStars: 4, maxStars: 5, textCondition: 'with_text', ...over,
});
const review = (over = {}) => ({ starRating: 5, comment: 'Great pizza', createTime: '2026-10-20T00:00:00Z', ...over });

test('matches an opted-in rule for a new 5★ review with text', () => {
  assert.equal(matches(rule(), review()), true);
});

test('never auto-posts 1–3★ even if a rule is misconfigured to allow it', () => {
  assert.equal(matches(rule({ minStars: 1 }), review({ starRating: 3 })), false);
  assert.equal(matches(rule({ minStars: 1 }), review({ starRating: 1 })), false);
});

test('requires both enabled and consent', () => {
  assert.equal(matches(rule({ enabled: false }), review()), false);
  assert.equal(matches(rule({ consentedAt: null }), review()), false);
});

test('ignores reviews written before the owner consented', () => {
  assert.equal(matches(rule(), review({ createTime: '2026-09-15T00:00:00Z' })), false);
});

test('respects the text condition', () => {
  assert.equal(matches(rule({ textCondition: 'without_text' }), review()), false);
  assert.equal(matches(rule({ textCondition: 'without_text' }), review({ comment: null })), true);
  assert.equal(matches(rule({ textCondition: 'with_text' }), review({ comment: '   ' })), false);
  assert.equal(matches(rule({ textCondition: 'any' }), review({ comment: null })), true);
});
