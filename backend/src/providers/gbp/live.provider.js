const env = require('../../config/env');

// Real Google Business Profile calls. Reviews live only in the legacy v4 API;
// accounts and locations come from the newer Account Management / Business Information APIs.
const V4 = 'https://mybusiness.googleapis.com/v4';
const ACCOUNTS = 'https://mybusinessaccountmanagement.googleapis.com/v1';
const BUSINESS_INFO = 'https://mybusinessbusinessinformation.googleapis.com/v1';

async function call(ctx, url, options = {}) {
  const token = await ctx.getAccessToken();
  const res = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  if (res.status === 204) return null;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error?.message || `Google API error ${res.status}`);
    // 429 before approval usually means the project still has 0 QPM quota.
    err.statusCode = res.status;
    err.googleStatus = body.error?.status;
    throw err;
  }
  return body;
}

module.exports = {
  kind: 'live',

  getAuthUrl(state) {
    const params = new URLSearchParams({
      client_id: env.google.clientId,
      redirect_uri: `${env.backendUrl}/api/v1/google/callback`,
      response_type: 'code',
      scope: env.google.scopes.join(' '),
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
        client_id: env.google.clientId,
        client_secret: env.google.clientSecret,
        redirect_uri: `${env.backendUrl}/api/v1/google/callback`,
        grant_type: 'authorization_code',
      }),
    });
    const tokens = await res.json();
    if (!res.ok) throw new Error(tokens.error_description || 'Google token exchange failed');
    const info = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    }).then((r) => r.json());
    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      email: info.email,
    };
  },

  async refreshAccessToken(refreshToken) {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: env.google.clientId,
        client_secret: env.google.clientSecret,
        grant_type: 'refresh_token',
      }),
    });
    const tokens = await res.json();
    if (!res.ok) {
      const err = new Error(tokens.error_description || 'Google token refresh failed');
      err.statusCode = 401;
      throw err;
    }
    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    };
  },

  async revoke(token) {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: 'POST' }).catch(() => {});
  },

  listAccounts: (ctx) => call(ctx, `${ACCOUNTS}/accounts`),

  listLocations: (ctx, accountName) =>
    call(ctx, `${BUSINESS_INFO}/${accountName}/locations?readMask=name,title,storefrontAddress&pageSize=100`),

  async listReviews(ctx, accountName, locationName) {
    const all = [];
    let pageToken;
    let meta = {};
    do {
      const qs = new URLSearchParams({ pageSize: '50', ...(pageToken ? { pageToken } : {}) });
      const page = await call(ctx, `${V4}/${accountName}/${locationName}/reviews?${qs}`);
      all.push(...(page.reviews || []));
      meta = { averageRating: page.averageRating, totalReviewCount: page.totalReviewCount };
      pageToken = page.nextPageToken;
    } while (pageToken);
    return { reviews: all, ...meta };
  },

  getReview: (ctx, reviewName) => call(ctx, `${V4}/${reviewName}`),

  updateReply: (ctx, reviewName, comment) =>
    call(ctx, `${V4}/${reviewName}/reply`, { method: 'PUT', body: JSON.stringify({ comment }) }),

  deleteReply: (ctx, reviewName) => call(ctx, `${V4}/${reviewName}/reply`, { method: 'DELETE' }),
};
