/**
 * Executable entry point for the Turso / libSQL database commands.
 *
 * Running this module runs a command and sets the process exit code — it is not meant to be
 * imported. Import {@link runTursoDbCli} from the package root to embed the same commands in your
 * own script.
 *
 * @example
 * ```jsonc
 * // deno.json
 * { "tasks": { "db": "deno run -A jsr:@kuboon/remix-data-table-sqlite-turso/cli" } }
 * ```
 *
 * ```sh
 * deno task db migrate
 * ```
 *
 * @module
 */
import process from 'node:process'

import { runTursoDbCli } from './lib/cli.ts'

process.exitCode = await runTursoDbCli(process.argv.slice(2))
