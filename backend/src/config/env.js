require('dotenv').config();

module.exports = {
  port: Number(process.env.PORT || 4000),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  backendUrl: process.env.BACKEND_URL || 'http://localhost:4000',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret',
  gbpProvider: process.env.GBP_PROVIDER || 'mock',
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    scopes: ['https://www.googleapis.com/auth/business.manage', 'https://www.googleapis.com/auth/userinfo.email'],
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  },
  mockModerationSeconds: Number(process.env.MOCK_MODERATION_SECONDS || 8),
};
