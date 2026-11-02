const bcrypt = require('bcryptjs');
const { sequelize, User, Workspace, VoiceProfile } = require('../models');
const { HttpError } = require('../utils/errors');

async function signup({ email, password, name, businessName }) {
  if (!email || !password || password.length < 8) {
    throw new HttpError(400, 'Email and a password of at least 8 characters are required');
  }
  const normalized = email.trim().toLowerCase();
  if (await User.findOne({ where: { email: normalized } })) {
    throw new HttpError(409, 'An account with this email already exists');
  }

  return sequelize.transaction(async (transaction) => {
    const user = await User.create({
      email: normalized, name, passwordHash: await bcrypt.hash(password, 10),
    }, { transaction });
    const workspace = await Workspace.create({
      ownerUserId: user.id, name: businessName || `${name || normalized}'s business`,
    }, { transaction });
    await VoiceProfile.create({
      workspaceId: workspace.id, businessName: businessName || null, ownerName: name || null,
    }, { transaction });
    return { user, workspace };
  });
}

async function login({ email, password }) {
  const user = await User.findOne({ where: { email: (email || '').trim().toLowerCase() } });
  if (!user || !(await bcrypt.compare(password || '', user.passwordHash))) {
    throw new HttpError(401, 'Invalid email or password');
  }
  const workspace = await Workspace.findOne({ where: { ownerUserId: user.id } });
  return { user, workspace };
}

async function me(userId, workspaceId) {
  const user = await User.findByPk(userId);
  const workspace = await Workspace.findByPk(workspaceId);
  if (!user || !workspace) throw new HttpError(401, 'Unauthorized');
  return { user, workspace };
}

function serialize({ user, workspace }) {
  return {
    user: { id: user.id, email: user.email, name: user.name },
    workspace: { id: workspace.id, name: workspace.name, onboardingStep: workspace.onboardingStep },
  };
}

module.exports = { signup, login, me, serialize };
