/**
 * The static build: drive the router, write what comes back.
 *
 * The router is the same object `deno serve` serves, so what is built is what a live server would
 * have answered — moving from a static deploy to a real one is a change of deploy target rather
 * than of code.
 */

import * as path from 'node:path'

import { crawl } from '../crawl.ts'
import { toOutput } from '../output.ts'
import { joinBase, normalizeBase, stripBase } from './base.ts'
import { githubPages, outputPathFor } from './host.ts'
import type { SiteRouter } from './load.ts'

/** Options for {@link buildSite}. */
export interface BuildOptions {
  /** Output directory. Relative paths resolve against the current directory. Defaults to `dist`. */
  outDir?: string
  /** Called once per written file. */
  onFile?: (relativePath: string) => void
}

/** What a build produced. */
export interface BuildStats {
  /** HTML pages written. */
  pages: number
  /** Everything else written — chunks, static files. */
  assets: number
  /** Deploy path prefix the site was built for. */
  base: string
  /** Absolute path of the output directory. */
  outDir: string
}

/**
 * Builds a site into static files.
 *
 * Starts from the router's entry points and follows links, so what is reachable is what gets
 * written — including the shared chunks a code-split bundle reaches only through `import`.
 *
 * @param router The site's `router.ts`, already imported
 * @param options Where the output goes
 * @returns What was written
 */
export async function buildSite(
  router: SiteRouter,
  options: BuildOptions = {},
): Promise<BuildStats> {
  let base = normalizeBase(router.base)
  let entryPoints = (router.entryPoints ?? ['/']).map((entry) => joinBase(base, entry))
  let behavior = router.fileServer ?? githubPages()
  let outDir = path.resolve(options.outDir ?? 'dist')

  // The host decides which file answers a URL, so the build writes the file it would reach for
  // first — and the prefix comes off here, because inside the artifact there is no prefix.
  let outputPath = (pathname: string) =>
    outputPathFor(behavior, `/${stripBase(pathname, base)}`).replace(/^\/+/, '')

  await Deno.remove(outDir, { recursive: true }).catch(() => {})

  let pages = 0
  let assets = 0

  for await (let result of crawl(router.default, { paths: entryPoints, outputPath })) {
    let output = await toOutput(result)
    if (output === null) continue

    let relative = output.path
    let destination = path.join(outDir, relative)
    await Deno.mkdir(path.dirname(destination), { recursive: true })
    await Deno.writeFile(
      destination,
      typeof output.content === 'string'
        ? new TextEncoder().encode(output.content)
        : output.content,
    )

    if (relative.endsWith('.html')) pages++
    else assets++
    options.onFile?.(relative)
  }

  return { pages, assets, base, outDir }
}
