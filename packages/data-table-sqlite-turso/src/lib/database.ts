import { Database, type DatabaseOptions } from '@remix-run/data-table'
import type { Client as TursoClient } from '@libsql/client'

import { TursoDriver } from './driver.ts'

/**
 * A {@link Database} backed by a Turso / libSQL client.
 *
 * The client is always supplied by the caller: `@libsql/client` ships several entry points
 * (`@libsql/client`, `@libsql/client/web`, `@libsql/client/sqlite3`) and only the application knows
 * which one its runtime can load. That also means the client stays caller-owned — `close()` is a
 * no-op here, so close the client yourself at shutdown.
 */
export class TursoDatabase extends Database<'sqlite'> {
  /**
   * Creates a Turso-backed database.
   * @param client libSQL client (for example from `@libsql/client`).
   * @param options Database runtime options.
   */
  constructor(client: TursoClient, options?: DatabaseOptions) {
    super(new TursoDriver(client), options)
  }
}

/**
 * Creates a Turso-backed database.
 * @param client libSQL client (for example from `@libsql/client`).
 * @param options Database runtime options.
 * @returns A Turso database.
 * @example
 * ```ts
 * import { createClient } from '@libsql/client'
 * import { createTursoDatabase } from '@kuboon/remix-data-table-sqlite-turso'
 *
 * let client = createClient({
 *   url: process.env.TURSO_DATABASE_URL,
 *   authToken: process.env.TURSO_AUTH_TOKEN,
 * })
 * let db = createTursoDatabase(client)
 * ```
 */
export function createTursoDatabase(
  client: TursoClient,
  options?: DatabaseOptions,
): TursoDatabase {
  return new TursoDatabase(client, options)
}
