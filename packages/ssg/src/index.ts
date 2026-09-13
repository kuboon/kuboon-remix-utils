/**
 * Static site generation for [`remix/fetch-router`](https://github.com/remix-run/remix/tree/main/packages/fetch-router):
 * drive a router in-process with `router.fetch()`, follow the links in what it renders, and write
 * every response to disk.
 *
 * Renamed from `@kuboon/remix-ssg` at 0.10.0; the `remix-` prefix went with the move, because the
 * scope says it now. The old name stops at 0.9.1 and stays on JSR — nothing was unpublished.
 *
 * @module
 */

export { crawl, CrawlError } from './lib/crawl.ts'
export type {
  CrawlErrorHandler,
  CrawlFailure,
  CrawlOptions,
  CrawlResult,
  RouterLike,
} from './lib/crawl.ts'
export { rewriteExtensionsToJs, toOutput } from './lib/output.ts'
export type { OutputFile } from './lib/output.ts'
