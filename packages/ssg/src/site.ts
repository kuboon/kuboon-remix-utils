/**
 * The site framework: the assembly a static site needs beyond its own content.
 *
 * Three directories and one config file. `islands/` is compiled as a single code-split graph,
 * `pages/` is served through the site's own transforms, `static/` is served verbatim — and the
 * result is one handler that the build crawls and the dev server serves.
 *
 * What is deliberately absent: any notion of what a page is made of. No content model, no document
 * shell, no route table. A transform decides those, and it lives in the site.
 *
 * ```sh
 * deno run -c deno.json -P=build jsr:@kuboon/remix-ssg/build.ts
 * deno run -c deno.json -P=dev   jsr:@kuboon/remix-ssg/dev.ts
 * ```
 */

export { defineSite } from './lib/site/config.ts'
export type { SiteConfig, SiteContext, SiteDefinition } from './lib/site/config.ts'
export { createFileTree } from './lib/site/file-tree.ts'
export type { FileTransform, FileTreeOptions } from './lib/site/file-tree.ts'
export { compose } from './lib/site/middleware.ts'
export type { SiteMiddleware } from './lib/site/middleware.ts'
export { assembleSite } from './lib/site/assemble.ts'
export type { AssembledSite, AssembleOptions } from './lib/site/assemble.ts'
export { buildSite } from './lib/site/build.ts'
export type { BuildOptions, BuildStats } from './lib/site/build.ts'
export { loadSiteConfig } from './lib/site/load.ts'
