/**
 * Finding and loading a site's router.
 *
 * The CLI runs as a remote module against whatever directory it was started in, so this is the one
 * bridge from "somewhere on JSR" to "this project" — and deliberately the only one. Everything the
 * site declares, it declares by writing `router.ts`, which is an ordinary module: `deno serve`
 * serves it and the build crawls it.
 */

import * as path from 'node:path'

/**
 * What the build reads from a site's `router.ts`.
 *
 * Only the default export is required. It is what `deno serve router.ts` serves, which is why the
 * dev server needs nothing from this package.
 *
 * @example
 * ```ts
 * // router.ts
 * export const base = normalizeBase(Deno.env.get('BASE_URL'))
 * export const entryPoints = ['/', '/feed.xml']
 * export default compose(pages, static_, islands)
 * ```
 */
export interface SiteRouter {
  /** The handler. Served by `deno serve`, crawled by the build. */
  default: { fetch(request: Request): Promise<Response> | Response }
  /**
   * Deploy path prefix. Defaults to `''`.
   *
   * Every URL the site emits carries it; no built file does — so the build strips it back off on
   * the way to disk.
   */
  base?: string
  /**
   * Where the crawl starts, before the prefix is applied. Defaults to `['/']`.
   *
   * The crawl follows links from here, so what is reachable is what gets built. A page nothing
   * links to belongs in this list or it is not part of the site.
   */
  entryPoints?: readonly string[]
}

/** Router file names tried, in order. */
const ROUTER_NAMES = ['router.ts', 'router.tsx', 'router.js']

/**
 * Loads `router.ts` from a directory.
 *
 * @param rootDir Directory to look in, usually `Deno.cwd()`
 * @returns The module and the root it was found in
 */
export async function loadRouter(
  rootDir: string,
): Promise<{ router: SiteRouter; rootDir: string }> {
  let resolved = path.resolve(rootDir)

  for (let name of ROUTER_NAMES) {
    let filePath = path.join(resolved, name)
    try {
      await Deno.stat(filePath)
    } catch {
      continue
    }

    let url = new URL('file://')
    url.pathname = filePath.split('/').map(encodeURIComponent).join('/')
    let router = await import(url.href) as SiteRouter

    if (typeof router.default?.fetch !== 'function') {
      throw new Error(
        `"${filePath}" must default-export something with a fetch method — ` +
          `what compose(...) returns, and what \`deno serve\` serves.`,
      )
    }

    return { router, rootDir: resolved }
  }

  throw new Error(`No router in "${resolved}". Expected one of: ${ROUTER_NAMES.join(', ')}.`)
}
