/**
 * The static build: drive the router, write what comes back.
 *
 * The base path is the whole reason this is not just `prerender`. Under a sub-path deploy every
 * route and link carries the prefix, but the files still have to land at the output root — so each
 * output path gets the prefix stripped back off on the way to disk.
 */

import * as path from 'node:path'

import { crawl } from '../crawl.ts'
import { toOutput } from '../output.ts'
import { createSite } from './create.tsx'
import { loadSiteConfig } from './load.ts'

/** Options for {@link buildSite}. */
export interface BuildOptions {
  /** The site root. Defaults to `Deno.cwd()`. */
  rootDir?: string
  /** Output directory, relative to the root. Defaults to `dist`. */
  outDir?: string
  /** Deploy path prefix. Defaults to `BASE_URL`'s pathname. */
  base?: string
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
  /** Route patterns skipped because they are marked `dynamic`. */
  skipped: string[]
  /** Absolute path of the output directory. */
  outDir: string
}

/**
 * Builds a site into static files.
 *
 * @param options Where the site is and where the output goes
 * @returns What was written
 */
export async function buildSite(options: BuildOptions = {}): Promise<BuildStats> {
  let { config, rootDir } = await loadSiteConfig(options.rootDir ?? Deno.cwd())
  let site = await createSite(config, { rootDir, mode: 'static', base: options.base })
  let outDir = path.resolve(rootDir, options.outDir ?? 'dist')

  await Deno.remove(outDir, { recursive: true }).catch(() => {})

  let pages = 0
  let assets = 0

  for await (let result of crawl(site.router, { paths: site.seeds })) {
    let output = await toOutput(result)
    if (output === null) continue // 204: a dynamic page, skipped on purpose

    let relative = stripBase(output.path, site.base)
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

  return { pages, assets, base: site.base, skipped: site.skipped, outDir }
}

/** Drops the deploy prefix from an output path, so files land at the output root. */
function stripBase(outputPath: string, base: string): string {
  let relative = outputPath.replace(/^\/+/, '')
  if (base === '') return relative

  let prefix = `${base.replace(/^\//, '')}/`
  return relative.startsWith(prefix) ? relative.slice(prefix.length) : relative
}
