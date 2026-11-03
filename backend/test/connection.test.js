const test = require('node:test');
const assert = require('node:assert');
const Fastify = require('fastify');
const env = require('../src/config/env');
const { HttpError } = require('../src/utils/errors');
const { getProvider } = require('../src/providers/gbp');
const { GoogleConnection, Location, Review, AuditLog } = require('../src/models');
const { readBlockedMessage, useSampleData, stopSampleData } = require('../src/services/connection.service');
const googleService = require('../src/services/google.service');
const googleRoutes = require('../src/routes/google.routes');
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

async function reconnect(t, { existing, tokens, locations = 1 }) {
  const previousProvider = env.gbpProvider;
  env.gbpProvider = 'mock';
  t.after(() => { env.gbpProvider = previousProvider; });
  const update = t.mock.fn(async () => {});
  const destroy = t.mock.method(Location, 'destroy', async () => 1);
  t.mock.method(Location, 'count', async () => locations);
  t.mock.method(GoogleConnection, 'findOne', async () => ({ provider: 'live', dataSource: 'google', ...existing, update }));
  t.mock.method(AuditLog, 'create', async () => {});
  t.mock.method(getProvider('mock'), 'exchangeCode', async () => ({ accessToken: 'new-access', expiresAt: new Date(), ...tokens }));
  const { url } = googleService.startConnect('w1');
  const state = new URL(url).searchParams.get('state');
  return { update, destroy, callback: () => googleService.handleCallback({ code: 'c', state }) };
}

test('connecting a different Google account is refused while the old account has data', async (t) => {
  const { update, destroy, callback } = await reconnect(t, { existing: { googleEmail: 'old@x.com' }, tokens: { email: 'new@x.com', refreshToken: 'new-refresh' } });
  await assert.rejects(callback(), { statusCode: 409, code: 'google_account_conflict' });
  assert.equal(destroy.mock.callCount(), 0);
  assert.equal(update.mock.callCount(), 0);
});

test('a different Google account can take over when the old one has no data, without its refresh token', async (t) => {
  const { update, destroy, callback } = await reconnect(t, { existing: { googleEmail: 'old@x.com' }, tokens: { email: 'new@x.com' }, locations: 0 });
  await callback();
  assert.equal(destroy.mock.callCount(), 0);
  assert.strictEqual(update.mock.calls[0].arguments[0].googleEmail, 'new@x.com');
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
  const { update, destroy, callback } = await reconnect(t, { existing: { googleEmail: 'old@x.com', dataSource: 'sample' }, tokens: { email: 'new@x.com' } });
  await callback();
  assert.equal(destroy.mock.callCount(), 0);
  assert.equal(update.mock.callCount(), 1);
});

async function callbackRedirect(t, err) {
  t.mock.method(googleService, 'handleCallback', async () => { throw err; });
  const app = Fastify();
  t.after(() => app.close());
  app.decorate('authenticate', async () => {});
  app.register(googleRoutes);
  const res = await app.inject('/callback');
  return new URL(res.headers.location).searchParams;
}

test('the callback flags an account conflict so onboarding can offer recovery', async (t) => {
  const params = await callbackRedirect(t, new HttpError(409, 'Different account', 'google_account_conflict'));
  assert.strictEqual(params.get('google_connected'), 'false');
  assert.strictEqual(params.get('conflict'), 'true');
});

test('a 409 from anything else is not treated as an account conflict', async (t) => {
  const params = await callbackRedirect(t, googleError(409, 'Google said conflict'));
  assert.strictEqual(params.get('conflict'), null);
});
