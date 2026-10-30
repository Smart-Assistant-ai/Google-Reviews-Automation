'use strict';

const timestamps = (Sequelize) => ({
  created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
  updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
});

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('voice_profiles', {
      id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('gen_random_uuid()') },
      workspace_id: {
        type: Sequelize.UUID, allowNull: false, unique: true,
        references: { model: 'workspaces', key: 'id' }, onDelete: 'CASCADE',
      },
      business_name: { type: Sequelize.STRING },
      tone: { type: Sequelize.STRING, allowNull: false, defaultValue: 'warm' }, // warm | professional | playful
      sign_off: { type: Sequelize.STRING },
      owner_name: { type: Sequelize.STRING },
      always_say: { type: Sequelize.TEXT },
      never_say: { type: Sequelize.TEXT },
      language_mode: { type: Sequelize.STRING, allowNull: false, defaultValue: 'match' }, // match | english
      ...timestamps(Sequelize),
    });

    await queryInterface.createTable('auto_reply_rules', {
      id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('gen_random_uuid()') },
      workspace_id: {
        type: Sequelize.UUID, allowNull: false,
        references: { model: 'workspaces', key: 'id' }, onDelete: 'CASCADE',
      },
      name: { type: Sequelize.STRING, allowNull: false },
      min_stars: { type: Sequelize.INTEGER, allowNull: false },
      max_stars: { type: Sequelize.INTEGER, allowNull: false },
      text_condition: { type: Sequelize.STRING, allowNull: false, defaultValue: 'any' }, // any | with_text | without_text
      delay_minutes: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 120 },
      enabled: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      consented_at: { type: Sequelize.DATE },
      consented_by: { type: Sequelize.UUID },
      ...timestamps(Sequelize),
    });
    await queryInterface.addIndex('auto_reply_rules', ['workspace_id']);

    await queryInterface.createTable('audit_logs', {
      id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('gen_random_uuid()') },
      workspace_id: {
        type: Sequelize.UUID, allowNull: false,
        references: { model: 'workspaces', key: 'id' }, onDelete: 'CASCADE',
      },
      user_id: { type: Sequelize.UUID },
      review_id: { type: Sequelize.UUID },
      action: { type: Sequelize.STRING, allowNull: false },
      meta: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
    await queryInterface.addIndex('audit_logs', ['workspace_id', 'created_at']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('audit_logs');
    await queryInterface.dropTable('auto_reply_rules');
    await queryInterface.dropTable('voice_profiles');
  },
};
