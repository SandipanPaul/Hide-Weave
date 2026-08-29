/**
 * Stands in for the `server-only` package under vitest.
 *
 * That package exists to break the Next build if a server module is pulled into
 * a client bundle. Vitest has no such bundles, and it does not set the
 * "react-server" export condition, so the real package would throw on import.
 */
export {};
