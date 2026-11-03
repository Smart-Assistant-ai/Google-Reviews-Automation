'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // google = read the connected profile; sample = serve the fake profile, keeping the real OAuth tokens.
    await queryInterface.addColumn('google_connections', 'data_source', { type: Sequelize.STRING, allowNull: false, defaultValue: 'google' });
    // Why we could not read the profile, such as Google not having approved API access yet.
    await queryInterface.addColumn('google_connections', 'api_error', { type: Sequelize.TEXT });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('google_connections', 'api_error');
    await queryInterface.removeColumn('google_connections', 'data_source');
  },
};
