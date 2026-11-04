import { env } from '../../config';
import type { GoogleIdentityProvider } from './types';

const redirectUri = () => `${env.APP_URL}/api/v1/auth/google/callback`;

// Sign-in only proves who someone is. It asks for no access to their Business Profile,
// which has its own separate consent when they connect it.
export const liveGoogleIdentity: GoogleIdentityProvider = {
  getAuthUrl(state) {
    const params = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID!,
      redirect_uri: redirectUri(),
      response_type: 'code',
      scope: 'openid email profile',
      prompt: 'select_account',
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  },

  async exchangeCode(code) {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID!,
        client_secret: env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: redirectUri(),
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenRes.ok)
      throw new Error(`Google token exchange failed with status ${tokenRes.status}`);
    const tokens = (await tokenRes.json()) as { access_token: string };

    const infoRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!infoRes.ok) throw new Error(`Google user info failed with status ${infoRes.status}`);
    const info = (await infoRes.json()) as {
      sub: string;
      email: string;
      email_verified?: boolean;
      name?: string;
    };
    return {
      sub: info.sub,
      email: info.email,
      emailVerified: info.email_verified === true,
      name: info.name ?? null,
    };
  },
};
