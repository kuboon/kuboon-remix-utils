/**
 * Serve a [Model Context Protocol](https://modelcontextprotocol.io) server from a
 * [`remix/fetch-router`](https://github.com/remix-run/remix/tree/main/packages/fetch-router) route.
 *
 * ## This package has moved
 *
 * It continues as **`@remix-kbn/mcp`**. The `remix-` prefix goes with the move, because the scope now
 * says it.
 *
 * ```diff
 * - "@kuboon/remix-mcp": "jsr:@kuboon/remix-mcp@^0.1.1"
 * + "@remix-kbn/mcp": "jsr:@remix-kbn/mcp"
 * ```
 *
 * 0.1.2 carries this notice and nothing else — its code is 0.1.1's. What comes after it
 * is published under the new name; if `@remix-kbn/mcp` is not on JSR yet as you read this, that is the
 * only thing left to happen.
 *
 * Nothing breaks if you stay. JSR cannot unpublish, so every version under this name keeps
 * resolving exactly as it does today, and there is no deadline attached to moving.
 *
 * @module
 */

export { mcp } from './lib/mcp.ts'
export type { McpOptions } from './lib/mcp.ts'
export {
  hostHeaderValidation,
  hostRejection,
  localhostHostValidation,
  localhostOriginValidation,
  originRejection,
  originValidation,
} from './lib/validation.ts'
