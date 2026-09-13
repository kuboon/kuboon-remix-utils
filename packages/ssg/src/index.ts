/**
 * Static site generation for [`remix/fetch-router`](https://github.com/remix-run/remix/tree/main/packages/fetch-router):
 * drive a router in-process with `router.fetch()`, follow the links in what it renders, and write
 * every response to disk.
 *
 * ## This package has moved
 *
 * It continues as **`@remix-kbn/ssg`**. The `remix-` prefix goes with the move, because the scope now
 * says it.
 *
 * ```diff
 * - "@kuboon/remix-ssg": "jsr:@kuboon/remix-ssg@^0.9.0"
 * + "@remix-kbn/ssg": "jsr:@remix-kbn/ssg"
 * ```
 *
 * 0.9.1 carries this notice and nothing else — its code is 0.9.0's. What comes after it
 * is published under the new name; if `@remix-kbn/ssg` is not on JSR yet as you read this, that is the
 * only thing left to happen.
 *
 * Nothing breaks if you stay. JSR cannot unpublish, so every version under this name keeps
 * resolving exactly as it does today, and there is no deadline attached to moving.
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
