import * as fs from 'node:fs/promises'
import { crawl } from './crawl.ts'
import type { CrawlResult, RouterLike } from './crawl.ts'
import { writeResult } from './write.ts'

/**
 * Options for {@link prerender}.
 */
export interface PrerenderOptions {
  /** The router (or any `fetch`-shaped object) to render. */
  router: RouterLike
  /** Directory to write the static site into. */
  outDir: string
  /** Seed pathnames to start crawling from. Defaults to `['/']`. */
  paths?: string[]
  /** Directory of static files (favicons, images, …) copied into `outDir` before crawling. */
  publicDir?: string
  /** Follow links discovered in rendered HTML. Defaults to `true`. */
  spider?: boolean
  /** Number of concurrent in-flight requests. Defaults to `1`. */
  concurrency?: number
  /** Return `true` to crawl a page's links even when it is marked `nofollow`. */
  ignorePageNofollow?: (pathname: string) => boolean
  /** Called after each result is written (`outputPath` is `null` when the response was skipped). */
  onResult?: (result: CrawlResult, outputPath: string | null) => void
}

/**
 * Summary of a {@link prerender} run.
 */
export interface PrerenderStats {
  /** Number of HTML pages written. */
  pages: number
  /** Number of non-HTML assets written. */
  assets: number
  /** Absolute paths of every file written. */
  files: string[]
}

/**
 * Statically renders a site by crawling `router` from the seed `paths` and writing every response
 * to `outDir` (HTML pages as `<pathname>/index.html`, assets under their URL path). This is the
 * batteries-included entry point; use {@link crawl} directly for custom output handling.
 * @param options Prerender options.
 * @returns Counts and the list of files written.
 * @example
 * ```ts
 * import { createRouter } from 'remix/fetch-router'
 * import { prerender } from '@kuboon/remix-ssg'
 *
 * let router = createRouter()
 * // ...map routes...
 * await prerender({ router, outDir: 'build/site', paths: ['/'] })
 * ```
 */
export async function prerender(options: PrerenderOptions): Promise<PrerenderStats> {
  let {
    router,
    outDir,
    paths = ['/'],
    publicDir,
    spider,
    concurrency,
    ignorePageNofollow,
    onResult,
  } = options

  if (publicDir) {
    await fs.cp(publicDir, outDir, { recursive: true })
  }

  let stats: PrerenderStats = { pages: 0, assets: 0, files: [] }

  for await (
    let result of crawl(router, {
      paths,
      spider,
      concurrency,
      ignorePageNofollow,
    })
  ) {
    let outputPath = await writeResult(outDir, result)
    onResult?.(result, outputPath)

    if (outputPath == null) {
      continue
    }

    stats.files.push(outputPath)
    if (result.filepath.endsWith('.html')) {
      stats.pages++
    } else {
      stats.assets++
    }
  }

  return stats
}
