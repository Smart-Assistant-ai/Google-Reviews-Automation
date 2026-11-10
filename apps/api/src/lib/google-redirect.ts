import { env } from '../config';

// Signing in and connecting a Business Profile both come back to this one address, so a Google
// project only ever needs one redirect URI registered.
export const GOOGLE_CALLBACK_PATH = '/api/v1/google/callback';
export const GOOGLE_COOKIE_PATH = '/api/v1/google';

export const googleRedirectUri = () => `${env.API_URL}${GOOGLE_CALLBACK_PATH}`;
