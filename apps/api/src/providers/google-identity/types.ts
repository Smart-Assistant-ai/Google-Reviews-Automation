export interface GoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
}

export interface GoogleIdentityProvider {
  getAuthUrl(state: string): string;
  exchangeCode(code: string): Promise<GoogleIdentity>;
}
