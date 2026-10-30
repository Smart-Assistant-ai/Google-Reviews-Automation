'use strict';

const timestamps = (Sequelize) => ({
  created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
  updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
});

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('google_connections', {
      id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('gen_random_uuid()') },
      workspace_id: {
        type: Sequelize.UUID, allowNull: false, unique: true,
        references: { model: 'workspaces', key: 'id' }, onDelete: 'CASCADE',
      },
      provider: { type: Sequelize.STRING, allowNull: false }, // mock | live
      google_email: { type: Sequelize.STRING },
      access_token: { type: Sequelize.TEXT }, // AES encrypted
      refresh_token: { type: Sequelize.TEXT }, // AES encrypted
      expires_at: { type: Sequelize.DATE },
      status: { type: Sequelize.STRING, allowNull: false, defaultValue: 'healthy' }, // healthy | needs_reconnect | revoked
      ...timestamps(Sequelize),
    });

    await queryInterface.createTable('locations', {
      id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('gen_random_uuid()') },
      workspace_id: {
        type: Sequelize.UUID, allowNull: false,
        references: { model: 'workspaces', key: 'id' }, onDelete: 'CASCADE',
      },
      google_account_name: { type: Sequelize.STRING, allowNull: false }, // accounts/{id}
      google_location_name: { type: Sequelize.STRING, allowNull: false }, // locations/{id}
      title: { type: Sequelize.STRING, allowNull: false },
      address: { type: Sequelize.STRING },
      is_selected: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      last_synced_at: { type: Sequelize.DATE },
      ...timestamps(Sequelize),
    });
    await queryInterface.addIndex('locations', ['workspace_id', 'google_location_name'], { unique: true });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('locations');
    await queryInterface.dropTable('google_connections');
  },
};
