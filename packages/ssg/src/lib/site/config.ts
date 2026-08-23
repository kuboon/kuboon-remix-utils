/**
 * What a site declares, and the shapes the framework asks of it.
 *
 * A site's `site.config.ts` is the only module the CLI imports from the project by path, which is
 * deliberate: everything it hands over — content sources above all — arrives with its types intact,
 * where a directory the CLI globbed and dynamically imported would arrive as `any`.
 */

import type { RemixNode } from 'remix/ui'

/** One piece of content, already rendered. */
export interface ContentEntry {
  /** URL segment this entry is served at, under its mount path. */
  slug: string
  /** Title, for the page and for an index listing. */
  title: string
  /** Publication date, `YYYY-MM-DD`. Used to order an index listing when present. */
  date?: string
  /** One-line summary, for an index listing and the page description. */
  summary?: string
  /**
   * The body, already rendered to a Remix UI tree.
   *
   * The framework never sees Markdown — or any other source format. Rendering belongs to the
   * content source, which is what keeps the format (and its dependencies) a site's own business.
   */
  body: RemixNode
}

/**
 * A directory of content, behind the two operations the framework needs.
 *
 * A site implements this in `content/mod.ts` (or anywhere else) with whatever libraries its format
 * calls for.
 */
export interface ContentSource {
  /** Every entry. Used for the index listing and to seed the crawl. */
  list(): Promise<ContentEntry[]> | ContentEntry[]
  /**
   * One entry by slug.
   *
   * @param slug The URL segment
   * @returns The entry, or `null` when there is none
   */
  get(slug: string): Promise<ContentEntry | null> | ContentEntry | null
}

/** A link in the site header. */
export interface NavLink {
  /** Path, relative to the site root — the deploy prefix is added for you. */
  href: string
  /** Link text. */
  label: string
}

/** What a page module declares about itself. */
export interface PageMeta {
  /** Document title. */
  title: string
  /** Meta description. */
  description?: string
  /**
   * Load the client runtime on this page so its islands hydrate. Defaults to `false` — a page with
   * no islands ships no JavaScript.
   */
  hydrate?: boolean
  /**
   * This page depends on the request, so it cannot be prerendered.
   *
   * The static build skips it rather than baking one request's answer into a file that every
   * visitor then gets. Serving the same router live renders it normally.
   */
  dynamic?: boolean
}

/** A page module: `routes/about.tsx` exporting `meta` and a default component. */
export interface PageModule {
  meta?: PageMeta
  default: () => RemixNode
}

/** A site, as `site.config.ts` declares it. */
export interface SiteConfig {
  /** Site title, used as the suffix of every page title. */
  title: string
  /** Default meta description. */
  description?: string
  /** Header links. */
  nav?: NavLink[]
  /**
   * Content sources, as `mount path -> source`. Each mounts an index at its path and an entry page
   * at `<path>/:slug`.
   */
  content?: Record<string, ContentSource>
  /** Extra `<head>` content, rendered into every page. */
  head?: RemixNode
  /** Footer content, replacing the default. */
  footer?: RemixNode
}

/**
 * Declares a site.
 *
 * Identity at runtime — it exists so a config file gets checked against {@link SiteConfig} where it
 * is written, rather than when the CLI loads it.
 *
 * @param config The site
 * @returns The same object
 *
 * @example
 * ```ts
 * import { defineSite } from '@kuboon/remix-ssg/site'
 * import * as blog from './content/mod.ts'
 *
 * export default defineSite({
 *   title: 'my site',
 *   nav: [{ href: '/', label: 'Home' }, { href: '/blog', label: 'Blog' }],
 *   content: { '/blog': blog },
 * })
 * ```
 */
export function defineSite(config: SiteConfig): SiteConfig {
  return config
}
