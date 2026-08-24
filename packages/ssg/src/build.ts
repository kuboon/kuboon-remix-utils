/**
 * `deno run -c deno.json -P=build jsr:@kuboon/remix-ssg/build.ts`
 *
 * Builds the site in the current directory into `dist/`, by crawling its `router.ts` — the same
 * module `deno serve router.ts` runs as the dev server.
 *
 * Run it with `-c deno.json`: a remote main module picks up a project's config only when it is
 * named, and both the permission set and `"unstable": ["bundle"]` come from there.
 */

import { parseArgs } from '@std/cli/parse-args'

import { buildSite } from './lib/site/build.ts'
import { loadRouter } from './lib/site/load.ts'

if (import.meta.main) {
  let args = parseArgs(Deno.args, {
    string: ['out', 'root'],
    boolean: ['help'],
    alias: { h: 'help' },
  })

  if (args.help) {
    console.log(`Build a @kuboon/remix-ssg site into static files.

  deno run -c deno.json -P=build jsr:@kuboon/remix-ssg/build.ts [options]

Options:
  --out <dir>    Output directory (default: dist)
  --root <dir>   Site root, the directory holding router.ts (default: the current directory)
  -h, --help     Show this help

The deploy prefix and the entry points come from router.ts, not from here.`)
    Deno.exit(0)
  }

  let { router, rootDir } = await loadRouter(args.root ?? Deno.cwd())
  let stats = await buildSite(router, {
    outDir: args.out ?? `${rootDir}/dist`,
    onFile: (file) => console.log(`  ${file}`),
  })

  console.log(
    `\n✓ Wrote ${stats.pages} page(s) and ${stats.assets} asset(s) to ${stats.outDir}` +
      (stats.base ? ` (base: ${stats.base})` : ''),
  )
}
