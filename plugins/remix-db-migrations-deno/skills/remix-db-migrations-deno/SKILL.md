---
name: remix-db-migrations-deno
description: >-
  Database migrations for a Deno + Remix v3 (`@remix-run/data-table`) project
  are run by the Remix CLI's `remix db` commands (migrate / status / seed /
  reset / wipe), configured through a `remix.json` `db` section, with migrations
  as `YYYYMMDDHHmmss_name/up.sql` + `down.sql` directories. Use this skill
  whenever adding or changing a data-table table or column, creating a
  migration, seeding or resetting a dev database, wiring a `deno task` for
  migrations, or debugging `remix db` under Deno — including "Failed resolving
  binary export … did not have a bin property", `Could not find package 'pg'`,
  `Invalid migration directory name`, `Database configuration is missing from
  remix.json`, or `remix db` refusing to roll back. Also covers Turso / libSQL,
  which `remix.json` cannot describe at all (`Expected one of: sqlite, postgres,
  mysql at db.adapter.type`): there, run
  `jsr:@kuboon/remix-data-table-sqlite-turso/cli` instead of `remix db`. Covers
  the Deno-specific setup that the Node-oriented docs do not.
---

# `remix db` migrations from Deno

Verified against `remix@3.0.0-beta.6` (`@remix-run/cli@0.4.0`,
`@remix-run/data-table@0.4.0`, `@remix-run/data-table-sqlite@0.6.0`,
`@kuboon/remix-data-table-sqlite-turso@0.3.0`) on **Deno 2.9.4**. The whole
`remix db` command set runs under Deno unmodified — the friction is entirely in
how you invoke it and which packages Deno resolves. Turso / libSQL is the one
backend `remix db` cannot reach at all; it has its own command, covered below.

## Setup

Three files. `deno.json` pins the CLI and exposes it as a task:

```jsonc
{
  "nodeModulesDir": "auto",
  "imports": {
    "remix": "npm:remix@3.0.0-beta.6",
    "@remix-run/data-table": "npm:@remix-run/data-table@^0.4.0",
    "@remix-run/data-table-sqlite": "npm:@remix-run/data-table-sqlite@^0.6.0"
  },
  "tasks": { "db": "remix db" }
}
```

`nodeModulesDir: "auto"` + `deno install` puts the `remix` executable in
`node_modules/.bin`, which `deno task` has on its PATH — so the version is
pinned **once**, in `imports`. Without a node_modules directory the task must
spell it out: `"db": "deno run -A npm:remix@3.0.0-beta.6 db"` (that works too,
straight from the global cache).

`remix.json` at the project root configures the database (JSONC — comments are
fine):

```jsonc
{
  "db": {
    // sqlite for local dev; APP_DB wins when set
    "adapter": { "type": "sqlite", "filename": { "env": "APP_DB", "default": "./data/app.db" } },
    "migrations": { "directory": "./db/migrations" },
    "seed": "./db/seed.sql"
  }
}
```

And the migrations themselves are **directories of plain SQL**:

```
db/migrations/
  20260101000000_create_users/
    up.sql          # required
    down.sql        # optional — omit for an irreversible migration
  20260102000000_add_email/
    up.sql
```

`YYYYMMDDHHmmss_name` — exactly 14 digits, an underscore, then the name. Any
other basename is a hard error (`Invalid migration directory name "oops_bad".
Expected format YYYYMMDDHHmmss_name`), and it fails the whole command, not just
that entry. **There is no generator**: no `remix db new`, no schema diffing
against your `table()` definitions. Create the directory and write the SQL by
hand, keeping it in step with the data-table schema in code.

## The commands

```bash
deno task db migrate                       # apply pending migrations
deno task db migrate --to 20260101000000   # stop after this one
deno task db status                        # id, name, applied|pending
deno task db seed                          # run the SQL seed file
deno task db reset --force                 # wipe + migrate + seed
deno task db wipe --force                  # destroy the database
```

`wipe` and `reset` refuse to run without `--force` and print the help text
instead. Flags: `--migrations <path>`, `--seed <path>`, `--journal-table <name>`,
`--connection-env <name>`, `--to <migration>` (migrate only).

`migrate` prints `applied <id>_<name>` per migration, or `no pending
migrations`. Applied migrations are journaled in a table named
`data_table_migrations` unless `journalTable` says otherwise.

### `remix db` cannot roll back

`--to` only **bounds forward progress**. Pointing it at an already-applied
migration prints `no pending migrations` and changes nothing — it does not
revert. The CLI never passes a direction, and there is no `--down` / `--step`
flag; `down.sql` is reachable only from code or from `reset`.

So when you need a rollback in a Deno project, write it yourself — this is
verified working:

