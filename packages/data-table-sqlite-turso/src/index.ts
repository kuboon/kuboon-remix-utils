/**
 * Turso / libSQL database for [`remix/data-table`](https://github.com/remix-run/remix/tree/main/packages/data-table),
 * for when you want `data-table` APIs backed by an asynchronous SQLite client.
 *
 * ## This package has moved
 *
 * It continues as **`@remix-kbn/data-table-sqlite-turso`**. The `remix-` prefix goes with the move, because the scope now
 * says it.
 *
 * ```diff
 * - "@kuboon/remix-data-table-sqlite-turso": "jsr:@kuboon/remix-data-table-sqlite-turso@^0.3.1"
 * + "@remix-kbn/data-table-sqlite-turso": "jsr:@remix-kbn/data-table-sqlite-turso"
 * ```
 *
 * 0.3.2 carries this notice and nothing else — its code is 0.3.1's. What comes after it
 * is published under the new name; if `@remix-kbn/data-table-sqlite-turso` is not on JSR yet as you read this, that is the
 * only thing left to happen.
 *
 * Nothing breaks if you stay. JSR cannot unpublish, so every version under this name keeps
 * resolving exactly as it does today, and there is no deadline attached to moving.
 *
 * @module
 */

export { createTursoDatabase, TursoDatabase } from './lib/database.ts'
export { parseTursoDbArgs, runTursoDbCli } from './lib/cli.ts'
export type { TursoDbCliOptions, TursoDbCommand, TursoDbInvocation } from './lib/cli.ts'
export type { Client as TursoDatabaseClient } from '@libsql/client'
