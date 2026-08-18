import * as assert from '@remix-run/assert'
import { describe, it } from '@std/testing/bdd'

import { parseTursoDbArgs, runTursoDbCli } from './cli.ts'

const CREATE_USERS = 'create table users (id integer primary key, name text not null);\n'
const DROP_USERS = 'drop table users;\n'
const ADD_EMAIL = 'alter table users add column email text;\n'
const DROP_EMAIL = 'alter table users drop column email;\n'
const SEED = "insert or ignore into users (id, name) values (1, 'kuboon');\n"

type Fixture = {
  directory: string
  url: string
  migrations: string
  seed: string
}

async function writeMigration(directory: string, name: string, up: string, down?: string) {
  let path = `${directory}/${name}`
  await Deno.mkdir(path, { recursive: true })
  await Deno.writeTextFile(`${path}/up.sql`, up)
  if (down !== undefined) {
    await Deno.writeTextFile(`${path}/down.sql`, down)
  }
}

async function createFixture(): Promise<Fixture> {
  let directory = await Deno.makeTempDir({ prefix: 'turso-cli-' })
  let migrations = `${directory}/migrations`
  let seed = `${directory}/seed.sql`

  await writeMigration(migrations, '20260101000000_create_users', CREATE_USERS, DROP_USERS)
  await writeMigration(migrations, '20260102000000_add_email', ADD_EMAIL, DROP_EMAIL)
  await Deno.writeTextFile(seed, SEED)

  return { directory, url: `file:${directory}/app.db`, migrations, seed }
}

/**
 * Runs the CLI and collects what it printed.
 *
 * Results come from `runRemixDb()`, which writes to the console directly, so the console is the
 * only place to read them from.
 */
async function capture(run: () => Promise<number>) {
  let output: string[] = []
  let errors: string[] = []
  let log = console.log
  let error = console.error

  console.log = (...args: unknown[]) => output.push(args.join(' '))
  console.error = (...args: unknown[]) => errors.push(args.join(' '))

  try {
    return { code: await run(), output, errors }
  } finally {
    console.log = log
    console.error = error
  }
}

/** Runs a fixture-backed command. Fixture defaults come first so the caller's flags win. */
function run(fixture: Fixture, argv: string[]) {
  let [command, ...rest] = argv

  return capture(() =>
    runTursoDbCli(
      [
        command,
        '--url',
        fixture.url,
        '--migrations',
        fixture.migrations,
        '--seed',
        fixture.seed,
        ...rest,
      ],
      { env: {} },
    )
  )
}

describe('parseTursoDbArgs', () => {
  it('defaults the migrations directory, seed file, and step', () => {
    let invocation = parseTursoDbArgs(['migrate'])

    assert.equal(invocation.command, 'migrate')
    assert.equal(invocation.migrations, './db/migrations')
    assert.equal(invocation.seed, './db/seed.sql')
    assert.equal(invocation.seedExplicit, false)
    assert.equal(invocation.step, undefined)
    assert.equal(invocation.dryRun, false)
  })

  it('rejects an unknown command, an unknown option, and a value-less option', () => {
    assert.throws(() => parseTursoDbArgs(['nuke']), /Unknown database command: nuke/)
    assert.throws(() => parseTursoDbArgs(['migrate', '--nope']), /Unknown option: --nope/)
    assert.throws(() => parseTursoDbArgs(['migrate', '--to']), /--to requires a value/)
  })

  it('requires --force for the destructive commands', () => {
    assert.throws(() => parseTursoDbArgs(['wipe']), /"wipe" requires --force/)
    assert.throws(() => parseTursoDbArgs(['reset']), /"reset" requires --force/)
    assert.equal(parseTursoDbArgs(['wipe', '--force']).force, true)
  })

  it('keeps --to and --step on the commands that bound migrations', () => {
    assert.throws(
      () => parseTursoDbArgs(['rollback', '--to', '20260101000000', '--step', '2']),
      /mutually exclusive/,
    )
    assert.throws(() => parseTursoDbArgs(['migrate', '--step', '2']), /only available on rollback/)
    assert.throws(() => parseTursoDbArgs(['status', '--to', '1']), /only available on migrate/)
    assert.throws(() => parseTursoDbArgs(['status', '--dry-run']), /only available on migrate/)
    assert.throws(() => parseTursoDbArgs(['rollback', '--step', '0']), /positive integer/)
  })
})