```ts
// db/rollback.ts — deno run -A db/rollback.ts
import { createSqliteDatabase } from '@remix-run/data-table-sqlite'
import { loadMigrations } from 'remix/data-table/migrations/node'

const db = createSqliteDatabase({ filename: './data/app.db' })
const migrations = await loadMigrations('./db/migrations')
const result = await db.migrate(migrations, { direction: 'down', step: 1 })
console.log('reverted:', result.reverted.map((m) => `${m.id}_${m.name}`))
await db.close()
```

`db.migrate()` takes `direction: "up" | "down"` (default `up`), mutually
exclusive `to` / `step` bounds, and `dryRun` — all of which the CLI leaves on
the table. `loadMigrations()` / `loadSeed()` are named `…/migrations/node` but
use only `node:fs` and `node:path`, so they run in Deno as-is.

On Turso/libSQL you do not need this script: that package's CLI has a `rollback`
command built on the same call. See below.

## Turso / libSQL: use the package's own CLI

`@kuboon/remix-data-table-sqlite-turso` backs data-table with an **async**
libSQL client (`@libsql/client`) — remote Turso, embedded replicas, or a local
`file:` database. The stock `data-table-sqlite` database is synchronous and
cannot drive that client, so this package is the Turso path.

`remix db` is not. The Remix CLI builds its database from a fixed `remix.json`
adapter list, and a fourth type is simply rejected:

```
Error [RMX_INVALID_CONFIG] Invalid Remix configuration
remix.json:1:32: Expected one of: sqlite, postgres, mysql at db.adapter.type
```

There is no plugin hook. **Do not hand-write a `runRemixDb()` entry point for
this** — the package ships one, as its `/cli` export. Point the task at it:

```jsonc
// deno.json
{
  "imports": {
    "@kuboon/remix-data-table-sqlite-turso": "jsr:@kuboon/remix-data-table-sqlite-turso@^0.3.0"
  },
  "tasks": { "db": "deno run -A jsr:@kuboon/remix-data-table-sqlite-turso/cli" }
}
```

```bash
deno task db migrate                       # apply pending migrations
deno task db migrate --to 20260101000000   # stop after this one
deno task db rollback --step 1             # run down.sql — remix db has no flag for this
deno task db status                        # id, name, applied | pending | drifted | missing
deno task db seed
deno task db reset --force                 # wipe + migrate + seed
deno task db wipe --force
deno task db --help
```

Every command is handed to the same `runRemixDb()` the Remix CLI calls, so
migration directories, the `data_table_migrations` journal, and the printed
output are identical to `remix db`'s. `rollback` is the addition, and
`--dry-run` works on both it and `migrate`.

Connection and paths come from flags and the environment — **`remix.json` is
never read**, so keep a `db` section only if some other tool wants it:

| Option                    | Default                                        |
| ------------------------- | ---------------------------------------------- |
| `--url <url>`             | `$TURSO_DATABASE_URL`, else `file:data/app.db` |
| `--auth-token <token>`    | `$TURSO_AUTH_TOKEN`                            |
| `--connection-env <name>` | reads the URL from a different variable        |
| `--migrations <path>`     | `./db/migrations`                              |
| `--seed <path>`           | `./db/seed.sql`                                |
| `--journal-table <name>`  | `data_table_migrations`                        |

`rollback` takes `--step <n>` (default `1`) or `--to <migration>`, which reverts
back through that migration **inclusive** — the opposite end from `migrate --to`,
which is an upper bound. `reset` and `wipe` refuse to run without `--force`.

Two Turso-specific behaviors worth knowing, both handled by the CLI:

- **libSQL will not create the parent directory of a `file:` database** — it
  fails with `ConnectionFailed("Unable to open connection to local database
  data/app.db: 14")` where the Remix CLI would have `mkdir`ed it. The CLI does
  the `mkdir`; a hand-rolled script has to.
- **`db.wipe()` drops every user table, view, index, and trigger** rather than
  unlinking a file, since the target may be remote. `reset` therefore behaves
  normally.

Only reach for your own entry point when you need something before the command
runs — loading `.env`, or building the client from `@libsql/client/web`. Call the
same function the executable does rather than reassembling it:

```ts
// db/cli.ts — deno task db migrate
import { runTursoDbCli } from '@kuboon/remix-data-table-sqlite-turso'

Deno.exit(await runTursoDbCli(Deno.args))
```

`runTursoDbCli(argv, options)` takes `env` and a `createClient` override for
exactly that. Note that `createTursoDatabase()` keeps the client **caller-owned**
(`db.close()` is a documented no-op), but the CLI opens the client itself and
always closes it — a process running one command is its own caller.

