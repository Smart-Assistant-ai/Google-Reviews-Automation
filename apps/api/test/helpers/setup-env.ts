import { config } from 'dotenv';

// Runs before any test imports app code. Every setting is assigned here, not just filled in when
// missing, because Prisma reads the developer's own .env when it starts. Without this, tests would
// pick up real keys from it and call real OpenAI or Google.
config({ path: '.env.test' });

const testEnv: Record<string, string> = {
  NODE_ENV: 'test',
  APP_URL: 'http://localhost:5173',
  API_URL: 'http://localhost:5173',
  JWT_SECRET: 'test-only-3f9a1c7e5b2d4860a1c3e5f7091b3d5f',
  ENCRYPTION_KEY: '6f1d2c3b4a5968778695a4b3c2d1e0f06f1d2c3b4a5968778695a4b3c2d1e0f0',
  GBP_PROVIDER: 'mock',
  GOOGLE_SIGNIN_PROVIDER: 'mock',
  GOOGLE_POSTING_ENABLED: 'false',
  GOOGLE_CLIENT_ID: '',
  GOOGLE_CLIENT_SECRET: '',
  EMAIL_PROVIDER: 'mock',
  RESEND_API_KEY: '',
  OPENAI_API_KEY: '',
  SENTRY_DSN: '',
  SIGNUP_MODE: 'open',
  LOG_LEVEL: 'silent',
  MOCK_MODERATION_SECONDS: '0',
  TRUST_PROXY: 'false',
};
Object.assign(process.env, testEnv);
