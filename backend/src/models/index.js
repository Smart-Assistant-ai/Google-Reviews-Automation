const { Sequelize, DataTypes } = require('sequelize');
const dbConfig = require('../config/database')[process.env.NODE_ENV || 'local'];

const sequelize = new Sequelize(dbConfig.database, dbConfig.username, dbConfig.password, dbConfig);

const opts = (tableName, extra = {}) => ({ tableName, underscored: true, ...extra });
const id = { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 };

const User = sequelize.define('User', {
  id,
  email: { type: DataTypes.STRING, allowNull: false, unique: true },
  passwordHash: { type: DataTypes.STRING, allowNull: false },
  name: DataTypes.STRING,
}, opts('users'));

const Workspace = sequelize.define('Workspace', {
  id,
  ownerUserId: { type: DataTypes.UUID, allowNull: false },
  name: { type: DataTypes.STRING, allowNull: false },
  onboardingStep: { type: DataTypes.STRING, allowNull: false, defaultValue: 'connect' },
}, opts('workspaces'));

const GoogleConnection = sequelize.define('GoogleConnection', {
  id,
  workspaceId: { type: DataTypes.UUID, allowNull: false },
  provider: { type: DataTypes.STRING, allowNull: false },
  googleEmail: DataTypes.STRING,
  accessToken: DataTypes.TEXT,
  refreshToken: DataTypes.TEXT,
  expiresAt: DataTypes.DATE,
  status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'healthy' },
}, opts('google_connections'));

const Location = sequelize.define('Location', {
  id,
  workspaceId: { type: DataTypes.UUID, allowNull: false },
  googleAccountName: { type: DataTypes.STRING, allowNull: false },
  googleLocationName: { type: DataTypes.STRING, allowNull: false },
  title: { type: DataTypes.STRING, allowNull: false },
  address: DataTypes.STRING,
  isSelected: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  lastSyncedAt: DataTypes.DATE,
}, opts('locations'));

const Review = sequelize.define('Review', {
  id,
  locationId: { type: DataTypes.UUID, allowNull: false },
  googleReviewName: { type: DataTypes.STRING, allowNull: false, unique: true },
  reviewerName: DataTypes.STRING,
  reviewerPhotoUrl: DataTypes.TEXT,
  starRating: { type: DataTypes.INTEGER, allowNull: false },
  comment: DataTypes.TEXT,
  media: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  createTime: { type: DataTypes.DATE, allowNull: false },
  updateTime: DataTypes.DATE,
  language: DataTypes.STRING,
  sentiment: DataTypes.STRING,
  topics: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  lastFetchedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, opts('reviews'));

const Reply = sequelize.define('Reply', {
  id,
  reviewId: { type: DataTypes.UUID, allowNull: false, unique: true },
  text: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
  source: { type: DataTypes.STRING, allowNull: false },
  state: { type: DataTypes.STRING, allowNull: false },
  googleReplyState: DataTypes.STRING,
  policyViolation: DataTypes.STRING,
  error: DataTypes.TEXT,
  scheduledFor: DataTypes.DATE,
  autoRuleId: DataTypes.UUID,
  postedAt: DataTypes.DATE,
  postedBy: DataTypes.UUID,
}, opts('replies'));

const VoiceProfile = sequelize.define('VoiceProfile', {
  id,
  workspaceId: { type: DataTypes.UUID, allowNull: false, unique: true },
  businessName: DataTypes.STRING,
  tone: { type: DataTypes.STRING, allowNull: false, defaultValue: 'warm' },
  signOff: DataTypes.STRING,
  ownerName: DataTypes.STRING,
  alwaysSay: DataTypes.TEXT,
  neverSay: DataTypes.TEXT,
  languageMode: { type: DataTypes.STRING, allowNull: false, defaultValue: 'match' },
}, opts('voice_profiles'));

const AutoReplyRule = sequelize.define('AutoReplyRule', {
  id,
  workspaceId: { type: DataTypes.UUID, allowNull: false },
  name: { type: DataTypes.STRING, allowNull: false },
  minStars: { type: DataTypes.INTEGER, allowNull: false },
  maxStars: { type: DataTypes.INTEGER, allowNull: false },
  textCondition: { type: DataTypes.STRING, allowNull: false, defaultValue: 'any' },
  delayMinutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 120 },
  enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  consentedAt: DataTypes.DATE,
  consentedBy: DataTypes.UUID,
}, opts('auto_reply_rules'));

const AuditLog = sequelize.define('AuditLog', {
  id,
  workspaceId: { type: DataTypes.UUID, allowNull: false },
  userId: DataTypes.UUID,
  reviewId: DataTypes.UUID,
  action: { type: DataTypes.STRING, allowNull: false },
  meta: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
}, opts('audit_logs', { updatedAt: false }));

Workspace.hasOne(GoogleConnection, { foreignKey: 'workspaceId' });
Workspace.hasMany(Location, { foreignKey: 'workspaceId' });
Workspace.hasOne(VoiceProfile, { foreignKey: 'workspaceId' });
Workspace.hasMany(AutoReplyRule, { foreignKey: 'workspaceId' });
Location.belongsTo(Workspace, { foreignKey: 'workspaceId' });
Location.hasMany(Review, { foreignKey: 'locationId' });
Review.belongsTo(Location, { foreignKey: 'locationId' });
Review.hasOne(Reply, { foreignKey: 'reviewId' });
Reply.belongsTo(Review, { foreignKey: 'reviewId' });

module.exports = {
  sequelize, User, Workspace, GoogleConnection, Location, Review, Reply, VoiceProfile, AutoReplyRule, AuditLog,
};
