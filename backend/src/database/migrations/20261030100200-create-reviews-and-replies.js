'use strict';

const timestamps = (Sequelize) => ({
  created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
  updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
});

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('reviews', {
      id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('gen_random_uuid()') },
      location_id: {
        type: Sequelize.UUID, allowNull: false,
        references: { model: 'locations', key: 'id' }, onDelete: 'CASCADE',
      },
      google_review_name: { type: Sequelize.STRING, allowNull: false, unique: true },
      reviewer_name: { type: Sequelize.STRING },
      reviewer_photo_url: { type: Sequelize.TEXT },
      star_rating: { type: Sequelize.INTEGER, allowNull: false },
      comment: { type: Sequelize.TEXT },
      media: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      create_time: { type: Sequelize.DATE, allowNull: false },
      update_time: { type: Sequelize.DATE },
      language: { type: Sequelize.STRING },
      sentiment: { type: Sequelize.STRING }, // positive | neutral | negative
      topics: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      last_fetched_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      ...timestamps(Sequelize),
    });
    await queryInterface.addIndex('reviews', ['location_id', 'create_time']);

    await queryInterface.createTable('replies', {
      id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('gen_random_uuid()') },
      review_id: {
        type: Sequelize.UUID, allowNull: false, unique: true,
        references: { model: 'reviews', key: 'id' }, onDelete: 'CASCADE',
      },
      text: { type: Sequelize.TEXT, allowNull: false, defaultValue: '' },
      source: { type: Sequelize.STRING, allowNull: false }, // ai | human | auto | google
      // drafting | draft | scheduled | pending_google | live | rejected | failed
      state: { type: Sequelize.STRING, allowNull: false },
      google_reply_state: { type: Sequelize.STRING }, // PENDING | APPROVED | REJECTED
      policy_violation: { type: Sequelize.STRING },
      error: { type: Sequelize.TEXT },
      scheduled_for: { type: Sequelize.DATE },
      auto_rule_id: { type: Sequelize.UUID },
      posted_at: { type: Sequelize.DATE },
      posted_by: { type: Sequelize.UUID },
      ...timestamps(Sequelize),
    });
    await queryInterface.addIndex('replies', ['state', 'scheduled_for']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('replies');
    await queryInterface.dropTable('reviews');
  },
};
