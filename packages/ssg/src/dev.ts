/**
 * `deno run -c deno.json -P=dev jsr:@kuboon/remix-ssg/dev.ts`
 *
 * Serves the site in the current directory, from the same handler the build crawls — so what you
 * see locally is what gets generated, and moving to a real server later is a change of deploy
 * target rather than of code.
 */

import { parseArgs } from '@std/cli/parse-args'

import { assembleSite } from './lib/site/assemble.ts'
import { loadSiteConfig } from './lib/site/load.ts'

if (import.meta.main) {
  let args = parseArgs(Deno.args, {
    string: ['port', 'base', 'root'],
    boolean: ['help'],
    alias: { h: 'help', p: 'port' },
  })

  if (args.help) {
    console.log(`Serve a @kuboon/remix-ssg site.

  deno run -c deno.json -P=dev jsr:@kuboon/remix-ssg/dev.ts [options]

Options:
  -p, --port <n>   Port (default: 8000)
  --base <url>     Deploy URL or path prefix (default: $BASE_URL)
  --root <dir>     Site root (default: the current directory)
  -h, --help       Show this help`)
    Deno.exit(0)
  }

  let { definition, rootDir } = await loadSiteConfig(args.root ?? Deno.cwd())
  let site = await assembleSite(definition, { rootDir, base: args.base, minify: false })

  let port = Number(args.port ?? Deno.env.get('PORT') ?? 8000)
  Deno.serve({ port }, (request) => site.fetch(request))

  console.log(`Dev server: http://localhost:${port}${site.base || '/'}`)
}
