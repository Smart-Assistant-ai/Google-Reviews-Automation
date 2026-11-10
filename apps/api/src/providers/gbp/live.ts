import { env } from '../../config';
import { googleRedirectUri } from '../../lib/google-redirect';
import { googleCalls } from './limits';
import { GoogleApiError, type GbpContext, type GbpProvider } from './types';

// Reviews live only in the legacy v4 API. Accounts and locations use the newer APIs.
const V4 = 'https://mybusiness.googleapis.com/v4';
const ACCOUNTS = 'https://mybusinessaccountmanagement.googleapis.com/v1';
const BUSINESS_INFO = 'https://mybusinessbusinessinformation.googleapis.com/v1';

const SCOPES = ['https://www.googleapis.com/auth/business.manage', 'openid', 'email'];

async function call<T>(ctx: GbpContext, url: string, options: RequestInit = {}): Promise<T> {
  await googleCalls.acquire();
  const token = await ctx.getAccessToken();
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (res.status === 204) return null as T;
  const body = (await res.json().catch(() => ({}))) as {
    error?: { message?: string; status?: string; details?: { reason?: string }[] };
  };
  if (!res.ok) {
    // A 429 before approval usually means the project still has a quota of zero.
    throw new GoogleApiError(
      body.error?.message ?? `Google API error ${res.status}`,
      res.status,
      body.error?.status,
      body.error?.details?.find((detail) => detail.reason)?.reason,
    );
  }
  return body as T;
}

const query = (values: Record<string, string | undefined>) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value) params.set(key, value);
  return params.toString();
};

export const liveGbpProvider: GbpProvider = {
  kind: 'live',

  getAuthUrl(state) {
    const params = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID!,
      redirect_uri: googleRedirectUri(),
      response_type: 'code',
      scope: SCOPES.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  },

  async exchangeCode(code) {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID!,
        client_secret: env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: googleRedirectUri(),
        grant_type: 'authorization_code',
      }),
    });
    const tokens = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      error_description?: string;
    };
    if (!res.ok)
      throw new GoogleApiError(
        tokens.error_description ?? 'Google token exchange failed',
        res.status,
      );
    const infoRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!infoRes.ok) throw new GoogleApiError('Could not read the Google account', infoRes.status);
    const info = (await infoRes.json()) as { sub: string; email: string };
    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      email: info.email,
      googleUserId: info.sub,
    };
  },

  async refreshAccessToken(refreshToken) {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: env.GOOGLE_CLIENT_ID!,
        client_secret: env.GOOGLE_CLIENT_SECRET!,
        grant_type: 'refresh_token',
      }),
    });
    const tokens = (await res.json().catch(() => ({}))) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      error_description?: string;
    };
    if (!res.ok) {
      // 400 and 401 mean the token is dead. Anything else is Google having a bad moment, which retries fix.
      const dead = res.status === 400 || res.status === 401;
      throw new GoogleApiError(
        tokens.error_description ?? 'Google token refresh failed',
        dead ? 401 : 503,
      );
    }
    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    };
  },

  async revoke(token) {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
      method: 'POST',
    }).catch(() => {});
  },

  listAccounts: (ctx, pageToken) =>
    call(ctx, `${ACCOUNTS}/accounts?${query({ pageSize: '20', pageToken })}`),

  listLocations: (ctx, accountName, pageToken) =>
    call(
      ctx,
      `${BUSINESS_INFO}/${accountName}/locations?${query({ readMask: 'name,title,storefrontAddress', pageSize: '100', pageToken })}`,
    ),

  listReviews: (ctx, accountName, locationName, pageToken) =>
    call(
      ctx,
      `${V4}/${accountName}/${locationName}/reviews?${query({ pageSize: '50', pageToken })}`,
    ),

  getReview: (ctx, reviewName) => call(ctx, `${V4}/${reviewName}`),

  updateReply: (ctx, reviewName, comment) =>
    call(ctx, `${V4}/${reviewName}/reply`, { method: 'PUT', body: JSON.stringify({ comment }) }),

  deleteReply: (ctx, reviewName) => call(ctx, `${V4}/${reviewName}/reply`, { method: 'DELETE' }),
};
