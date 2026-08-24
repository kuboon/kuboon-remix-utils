/**
 * The parts a static site is assembled from.
 *
 * A site writes its own `router.ts` and wires these together: islands compiled as one code-split
 * graph, a directory of pages served through the site's own transforms, a directory served
 * verbatim. What comes out is one handler — `deno serve router.ts` serves it, and the build crawls
 * it.
 *
 * ```ts
 * // router.ts
 * import { compose, createFileTree, createIslands, normalizeBase } from '@kuboon/remix-ssg/site'
 * import { markdown } from './transforms/markdown.tsx'
 *
 * export const base = normalizeBase(Deno.env.get('BASE_URL'))
 *
 * let islands = await createIslands({ rootDir: 'islands', basePath: `${base}/assets` })
 *
 * export default serveAsHost(
 *   compose(
 *     await createFileTree({
 *       rootDir: 'pages',
 *       basePath: base,
 *       transforms: [markdown({ base, islandUrls: islands.urls })],
 *     }),
 *     await createFileTree({ rootDir: 'static', basePath: `${base}/static` }),
 *     islands,
 *   ),
 *   { base },
 * )
 * ```
 *
 * ```sh
 * deno serve -P=dev --watch router.ts
 * deno run -c deno.json -P=build jsr:@kuboon/remix-ssg/build.ts
 * ```
 *
 * What is deliberately absent: any notion of what a page is made of. No content model, no document
 * shell, no route table. A transform decides those, and it lives in the site.
 */

export { compose } from './lib/site/middleware.ts'
export type { SiteMiddleware } from './lib/site/middleware.ts'
export { createFileTree } from './lib/site/file-tree.ts'
export type { FileTransform, FileTreeOptions, SourceFile } from './lib/site/file-tree.ts'
export { createIslands } from './lib/site/islands.ts'
export type { Islands, IslandsOptions } from './lib/site/islands.ts'
export { joinBase, normalizeBase, stripBase } from './lib/site/base.ts'
export { githubPages, outputPathFor, serveAsHost } from './lib/site/host.ts'
export type { FileServerBehavior, HostOptions, Redirect } from './lib/site/host.ts'
export { buildSite } from './lib/site/build.ts'
export type { BuildOptions, BuildStats } from './lib/site/build.ts'
export { loadRouter } from './lib/site/load.ts'
export type { SiteRouter } from './lib/site/load.ts'
