import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { crawl } from './crawl.ts'
import type { CrawlResult, RouterLike } from './crawl.ts'
import { toOutput } from './output.ts'

/**
 * Writes one {@link CrawlResult} to disk under `outputDir`.
 *
 * The content transform (extension rewriting, HTML vs. script vs. raw bytes) is handled by
 * {@link toOutput}; this function only performs the filesystem write, so it is the Node-specific
 * half of the pipeline. A `204 No Content` response is skipped.
 * @param outputDir Directory to write into.
 * @param result The crawl result to write.
 * @returns The absolute output path written, or `null` when the response was skipped.
 */
export async function writeResult(outputDir: string, result: CrawlResult): Promise<string | null> {
  let output = await toOutput(result)
  if (output == null) {
    return null
  }

  let outputPath = path.join(outputDir, output.path)
  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.writeFile(outputPath, output.content)

  return outputPath
}

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
 * batteries-included, Node-based entry point; use {@link crawl} + {@link toOutput} directly for
 * runtime-agnostic output handling.
 * @param options Prerender options.
 * @returns Counts and the list of files written.
 * @example
 * ```ts
 * import { createRouter } from 'remix/fetch-router'
 * import { prerender } from '@kuboon/remix-ssg/node'
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
