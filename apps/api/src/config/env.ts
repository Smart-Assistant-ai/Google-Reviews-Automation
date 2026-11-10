import { z } from 'zod';

// Values that have been used as stand-ins in examples. A real deployment must never run on these.
const PLACEHOLDER = /change-?me|dev-?secret|placeholder|example|your-?secret/i;

const secret = (name: string, minLength: number) =>
  z
    .string({ required_error: `${name} is required` })
    .min(minLength, `${name} must be at least ${minLength} characters`)
    .refine((value) => !PLACEHOLDER.test(value), `${name} is still a placeholder value`);

const booleanString = z.enum(['true', 'false']).transform((value) => value === 'true');

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().default('127.0.0.1'),
    PORT: z.coerce.number().int().positive().default(4000),
    LOG_LEVEL: z.enum(['silent', 'error', 'warn', 'info', 'debug']).default('info'),
    TRUST_PROXY: booleanString.optional(),

    APP_URL: z.string({ required_error: 'APP_URL is required' }).url('APP_URL must be a full URL'),
    // Where Google sends people back to. Only differs from APP_URL in development, where the API
    // runs on its own port and the Google project already lists that address.
    API_URL: z.string().url('API_URL must be a full URL').optional(),
    DATABASE_URL: z.string({ required_error: 'DATABASE_URL is required' }).min(1),

    JWT_SECRET: secret('JWT_SECRET', 32),
    ENCRYPTION_KEY: z
      .string({ required_error: 'ENCRYPTION_KEY is required' })
      .regex(
        /^[0-9a-fA-F]{64}$/,
        'ENCRYPTION_KEY must be 64 hex characters (openssl rand -hex 32)',
      ),

    SIGNUP_MODE: z.enum(['allowlist', 'open']).optional(),

    GBP_PROVIDER: z.enum(['mock', 'live']).optional(),
    GOOGLE_SIGNIN_PROVIDER: z.enum(['off', 'mock', 'live']).optional(),
    GOOGLE_POSTING_ENABLED: booleanString.optional(),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),

    EMAIL_PROVIDER: z.enum(['mock', 'resend']).optional(),
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().default('ReplyPilot <onboarding@resend.dev>'),

    OPENAI_API_KEY: z.string().optional(),
    OPENAI_MODEL: z.string().default('gpt-6-luna'),

    SENTRY_DSN: z.string().optional(),
    MOCK_MODERATION_SECONDS: z.coerce.number().min(0).default(8),
  })
  .superRefine((value, ctx) => {
    const fail = (path: string, message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
    const production = value.NODE_ENV === 'production';

    if (production && !value.GBP_PROVIDER) {
      fail('GBP_PROVIDER', 'GBP_PROVIDER must be chosen in production (mock or live)');
    }
    if (production && value.EMAIL_PROVIDER !== 'resend') {
      fail('EMAIL_PROVIDER', 'EMAIL_PROVIDER must be resend in production');
    }
    if (value.EMAIL_PROVIDER === 'resend' && !value.RESEND_API_KEY) {
      fail('RESEND_API_KEY', 'RESEND_API_KEY is required to send real email');
    }
    const usesRealGoogle = value.GBP_PROVIDER === 'live' || value.GOOGLE_SIGNIN_PROVIDER === 'live';
    if (usesRealGoogle && !value.GOOGLE_CLIENT_ID) {
      fail('GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_ID is required to use real Google');
    }
    if (usesRealGoogle && !value.GOOGLE_CLIENT_SECRET) {
      fail('GOOGLE_CLIENT_SECRET', 'GOOGLE_CLIENT_SECRET is required to use real Google');
    }
  })
  .transform((value) => {
    const production = value.NODE_ENV === 'production';
    return {
      ...value,
      TRUST_PROXY: value.TRUST_PROXY ?? production,
      SIGNUP_MODE: value.SIGNUP_MODE ?? (production ? 'allowlist' : 'open'),
      GBP_PROVIDER: value.GBP_PROVIDER ?? 'mock',
      GOOGLE_SIGNIN_PROVIDER: value.GOOGLE_SIGNIN_PROVIDER ?? (production ? 'off' : 'mock'),
      // A real reply is public under the business's name, so only production posts by default.
      GOOGLE_POSTING_ENABLED: value.GOOGLE_POSTING_ENABLED ?? production,
      EMAIL_PROVIDER: value.EMAIL_PROVIDER ?? 'mock',
      COOKIE_SECURE: value.APP_URL.startsWith('https://'),
      APP_URL: value.APP_URL.replace(/\/$/, ''),
      API_URL: (value.API_URL ?? value.APP_URL).replace(/\/$/, ''),
    };
  });

export type Env = z.output<typeof schema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  // An empty value (KEY= in a .env file) means "not set".
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, value]) => value !== ''));
  const parsed = schema.safeParse(cleaned);
  if (parsed.success) return parsed.data;
  const problems = parsed.error.issues.map(
    (issue) => `  - ${issue.path.join('.')}: ${issue.message}`,
  );
  throw new Error(`Invalid configuration, refusing to start:\n${problems.join('\n')}`);
}
