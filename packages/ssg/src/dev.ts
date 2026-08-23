/**
 * `deno run -c deno.json -P=dev jsr:@kuboon/remix-ssg/dev.ts`
 *
 * Serves the site in the current directory, from the same router the build crawls — so what you
 * see locally is what gets generated.
 *
 * Pages marked `dynamic` render normally here; only the static build skips them. That is the
 * migration path: when a page starts needing the request, it keeps working the moment this router
 * is served for real instead of prerendered.
 */

import { parseArgs } from '@std/cli/parse-args'

import { createSite } from './lib/site/create.tsx'
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

  let { config, rootDir } = await loadSiteConfig(args.root ?? Deno.cwd())
  let site = await createSite(config, {
    rootDir,
    mode: 'serve',
    base: args.base === undefined ? undefined : basePathOf(args.base),
  })

  let port = Number(args.port ?? Deno.env.get('PORT') ?? 8000)
  Deno.serve({ port }, (request) => site.router.fetch(request))

  console.log(`Dev server: http://localhost:${port}${site.base}/`)
}

function basePathOf(value: string): string {
  if (value === '') return ''
  if (/^https?:\/\//.test(value)) return new URL(value).pathname.replace(/\/+$/, '')
  return `/${value.replace(/^\/+/, '').replace(/\/+$/, '')}`
}
