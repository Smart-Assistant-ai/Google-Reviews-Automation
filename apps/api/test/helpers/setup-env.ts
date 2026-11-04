import { config } from 'dotenv';

// Runs before any test imports app code, so the config check sees a full environment.
config({ path: '.env.test' });
process.env.NODE_ENV = 'test';
process.env.APP_URL ??= 'http://localhost:5173';
process.env.JWT_SECRET ??= 'test-only-3f9a1c7e5b2d4860a1c3e5f7091b3d5f';
process.env.ENCRYPTION_KEY ??= '6f1d2c3b4a5968778695a4b3c2d1e0f06f1d2c3b4a5968778695a4b3c2d1e0f0';
process.env.GBP_PROVIDER ??= 'mock';
process.env.GOOGLE_SIGNIN_PROVIDER ??= 'mock';
process.env.EMAIL_PROVIDER ??= 'mock';
process.env.SIGNUP_MODE ??= 'open';
process.env.LOG_LEVEL ??= 'silent';