describe('runTursoDbCli', () => {
  it('migrates, reports status, seeds, and rolls back a libSQL database', async () => {
    let fixture = await createFixture()

    let pending = await run(fixture, ['status'])
    assert.equal(pending.code, 0)
    assert.deepEqual(pending.output, [
      '20260101000000 create_users pending',
      '20260102000000 add_email pending',
    ])

    let dryRun = await run(fixture, ['migrate', '--dry-run'])
    assert.deepEqual(dryRun.output, [
      'would apply 20260101000000_create_users',
      'would apply 20260102000000_add_email',
    ])

    // --dry-run changed nothing, so the migrations are still pending.
    let stillPending = await run(fixture, ['status'])
    assert.deepEqual(stillPending.output, [
      '20260101000000 create_users pending',
      '20260102000000 add_email pending',
    ])

    let migrated = await run(fixture, ['migrate'])
    assert.equal(migrated.code, 0)
    assert.deepEqual(migrated.output, [
      'applied 20260101000000_create_users',
      'applied 20260102000000_add_email',
    ])

    let again = await run(fixture, ['migrate'])
    assert.deepEqual(again.output, ['no pending migrations'])

    let seeded = await run(fixture, ['seed'])
    assert.equal(seeded.code, 0)
    assert.deepEqual(seeded.output, ['database seeded'])

    let rolledBack = await run(fixture, ['rollback'])
    assert.equal(rolledBack.code, 0)
    assert.deepEqual(rolledBack.output, ['reverted 20260102000000_add_email'])

    let mixed = await run(fixture, ['status'])
    assert.deepEqual(mixed.output, [
      '20260101000000 create_users applied',
      '20260102000000 add_email pending',
    ])

    await Deno.remove(fixture.directory, { recursive: true })
  })

  it('reverts back through --to, inclusive, and stops when nothing is applied', async () => {
    let fixture = await createFixture()

    await run(fixture, ['migrate'])

    let reverted = await run(fixture, ['rollback', '--to', '20260101000000'])
    assert.deepEqual(reverted.output, [
      'reverted 20260102000000_add_email',
      'reverted 20260101000000_create_users',
    ])

    let empty = await run(fixture, ['rollback'])
    assert.deepEqual(empty.output, ['no migrations to revert'])

    await Deno.remove(fixture.directory, { recursive: true })
  })

  it('wipes and resets only with --force, and reset re-seeds', async () => {
    let fixture = await createFixture()

    let refused = await run(fixture, ['wipe'])
    assert.equal(refused.code, 1)
    assert.equal(refused.output.length, 0)
    assert.match(refused.errors[0], /"wipe" requires --force/)

    let reset = await run(fixture, ['reset', '--force'])
    assert.equal(reset.code, 0)
    assert.deepEqual(reset.output, ['database reset'])

    let applied = await run(fixture, ['status'])
    assert.deepEqual(applied.output, [
      '20260101000000 create_users applied',
      '20260102000000 add_email applied',
    ])

    let wiped = await run(fixture, ['wipe', '--force'])
    assert.equal(wiped.code, 0)
    assert.deepEqual(wiped.output, ['database wiped'])

    // wipe drops the journal table too, so everything reads pending again.
    let afterWipe = await run(fixture, ['status'])
    assert.deepEqual(afterWipe.output, [
      '20260101000000 create_users pending',
      '20260102000000 add_email pending',
    ])

    await Deno.remove(fixture.directory, { recursive: true })
  })

  it('creates the parent directory of a file: URL, which libSQL will not', async () => {
    let fixture = await createFixture()
    let nested = `${fixture.directory}/nested/deeper`

    let { code } = await capture(() =>
      runTursoDbCli(
        ['migrate', '--url', `file:${nested}/app.db`, '--migrations', fixture.migrations],
        { env: {} },
      )
    )

    assert.equal(code, 0)
    assert.equal((await Deno.stat(`${nested}/app.db`)).isFile, true)

    await Deno.remove(fixture.directory, { recursive: true })
  })

  it('reads the connection from the environment, and reports a missing variable', async () => {
    let fixture = await createFixture()
    let seen: { url: string; authToken?: string }[] = []

    let connected = await capture(() =>
      runTursoDbCli(['status', '--migrations', fixture.migrations], {
        env: { TURSO_DATABASE_URL: fixture.url, TURSO_AUTH_TOKEN: 'token' },
        createClient: (config) => {
          seen.push(config)
          return { close() {} } as never
        },
      })
    )

    assert.equal(connected.code, 1) // the stub client cannot execute anything
    assert.deepEqual(seen, [{ url: fixture.url, authToken: 'token' }])

    let missing = await capture(() =>
      runTursoDbCli(['status', '--connection-env', 'NOT_SET_URL'], { env: {} })
    )

    assert.equal(missing.code, 1)
    assert.match(missing.errors[0], /NOT_SET_URL is not set/)

    await Deno.remove(fixture.directory, { recursive: true })
  })

  it('explains a missing migrations directory and a missing seed file', async () => {
    let fixture = await createFixture()

    let migrations = await run(fixture, ['status', '--migrations', `${fixture.directory}/nope`])
    assert.equal(migrations.code, 1)
    assert.match(migrations.errors[0], /Migration directory not found/)

    let seed = await run(fixture, ['seed', '--seed', `${fixture.directory}/nope.sql`])
    assert.equal(seed.code, 1)
    assert.match(seed.errors[0], /Seed file not found/)

    // reset treats a missing *default* seed file as "nothing to seed", the way remix db reset
    // does with no db.seed configured. ./db/seed.sql does not exist in this repository.
    let reset = await capture(() =>
      runTursoDbCli(
        ['reset', '--force', '--url', fixture.url, '--migrations', fixture.migrations],
        { env: {} },
      )
    )
    assert.equal(reset.code, 0)
    assert.deepEqual(reset.output, ['database reset'])

    await Deno.remove(fixture.directory, { recursive: true })
  })

  it('prints help on --help and on a bare invocation', async () => {
    let help = await capture(() => runTursoDbCli(['--help'], { env: {} }))
    assert.equal(help.code, 0)
    assert.match(help.output[0], /Manage a Turso \/ libSQL database/)

    let bare = await capture(() => runTursoDbCli([], { env: {} }))
    assert.equal(bare.code, 1)
    assert.match(bare.output[0], /Manage a Turso \/ libSQL database/)
  })
})
