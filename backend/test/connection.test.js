const test = require('node:test');
const assert = require('node:assert');
const env = require('../src/config/env');
const { HttpError } = require('../src/utils/errors');
const { getProvider } = require('../src/providers/gbp');
const { GoogleConnection, Location, Review, AuditLog } = require('../src/models');
const { readBlockedMessage, useSampleData, stopSampleData } = require('../src/services/connection.service');
const googleService = require('../src/services/google.service');
const syncService = require('../src/services/sync.service');

const { usesSampleData } = googleService;
const googleError = (statusCode, message = 'blocked') => Object.assign(new Error(message), { statusCode });

function stubSampleFlow(t, { dataSource, locations, reviews }) {
  const update = t.mock.fn(async () => {});
  t.mock.method(GoogleConnection, 'findOne', async () => ({ dataSource, update }));
  t.mock.method(Location, 'count', async () => locations);
  t.mock.method(Review, 'count', async () => reviews);
  return {
    update,
    destroy: t.mock.method(Location, 'destroy', async () => locations),
    attachProfile: t.mock.method(googleService, 'attachProfile', async () => {}),
    syncWorkspace: t.mock.method(syncService, 'syncWorkspace', async () => {}),
    audit: t.mock.method(AuditLog, 'create', async () => {}),
  };
}

test('enabling sample data twice keeps the existing location, reviews and replies', async (t) => {
  const stubs = stubSampleFlow(t, { dataSource: 'sample', locations: 1, reviews: 12 });
  await useSampleData('w1', 'u1');
  for (const stub of Object.values(stubs)) assert.equal(stub.mock.callCount(), 0);
});

test('sample mode with no location, from a failed earlier setup, can be retried', async (t) => {
  const stubs = stubSampleFlow(t, { dataSource: 'sample', locations: 0, reviews: 0 });
  await useSampleData('w1', 'u1');
  assert.equal(stubs.attachProfile.mock.callCount(), 1);
  assert.equal(stubs.syncWorkspace.mock.callCount(), 1);
});

test('sample data is refused when the account has real reviews', async (t) => {
  const stubs = stubSampleFlow(t, { dataSource: 'google', locations: 1, reviews: 3 });
  await assert.rejects(useSampleData('w1', 'u1'), { statusCode: 409 });
  assert.equal(stubs.destroy.mock.callCount(), 0);
});

test('a real account with no reviews can switch to sample data', async (t) => {
  const stubs = stubSampleFlow(t, { dataSource: 'google', locations: 1, reviews: 0 });
  await useSampleData('w1', 'u1');
  assert.equal(stubs.destroy.mock.callCount(), 1);
  assert.equal(stubs.attachProfile.mock.callCount(), 1);
});

test('stopping sample data is refused on a live connection and keeps its data', async (t) => {
  const stubs = stubSampleFlow(t, { dataSource: 'google', locations: 1, reviews: 3 });
  await assert.rejects(stopSampleData('w1', 'u1'), { statusCode: 409 });
  for (const stub of Object.values(stubs)) assert.equal(stub.mock.callCount(), 0);
});

test('stopping sample data removes it and switches back to Google', async (t) => {
  const stubs = stubSampleFlow(t, { dataSource: 'sample', locations: 1, reviews: 12 });
  await stopSampleData('w1', 'u1');
  assert.equal(stubs.destroy.mock.callCount(), 1);
  assert.deepEqual(stubs.update.mock.calls[0].arguments[0], { dataSource: 'google' });
  assert.equal(stubs.attachProfile.mock.callCount(), 1);
});

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

async function reconnect(t, { existing, tokens }) {
  const previousProvider = env.gbpProvider;
  env.gbpProvider = 'mock';
  t.after(() => { env.gbpProvider = previousProvider; });
  const update = t.mock.fn(async () => {});
  const destroy = t.mock.method(Location, 'destroy', async () => 1);
  t.mock.method(GoogleConnection, 'findOne', async () => ({ provider: 'live', dataSource: 'google', ...existing, update }));
  t.mock.method(AuditLog, 'create', async () => {});
  t.mock.method(getProvider('mock'), 'exchangeCode', async () => ({ accessToken: 'new-access', expiresAt: new Date(), ...tokens }));
  const { url } = googleService.startConnect('w1');
  const state = new URL(url).searchParams.get('state');
  return { update, destroy, callback: () => googleService.handleCallback({ code: 'c', state }) };
}

test('connecting a different Google account drops the old account\'s locations and refresh token', async (t) => {
  const { update, destroy, callback } = await reconnect(t, { existing: { googleEmail: 'old@x.com' }, tokens: { email: 'new@x.com' } });
  await callback();
  assert.deepEqual(destroy.mock.calls[0].arguments[0], { where: { workspaceId: 'w1' } });
  assert.strictEqual(update.mock.calls[0].arguments[0].refreshToken, null);
});

test('reconnecting the same Google account keeps its data and refresh token', async (t) => {
  const { update, destroy, callback } = await reconnect(t, { existing: { googleEmail: 'same@x.com' }, tokens: { email: 'same@x.com' } });
  await callback();
  assert.equal(destroy.mock.callCount(), 0);
  assert.ok(!('refreshToken' in update.mock.calls[0].arguments[0]));
});

test('a callback that cannot identify the Google account changes nothing', async (t) => {
  const { update, destroy, callback } = await reconnect(t, { existing: { googleEmail: 'old@x.com' }, tokens: { email: undefined } });
  await assert.rejects(callback(), { statusCode: 400 });
  assert.equal(destroy.mock.callCount(), 0);
  assert.equal(update.mock.callCount(), 0);
});

test('sample data survives connecting a different Google account', async (t) => {
  const { destroy, callback } = await reconnect(t, { existing: { googleEmail: 'old@x.com', dataSource: 'sample' }, tokens: { email: 'new@x.com' } });
  await callback();
  assert.equal(destroy.mock.callCount(), 0);
});
