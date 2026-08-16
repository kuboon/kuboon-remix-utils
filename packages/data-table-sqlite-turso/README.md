# data-table-sqlite-turso

Turso / libSQL database for [`remix/data-table`](https://github.com/remix-run/remix/tree/main/packages/data-table). Use this package when you want `data-table` APIs backed by an asynchronous SQLite client such as [`@libsql/client`](https://www.npmjs.com/package/@libsql/client).

Turso speaks the SQLite dialect but exposes an async, promise-based client, so the synchronous [`data-table-sqlite`](https://github.com/remix-run/remix/tree/main/packages/data-table-sqlite) database cannot drive it. This package awaits every client call, which makes it a good fit for remote Turso databases, embedded replicas, and other libSQL deployments.

Requires `@remix-run/data-table@^0.4.0` (Remix v3 `beta.6` or later).

## Features

- **Async libSQL Support**: Works with `@libsql/client` against remote Turso databases, embedded replicas, and local files
- **Full `data-table` API Support**: Queries, relations, writes, and interactive transactions
- **Package-Owned Compiler**: SQL compilation lives in this package, with optional shared pure helpers from `data-table`
- **Multi-Statement Migrations**: `executeScript()` runs `up.sql` / `down.sql` files via libSQL's `executeMultiple()`
- **SQLite Capabilities Enabled By Default**:
  - `returning: true`
  - `savepoints: true`
  - `upsert: true`
  - `transactionalDdl: true`
  - `migrationLock: false`

## Installation

This package is published to [JSR](https://jsr.io/@kuboon/remix-data-table-sqlite-turso). Install it together with the `@libsql/client` peer dependency (`@remix-run/data-table` is pulled in automatically):

```sh
npx jsr add @kuboon/remix-data-table-sqlite-turso
npm i @libsql/client
```

For Deno:

```sh
deno add jsr:@kuboon/remix-data-table-sqlite-turso npm:@libsql/client
```

## Usage

```ts
import { createClient } from '@libsql/client'
import { createTursoDatabase } from '@kuboon/remix-data-table-sqlite-turso'

let client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
})
let db = createTursoDatabase(client)
```

`@libsql/client` is a peer dependency, so install it alongside this package. Import any driver-specific types you need directly from `@libsql/client`; the client type is also re-exported here as `TursoDatabaseClient`.

## Lifecycle

The libSQL client is always **caller-owned**. `@libsql/client` ships several entry points (`@libsql/client`, `@libsql/client/web`, `@libsql/client/sqlite3`) and only your application knows which one its runtime can load, so this package never constructs one. Two consequences:

- `db.close()` is a **no-op**. Close the client yourself at shutdown.
- `db.wipe()` cannot unlink a database file — the client may point at a remote Turso database. It instead drops every user-defined trigger, view, index, and table, suspending foreign key enforcement for the drop and restoring the connection's previous setting. That is the end state `db.reset({ migrations })` needs, so `reset()` works normally.

## Capabilities

`data-table-sqlite-turso` reports this capability set by default:

- `returning: true`
- `savepoints: true`
- `upsert: true`
- `transactionalDdl: true`
- `migrationLock: false`

## Advanced Usage

### Local File Database

`@libsql/client` can open a local SQLite file, which is handy for development and tests:

```ts
import { createClient } from '@libsql/client'
import { createTursoDatabase } from '@kuboon/remix-data-table-sqlite-turso'

let client = createClient({ url: 'file:app.db' })
let db = createTursoDatabase(client)
```

### Synchronous SQLite

If you are running against a synchronous SQLite client (Node's `node:sqlite` or Bun's `bun:sqlite`), use [`data-table-sqlite`](https://github.com/remix-run/remix/tree/main/packages/data-table-sqlite) instead — its `createSqliteDatabase()` also supports config-backed construction, which this package deliberately does not.

## Related Packages

- [`data-table`](https://github.com/remix-run/remix/tree/main/packages/data-table) - Core query/relations API
- [`data-schema`](https://github.com/remix-run/remix/tree/main/packages/data-schema) - Schema parsing and validation
- [`data-table-sqlite`](https://github.com/remix-run/remix/tree/main/packages/data-table-sqlite) - Synchronous SQLite database
- [`data-table-postgres`](https://github.com/remix-run/remix/tree/main/packages/data-table-postgres) - PostgreSQL database
- [`data-table-mysql`](https://github.com/remix-run/remix/tree/main/packages/data-table-mysql) - MySQL database

## License

See [LICENSE](https://github.com/remix-run/remix/blob/main/LICENSE)
