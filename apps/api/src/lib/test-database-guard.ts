// The integration tests wipe every table, so they must never reach a real database.
export function assertTestDatabase(url: string | undefined): void {
  const name = url ? new URL(url).pathname.replace(/^\//, '') : '';
  if (!name.endsWith('_test')) {
    throw new Error(
      `Refusing to run tests: the database name must end in _test, but got "${name || 'nothing'}".`,
    );
  }
}
