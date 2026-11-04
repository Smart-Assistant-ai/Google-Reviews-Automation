import { env } from '../../config';
import { liveGoogleIdentity } from './live';
import { mockGoogleIdentity } from './mock';
import type { GoogleIdentityProvider } from './types';

export const googleSignInEnabled = () => env.GOOGLE_SIGNIN_PROVIDER !== 'off';

export const googleIdentity = (): GoogleIdentityProvider =>
  env.GOOGLE_SIGNIN_PROVIDER === 'live' ? liveGoogleIdentity : mockGoogleIdentity;

export type { GoogleIdentity } from './types';
