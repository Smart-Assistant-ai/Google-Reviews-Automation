'use strict';

const timestamps = (Sequelize) => ({
  created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
  updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
});

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('users', {
      id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('gen_random_uuid()') },
      email: { type: Sequelize.STRING, allowNull: false, unique: true },
      password_hash: { type: Sequelize.STRING, allowNull: false },
      name: { type: Sequelize.STRING },
      ...timestamps(Sequelize),
    });

    await queryInterface.createTable('workspaces', {
      id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('gen_random_uuid()') },
      owner_user_id: {
        type: Sequelize.UUID, allowNull: false,
        references: { model: 'users', key: 'id' }, onDelete: 'CASCADE',
      },
      name: { type: Sequelize.STRING, allowNull: false },
      // connect -> location -> voice -> rules -> done
      onboarding_step: { type: Sequelize.STRING, allowNull: false, defaultValue: 'connect' },
      ...timestamps(Sequelize),
    });
    await queryInterface.addIndex('workspaces', ['owner_user_id']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('workspaces');
    await queryInterface.dropTable('users');
  },
};
