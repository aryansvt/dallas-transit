/** Explicit TLS behavior shared by the API pool and one-shot administration.
 * Render's private host uses a self-signed certificate; external hosts must verify.
 * Never let pg connection-string SSL options silently override this policy.
 */
export function databaseConnection(connectionString: string) {
  try {
    const url = new URL(connectionString);
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      !url.hostname ||
      url.pathname.length < 2 ||
      url.hash
    )
      throw new Error();
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    const renderInternal = /^dpg-[a-z0-9-]+$/.test(url.hostname);
    const mode = url.searchParams.get('sslmode');
    if (
      [...url.searchParams.keys()].some((key) => key !== 'sslmode') ||
      url.searchParams.getAll('sslmode').length > 1
    )
      throw new Error();
    if (mode && !['disable', 'require', 'verify-full'].includes(mode))
      throw new Error();
    if (mode === 'disable' && !local && !renderInternal) throw new Error();
    if (mode === 'verify-full' && renderInternal) throw new Error();
    url.searchParams.delete('sslmode');
    const ssl =
      (local && (!mode || mode === 'disable')) ||
      (renderInternal && mode === 'disable')
        ? false
        : { rejectUnauthorized: !renderInternal };
    return { connectionString: url.toString(), ssl };
  } catch {
    throw new Error(
      'DATABASE_URL must identify a PostgreSQL database with supported TLS settings',
    );
  }
}
