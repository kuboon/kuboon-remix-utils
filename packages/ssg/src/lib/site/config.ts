/**
 * What a site declares.
 *
 * Very little, by design. The framework knows three directories and how to compile islands; it
 * does not know what a page is made of. A site's transforms decide that, and they are handed the
 * two things they cannot work out for themselves — the deploy prefix, and where the bundler put
 * each island.
 */

import type { FileTransform } from './file-tree.ts'

/** What the framework knows by the time a site's transforms are built. */
export interface SiteContext {
  /** Deploy path prefix, without a trailing slash, or `''`. */
  base: string
  /**
   * Island name -> public chunk URL.
   *
   * A layout needs this to emit the script tags and the map the client runtime resolves ids
   * against. It comes from the bundler rather than a convention because output names shift with
   * the set of entrypoints.
   */
  islandUrls: Record<string, string>
}

/** A site, as `site.config.ts` declares it. */
export interface SiteConfig {
  /**
   * Transforms for files under `pages/`. Files no transform claims are served verbatim.
   *
   * This is where Markdown — or any other format — is handled, which is what keeps it and its
   * dependencies out of this package.
   */
  transforms?: readonly FileTransform[]
  /**
   * Where the crawl starts. Defaults to `['/']`.
   *
   * The crawl follows links from here, so what is reachable is what gets generated. A page nothing
   * links to belongs in this list or it is not part of the site.
   */
  entryPoints?: readonly string[]
  /** Directory names, when the defaults do not fit. */
  dirs?: {
    /** Pages, transformed and served at the site root. Defaults to `'pages'`. */
    pages?: string
    /** Files served verbatim under `/static`. Defaults to `'static'`. */
    static?: string
    /** Client components, compiled as one code-split graph. Defaults to `'islands'`. */
    islands?: string
  }
}

/** A site config, or a function that builds one once the islands are compiled. */
export type SiteDefinition =
  | SiteConfig
  | ((context: SiteContext) => SiteConfig | Promise<SiteConfig>)

/**
 * Declares a site.
 *
 * Identity at runtime — it exists so a config file is checked where it is written rather than when
 * the CLI loads it.
 *
 * @param definition The site, or a function receiving what the framework already knows
 * @returns The same value
 *
 * @example
 * ```ts
 * import { defineSite } from '@kuboon/remix-ssg/site'
 * import { markdown } from './transforms/markdown.ts'
 *
 * export default defineSite(({ base, islandUrls }) => ({
 *   transforms: [markdown({ base, islandUrls })],
 * }))
 * ```
 */
export function defineSite(definition: SiteDefinition): SiteDefinition {
  return definition
}
