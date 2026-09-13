/**
 * Turso / libSQL database for [`remix/data-table`](https://github.com/remix-run/remix/tree/main/packages/data-table),
 * for when you want `data-table` APIs backed by an asynchronous SQLite client.
 *
 * Renamed from `@kuboon/remix-data-table-sqlite-turso` at 0.4.0; the `remix-` prefix went with the move, because the
 * scope says it now. The old name stops at 0.3.2 and stays on JSR — nothing was unpublished.
 *
 * @module
 */

export { createTursoDatabase, TursoDatabase } from './lib/database.ts'
export { parseTursoDbArgs, runTursoDbCli } from './lib/cli.ts'
export type { TursoDbCliOptions, TursoDbCommand, TursoDbInvocation } from './lib/cli.ts'
export type { Client as TursoDatabaseClient } from '@libsql/client'
