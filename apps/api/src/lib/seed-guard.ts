// The seed replaces the demo account and prints a login, so it must never touch a real environment.
export function assertSeedAllowed(source: Record<string, string | undefined>): void {
  if (source.NODE_ENV === 'production') throw new Error('Refusing to seed: NODE_ENV is production.');
  if (source.ALLOW_DB_SEED !== 'true') throw new Error('Refusing to seed: set ALLOW_DB_SEED=true to confirm this is not a real database.');
}
