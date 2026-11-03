const test = require('node:test');
const assert = require('node:assert');
const { HttpError } = require('../src/utils/errors');
const { readBlockedMessage } = require('../src/services/connection.service');
const { usesSampleData } = require('../src/services/google.service');

const googleError = (statusCode, message = 'blocked') => Object.assign(new Error(message), { statusCode });

test('0 API quota counts as blocked, not a failed connection', () => {
  assert.match(readBlockedMessage(googleError(429)), /not approved/);
});

test('a Google permission error counts as blocked and keeps the reason', () => {
  assert.match(readBlockedMessage(googleError(403, 'API disabled')), /API disabled/);
});

test('an account without a profile counts as blocked', () => {
  const err = new HttpError(400, 'No Business Profile found on this Google account');
  assert.match(readBlockedMessage(err), /No Business Profile/);
});

test('other errors are not hidden', () => {
  assert.strictEqual(readBlockedMessage(googleError(500)), null);
  assert.strictEqual(readBlockedMessage(new Error('database down')), null);
});

test('only sample or mock connections use the fake profile', () => {
  assert.strictEqual(usesSampleData({ provider: 'live', dataSource: 'google' }), false);
  assert.strictEqual(usesSampleData({ provider: 'live', dataSource: 'sample' }), true);
  assert.strictEqual(usesSampleData({ provider: 'mock', dataSource: 'google' }), true);
});
