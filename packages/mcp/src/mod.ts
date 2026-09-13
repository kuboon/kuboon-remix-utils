/**
 * Serve a [Model Context Protocol](https://modelcontextprotocol.io) server from a
 * [`remix/fetch-router`](https://github.com/remix-run/remix/tree/main/packages/fetch-router) route.
 *
 * Renamed from `@kuboon/remix-mcp` at 0.2.0; the `remix-` prefix went with the move, because the
 * scope says it now. The old name stops at 0.1.2 and stays on JSR — nothing was unpublished.
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
