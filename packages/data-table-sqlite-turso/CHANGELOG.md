# `data-table-sqlite-turso` CHANGELOG

This is the changelog for [`data-table-sqlite-turso`](https://github.com/kuboon/kuboon-remix-utils/tree/main/packages/data-table-sqlite-turso). It follows [semantic versioning](https://semver.org/).

## 0.3.1

- `@remix-run/data-table` 0.4.0 → 0.5.0, the `remix@3.0.0-rc.1` set. The release is additive for a dialect package: `DatabaseDriver` is byte-for-byte unchanged, `index.d.ts` exports the same surface, and the two files that moved add a `rollback` command to the CLI options union and widen `and`/`or` to take object shorthand alongside predicates. Nothing here needed changing.

## 0.3.0

- Added a migration CLI, exported as `./cli`, because `remix db` cannot drive this database: the Remix CLI builds its database from `remix.json`'s `db.adapter`, whose `type` is a closed set (`Expected one of: sqlite, postgres, mysql at db.adapter.type`) with no plugin hook.

  ```jsonc
  // deno.json
  { "tasks": { "db": "deno run -A jsr:@kuboon/remix-data-table-sqlite-turso/cli" } }
  ```

  ```sh
  deno task db migrate | rollback | status | seed | reset --force | wipe --force
  ```

  Each command is handed to `runRemixDb()` from `@remix-run/data-table` — the same function the Remix CLI calls — so migration directories, the `data_table_migrations` journal, and the printed output are identical to `remix db`. Connection and paths come from flags and the environment (`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `--url`, `--migrations`, `--seed`, `--journal-table`, `--connection-env`) rather than from `remix.json`, which is never read.

- `rollback` runs `down.sql`, which `remix db` cannot: its `--to` only bounds forward progress, and there is no `--down` or `--step`. Takes `--step <n>` (default `1`) or `--to <migration>` (inclusive), plus `--dry-run`, which `migrate` accepts too.

- Exported `runTursoDbCli()` and `parseTursoDbArgs()` from the package root, for wiring the same commands into a script that loads `.env` first or builds its client from a different `@libsql/client` entry point. The CLI opens the client itself and always closes it — the library's caller-owned rule applies to `createTursoDatabase()`, not to a process whose whole job is one command.

- Repository housekeeping: the test tasks and CI now pass `--allow-sys --allow-ffi`, which `@libsql/client`'s native module requires under Deno.

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
