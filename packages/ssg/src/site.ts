/**
 * The site framework: everything a static site needs beyond its own content.
 *
 * A site declares itself in `site.config.ts` and fills three directories — `routes/`, `islands/`,
 * `static/` — plus whatever its content sources need. Nothing else is written per site: the
 * document shell, the deploy-prefix mount, static file serving, client bundling, and the crawl all
 * live here.
 *
 * Drive it with the CLI rather than calling this directly:
 *
 * ```sh
 * deno run -c deno.json -P=build jsr:@kuboon/remix-ssg/build.ts
 * deno run -c deno.json -P=dev   jsr:@kuboon/remix-ssg/dev.ts
 * ```
 */

export { defineSite } from './lib/site/config.ts'
export type {
  ContentEntry,
  ContentSource,
  NavLink,
  PageMeta,
  PageModule,
  SiteConfig,
} from './lib/site/config.ts'
export { createSite } from './lib/site/create.tsx'
export type { CreateSiteOptions, Site, SiteMode } from './lib/site/create.tsx'
export { buildSite } from './lib/site/build.ts'
export type { BuildOptions, BuildStats } from './lib/site/build.ts'
export { loadSiteConfig } from './lib/site/load.ts'
