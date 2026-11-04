import { env } from '../../config';
import type { GoogleIdentity, GoogleIdentityProvider } from './types';

// Local development and tests: the fake consent page sends who you are as the code.
export const mockGoogleIdentity: GoogleIdentityProvider = {
  getAuthUrl(state) {
    return `${env.APP_URL}/mock-google?flow=signin&state=${encodeURIComponent(state)}`;
  },
  async exchangeCode(code) {
    const parsed = JSON.parse(Buffer.from(code, 'base64url').toString('utf8')) as Partial<GoogleIdentity>;
    if (!parsed.sub || !parsed.email) throw new Error('Mock Google code is missing sub or email');
    return { sub: parsed.sub, email: parsed.email, emailVerified: parsed.emailVerified ?? true, name: parsed.name ?? null };
  },
};
