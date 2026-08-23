/**
 * `deno run -c deno.json -P=build jsr:@kuboon/remix-ssg/build.ts`
 *
 * Builds the site in the current directory into `dist/`.
 *
 * Run it with `-c deno.json`: the config only reaches a remote main module when it is named
 * explicitly, and both the permission set and `"unstable": ["bundle"]` come from it.
 */

import { parseArgs } from '@std/cli/parse-args'

import { buildSite } from './lib/site/build.ts'

if (import.meta.main) {
  let args = parseArgs(Deno.args, {
    string: ['out', 'base', 'root'],
    boolean: ['help'],
    alias: { h: 'help' },
  })

  if (args.help) {
    console.log(`Build a @kuboon/remix-ssg site into static files.

  deno run -c deno.json -P=build jsr:@kuboon/remix-ssg/build.ts [options]

Options:
  --out <dir>    Output directory, relative to the site root (default: dist)
  --base <url>   Deploy URL or path prefix (default: $BASE_URL)
  --root <dir>   Site root (default: the current directory)
  -h, --help     Show this help`)
    Deno.exit(0)
  }

  let stats = await buildSite({
    rootDir: args.root,
    outDir: args.out,
    base: args.base === undefined ? undefined : basePathOf(args.base),
    onFile: (file) => console.log(`  ${file}`),
  })

  for (let pattern of stats.skipped) {
    console.log(`  (skipped ${pattern} — marked dynamic)`)
  }

  console.log(
    `\n✓ Wrote ${stats.pages} page(s) and ${stats.assets} asset(s) to ${stats.outDir}` +
      (stats.base ? ` (base: ${stats.base})` : ''),
  )
}

/** Accepts either a full URL or a bare path prefix, since deploy workflows pass the former. */
function basePathOf(value: string): string {
  if (value === '') return ''
  if (/^https?:\/\//.test(value)) return new URL(value).pathname.replace(/\/+$/, '')
  return `/${value.replace(/^\/+/, '').replace(/\/+$/, '')}`
}
