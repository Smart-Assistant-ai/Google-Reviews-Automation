const crypto = require('crypto');
const env = require('../config/env');
const aes = require('../utils/crypto.aes');
const { HttpError } = require('../utils/errors');
const { getProvider } = require('../providers/gbp');
const { GoogleConnection, Location, Workspace, AuditLog } = require('../models');

// OAuth state lives in memory for the POC (node-backend keeps it in Redis for 10 min).
const pendingStates = new Map();
const STATE_TTL_MS = 10 * 60 * 1000;

function startConnect(workspaceId) {
  const state = crypto.randomBytes(24).toString('hex');
  pendingStates.set(state, { workspaceId, expiresAt: Date.now() + STATE_TTL_MS });
  return { url: getProvider().getAuthUrl(state), provider: getProvider().kind };
}

async function handleCallback({ code, state, error }) {
  const pending = pendingStates.get(state);
  pendingStates.delete(state);
  if (error) throw new HttpError(400, error);
  if (!pending || pending.expiresAt < Date.now()) throw new HttpError(400, 'Connection link expired, please try again');

  const provider = getProvider();
  const tokens = await provider.exchangeCode(code);
  const values = {
    workspaceId: pending.workspaceId,
    provider: provider.kind,
    googleEmail: tokens.email,
    accessToken: aes.encrypt(tokens.accessToken),
    refreshToken: aes.encrypt(tokens.refreshToken),
    expiresAt: tokens.expiresAt,
    status: 'healthy',
  };
  const existing = await GoogleConnection.findOne({ where: { workspaceId: pending.workspaceId } });
  if (existing) {
    // Google only returns a refresh token on first consent; keep the old one if missing.
    if (!tokens.refreshToken) delete values.refreshToken;
    await existing.update(values);
  } else {
    await GoogleConnection.create(values);
  }

  const workspace = await Workspace.findByPk(pending.workspaceId);
  if (workspace.onboardingStep === 'connect') await workspace.update({ onboardingStep: 'location' });
  await AuditLog.create({ workspaceId: pending.workspaceId, action: 'google.connected', meta: { email: tokens.email } });
  return workspace;
}

// Returns the provider context used by every GBP call, refreshing the access token when needed.
async function getContext(workspaceId) {
  const connection = await GoogleConnection.findOne({ where: { workspaceId } });
  if (!connection) throw new HttpError(400, 'Google Business Profile is not connected');
  const provider = getProvider(connection.provider);

  const getAccessToken = async () => {
    const expiringSoon = !connection.expiresAt || connection.expiresAt.getTime() - Date.now() < 5 * 60 * 1000;
    if (provider.kind === 'live' && expiringSoon) {
      try {
        const refreshed = await provider.refreshAccessToken(aes.decrypt(connection.refreshToken));
        await connection.update({
          accessToken: aes.encrypt(refreshed.accessToken),
          ...(refreshed.refreshToken ? { refreshToken: aes.encrypt(refreshed.refreshToken) } : {}),
          expiresAt: refreshed.expiresAt,
          status: 'healthy',
        });
      } catch (err) {
        await connection.update({ status: 'needs_reconnect' });
        throw err;
      }
    }
    return aes.decrypt(connection.accessToken);
  };

  return { provider, ctx: { connection, getAccessToken } };
}

async function getStatus(workspaceId) {
  const connection = await GoogleConnection.findOne({ where: { workspaceId } });
  const location = await Location.findOne({ where: { workspaceId, isSelected: true } });
  return {
    connected: !!connection,
    provider: connection?.provider || env.gbpProvider,
    email: connection?.googleEmail || null,
    status: connection?.status || null,
    location: location ? { id: location.id, title: location.title, address: location.address, lastSyncedAt: location.lastSyncedAt } : null,
  };
}

async function listLocations(workspaceId) {
  const { provider, ctx } = await getContext(workspaceId);
  const { accounts = [] } = await provider.listAccounts(ctx);
  for (const account of accounts) {
    const { locations = [] } = await provider.listLocations(ctx, account.name);
    for (const loc of locations) {
      const [row] = await Location.findOrCreate({
        where: { workspaceId, googleLocationName: loc.name },
        defaults: { googleAccountName: account.name, title: loc.title, address: loc.storefrontAddress?.addressLines?.join(', ') },
      });
      await row.update({ title: loc.title, address: loc.storefrontAddress?.addressLines?.join(', ') });
    }
  }
  const rows = await Location.findAll({ where: { workspaceId }, order: [['title', 'ASC']] });
  return rows.map((l) => ({ id: l.id, title: l.title, address: l.address, isSelected: l.isSelected }));
}

async function selectLocation(workspaceId, locationId) {
  const location = await Location.findOne({ where: { id: locationId, workspaceId } });
  if (!location) throw new HttpError(404, 'Location not found');
  // v1 UI: one location per workspace.
  await Location.update({ isSelected: false }, { where: { workspaceId } });
  await location.update({ isSelected: true });
  const workspace = await Workspace.findByPk(workspaceId);
  if (workspace.onboardingStep === 'location') await workspace.update({ onboardingStep: 'voice' });
  return location;
}

async function disconnect(workspaceId, userId) {
  const connection = await GoogleConnection.findOne({ where: { workspaceId } });
  if (!connection) return;
  const provider = getProvider(connection.provider);
  if (provider.revoke) await provider.revoke(aes.decrypt(connection.refreshToken || connection.accessToken));
  // Google policy: on disconnect the business regains exclusive control, so we drop its data.
  await Location.destroy({ where: { workspaceId } });
  await connection.destroy();
  await Workspace.update({ onboardingStep: 'connect' }, { where: { id: workspaceId } });
  await AuditLog.create({ workspaceId, userId, action: 'google.disconnected' });
}

module.exports = { startConnect, handleCallback, getContext, getStatus, listLocations, selectLocation, disconnect };
