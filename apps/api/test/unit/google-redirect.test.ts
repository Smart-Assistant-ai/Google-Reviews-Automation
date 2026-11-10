import { describe, expect, it } from 'vitest';
import { env } from '../../src/config';
import { liveGbpProvider } from '../../src/providers/gbp/live';
import { liveGoogleIdentity } from '../../src/providers/google-identity/live';

const redirectOf = (url: string) => new URL(url).searchParams.get('redirect_uri');

// One address for both flows, so a Google project only ever needs one redirect URI registered.
describe('Google redirect address', () => {
  it('is the same for signing in and for connecting a Business Profile', () => {
    const expected = `${env.API_URL}/api/v1/google/callback`;
    expect(redirectOf(liveGoogleIdentity.getAuthUrl('s'))).toBe(expected);
    expect(redirectOf(liveGbpProvider.getAuthUrl('s'))).toBe(expected);
  });

  it('asks sign-in only for who someone is, and connecting for Business Profile access', () => {
    expect(new URL(liveGoogleIdentity.getAuthUrl('s')).searchParams.get('scope')).toBe(
      'openid email profile',
    );
    expect(new URL(liveGbpProvider.getAuthUrl('s')).searchParams.get('scope')).toContain(
      'business.manage',
    );
  });
});
