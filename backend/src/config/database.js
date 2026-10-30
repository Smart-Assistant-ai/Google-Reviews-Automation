require('dotenv').config();

// Same shape as AI-Agents-Combined node-backend: env picked by NODE_ENV.
const base = {
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  dialect: 'postgres',
  migrationStorage: 'sequelize',
  migrationStorageTableName: 'sequelize_meta',
  logging: false,
  pool: { max: 20, min: 0, acquire: 60000, idle: 10000 },
};

const ssl = { ssl: { require: true, rejectUnauthorized: false } };

module.exports = {
  local: { ...base, dialectOptions: { ssl: false } },
  development: { ...base, dialectOptions: ssl },
  production: { ...base, dialectOptions: ssl },
};