**Deno permissions are wider here than for sqlite.** `@libsql/client` loads a
native module, so the minimum is `--allow-read --allow-write --allow-env
--allow-sys --allow-ffi`; without `--allow-sys` it fails on `cpus` while
detecting glibc, and without `--allow-env` on `LIBSQL_JS_DEV`. A remote
`libsql://` URL adds `--allow-net`. `-A` is the pragmatic choice for a local task.

Do **not** work around the config limitation by pointing `remix db`'s `sqlite`
adapter at the same local `file:` database. It appears to work — same dialect,
same journal table — but it only ever works for the local file, so staging and
production still need this command, and you end up with two migration paths that
can disagree.

## Deno traps

**`npm:remix` without a version is Remix v2.** On npm, `remix@latest` is
`2.17.5`; v3 sits behind the `next` tag. An unversioned invocation resolves the
v2 package, which has no `bin`, and dies with a message that looks like a Deno
bug:

```
error: Failed resolving binary export. '…/node_modules/.deno/remix@2.17.5/node_modules/remix/package.json'
did not have a bin property with a string or non-empty object value
```

Always write `npm:remix@3.0.0-beta.6`, or go through the `imports` entry.

**SQLite needs nothing; Postgres and MySQL need a driver.** The sqlite database
is built on `process.getBuiltinModule('node:sqlite')`, which Deno provides — no
extra dependency, no `--allow-ffi`. The other two dialects load `pg` / `mysql2`
as _optional_ peer dependencies, which Deno does not pull in for you:

```
Could not find package 'pg' from referrer
file:///…/@remix-run/data-table-postgres/dist/lib/driver.js
```

Add the driver to `imports` explicitly (`"pg": "npm:pg@^8.16.3"` or
`"mysql2": "npm:mysql2@^3.15.3"`).

**Permissions.** `-A` is the pragmatic choice for a local task. The minimum for
sqlite is `--allow-read --allow-write --allow-env --allow-sys`; leaving out
`--allow-sys` fails deep inside Node fs compat with `Requires sys access to
"uid"`. Network-backed dialects add `--allow-net`.

**Two path bases.** Paths inside `remix.json` resolve against the **config
file's** directory; `--migrations`, `--seed`, and a sqlite `--connection-env`
value resolve against the **current working directory**. So `deno task db
status` gives the same answer from a subdirectory (the CLI walks up to find
`remix.json`), but a relative `--migrations` does not.

**Renaming `journalTable` orphans the history.** The journal is where "applied"
lives; point the CLI at a different table and every migration reads as `pending`
again. The next `migrate` then replays them into a database that already has the
objects:

```
Error [RMX_INTERNAL_ERROR] Unexpected Remix CLI error
table users already exists in create table users (…)
```

Choose the journal table before the first migration, or migrate the journal
rows yourself.

**A missing `db` section is a clear error**, not a silent default:
`Database configuration is missing from …/remix.json.` Add it rather than
passing every path as a flag.

## Adapter configuration

Any string value below may instead be `{ "env": "VAR", "default": "…" }` — an
env var that is set but empty falls back to `default`.

```jsonc
{ "type": "sqlite",   "filename": "./data/app.db", "foreignKeys": true, "busyTimeout": 5000 }
{ "type": "postgres", "connectionString": { "env": "DATABASE_URL" }, "maintenanceDatabase": "postgres", "template": "template0" }
{ "type": "mysql",    "uri": { "env": "MYSQL_URL" }, "characterSet": "utf8mb4", "collation": "utf8mb4_unicode_ci" }
```

The parent directory of a sqlite `filename` is created automatically, so
`./data/app.db` works on a fresh checkout with no `data/` directory.

`--connection-env <name>` overrides the connection for a single invocation
without touching `remix.json` — handy for pointing a migration at a staging
database from CI.

## Checklist

- [ ] `remix` pinned to an explicit `3.0.0-beta.x` version (never bare `npm:remix`).
- [ ] `remix.json` has a `db.adapter`, and `db.migrations.directory` for
      migrate/status/reset.
- [ ] Migration directories named `YYYYMMDDHHmmss_name` with an `up.sql`.
- [ ] `down.sql` written whenever the change is reversible — `remix db` won't use
      it, but `reset`, a rollback script, and the Turso CLI's `rollback` will.
- [ ] Non-sqlite dialects have `pg` / `mysql2` in `deno.json` imports.
- [ ] On Turso/libSQL: the `db` task runs
      `jsr:@kuboon/remix-data-table-sqlite-turso/cli`, not `remix db` and not a
      hand-written `runRemixDb()` script.
- [ ] `deno task db migrate` and `deno task db status` both run clean from a
      fresh checkout.
