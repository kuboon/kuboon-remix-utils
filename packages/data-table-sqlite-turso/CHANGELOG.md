# `data-table-sqlite-turso` CHANGELOG

This is the changelog for [`data-table-sqlite-turso`](https://github.com/kuboon/kuboon-remix-utils/tree/main/packages/data-table-sqlite-turso). It follows [semantic versioning](https://semver.org/).

## 0.2.0

- BREAKING CHANGE: Updated for `@remix-run/data-table@0.4.0` (Remix v3 `beta.6`), which removed the adapter layer. `TursoDatabaseAdapter` and `createTursoDatabaseAdapter()` are gone; use `TursoDatabase` / `createTursoDatabase(client)`, which extend `Database` directly and no longer need `createDatabase()`.

  ```diff
  - import { createDatabase } from '@remix-run/data-table'
  - import { createTursoDatabaseAdapter } from '@kuboon/remix-data-table-sqlite-turso'
  - let db = createDatabase(createTursoDatabaseAdapter(client))
  + import { createTursoDatabase } from '@kuboon/remix-data-table-sqlite-turso'
  + let db = createTursoDatabase(client)
  ```

  The driver (`DatabaseDriver`, formerly `DatabaseAdapter`) is now an internal detail rather than the package's public surface. The libSQL client type is re-exported as `TursoDatabaseClient` for callers that need to name it.

- Implemented the two members `DatabaseDriver` adds over the old `DatabaseAdapter`:
  - `wipe()` drops every user-defined trigger, view, index, and table in the connected database, suspending foreign key enforcement for the drop and restoring the connection's previous setting. The client is caller-supplied and may be remote, so there is no file to unlink — emptying the schema reaches the same end state, which is what `Database.reset()` needs.
  - `close()` is a no-op, safe to call repeatedly: this package never opens a client, so the caller keeps ownership and closes it themselves.

## 0.1.0

- Moved into the `kuboon-remix-utils` repository and switched to a Deno-native package (`deno.json`) published to JSR via the shared `kuboon/workflows` release workflow.
- Annotated `TursoDatabaseAdapter#capabilities` with an explicit `AdapterCapabilities` type so the package publishes with fast types (no `--allow-slow-types`).

## 0.0.0

- Initial release of `@kuboon/remix-data-table-sqlite-turso`, an asynchronous Turso / libSQL adapter for `remix/data-table`, published to JSR.
