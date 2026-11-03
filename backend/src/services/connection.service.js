const { GoogleConnection, Location, Review, AuditLog } = require('../models');
const { HttpError } = require('../utils/errors');
const googleService = require('./google.service');
const syncService = require('./sync.service');

// Google sign-in can succeed while reading the profile is blocked: API quota stays at 0 until Google approves us.
function readBlockedMessage(err) {
  if (err.statusCode === 429) return 'Google has not approved API access for this project yet, so we cannot read reviews.';
  if (err.statusCode === 403) return `Google blocked reading this profile: ${err.message}`;
  if (err.statusCode === 400 && /No Business Profile/.test(err.message)) return err.message;
  return null;
}

// Tries to read the connected profile. A block from Google leaves the account connected with 0 reviews.
async function loadProfile(workspaceId) {
  const connection = await GoogleConnection.findOne({ where: { workspaceId } });
  try {
    await googleService.attachProfile(workspaceId);
    await syncService.syncWorkspace(workspaceId);
    await connection.update({ apiError: null });
  } catch (err) {
    const apiError = readBlockedMessage(err);
    if (!apiError) throw err;
    await connection.update({ apiError });
  }
  return connection;
}

async function requireConnection(workspaceId) {
  const connection = await GoogleConnection.findOne({ where: { workspaceId } });
  if (!connection) throw new HttpError(400, 'Connect your Google account first');
  return connection;
}

async function useSampleData(workspaceId, userId) {
  const connection = await requireConnection(workspaceId);
  const realReviews = await Review.count({ include: [{ model: Location, where: { workspaceId }, required: true }] });
  if (connection.dataSource !== 'sample' && realReviews > 0) {
    throw new HttpError(409, 'This account already has real reviews, so sample data is not available');
  }
  await Location.destroy({ where: { workspaceId } });
  await connection.update({ dataSource: 'sample', apiError: null });
  await googleService.attachProfile(workspaceId);
  await syncService.syncWorkspace(workspaceId);
  await AuditLog.create({ workspaceId, userId, action: 'google.sample_enabled' });
}

// Deleting the location also deletes its sample reviews and replies.
async function stopSampleData(workspaceId, userId) {
  const connection = await requireConnection(workspaceId);
  await Location.destroy({ where: { workspaceId } });
  await connection.update({ dataSource: 'google' });
  await AuditLog.create({ workspaceId, userId, action: 'google.sample_disabled' });
  return loadProfile(workspaceId);
}

module.exports = { readBlockedMessage, loadProfile, useSampleData, stopSampleData, requireConnection };
