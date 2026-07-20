# data-table-sqlite-turso

Turso / libSQL adapter for [`remix/data-table`](https://github.com/remix-run/remix/tree/main/packages/data-table). Use this package when you want `data-table` APIs backed by an asynchronous SQLite client such as [`@libsql/client`](https://www.npmjs.com/package/@libsql/client).

Turso speaks the SQLite dialect but exposes an async, promise-based client, so the synchronous [`data-table-sqlite`](https://github.com/remix-run/remix/tree/main/packages/data-table-sqlite) adapter cannot drive it. This adapter awaits every driver call, which makes it a good fit for remote Turso databases, embedded replicas, and other libSQL deployments.

## Features

- **Async libSQL Support**: Works with `@libsql/client` against remote Turso databases, embedded replicas, and local files
- **Full `data-table` API Support**: Queries, relations, writes, and interactive transactions
- **Adapter-Owned Compiler**: SQL compilation lives in this adapter, with optional shared pure helpers from `data-table`
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
import { createDatabase } from '@remix-run/data-table'
import { createTursoDatabaseAdapter } from '@kuboon/remix-data-table-sqlite-turso'

let client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
})
let db = createDatabase(createTursoDatabaseAdapter(client))
```

`@libsql/client` is a peer dependency, so install it alongside this package. Import any driver-specific types you need directly from `@libsql/client`.

## Adapter Capabilities

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
import { createDatabase } from '@remix-run/data-table'
import { createTursoDatabaseAdapter } from '@kuboon/remix-data-table-sqlite-turso'

let client = createClient({ url: 'file:app.db' })
let db = createDatabase(createTursoDatabaseAdapter(client))
```

### Synchronous SQLite

If you are running against a synchronous SQLite client (Node's `node:sqlite` or Bun's `bun:sqlite`), use [`data-table-sqlite`](https://github.com/remix-run/remix/tree/main/packages/data-table-sqlite) instead.

## Related Packages

- [`data-table`](https://github.com/remix-run/remix/tree/main/packages/data-table) - Core query/relations API
- [`data-schema`](https://github.com/remix-run/remix/tree/main/packages/data-schema) - Schema parsing and validation
- [`data-table-sqlite`](https://github.com/remix-run/remix/tree/main/packages/data-table-sqlite) - Synchronous SQLite adapter
- [`data-table-postgres`](https://github.com/remix-run/remix/tree/main/packages/data-table-postgres) - PostgreSQL adapter
- [`data-table-mysql`](https://github.com/remix-run/remix/tree/main/packages/data-table-mysql) - MySQL adapter

## License

See [LICENSE](https://github.com/remix-run/remix/blob/main/LICENSE)
