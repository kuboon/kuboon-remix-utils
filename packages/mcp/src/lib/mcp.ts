import {
  localhostAllowedHostnames,
  localhostAllowedOrigins,
  WebStandardStreamableHTTPServerTransport,
} from '@modelcontextprotocol/server'
import type {
  HandleRequestOptions,
  McpServer,
  WebStandardStreamableHTTPServerTransportOptions,
} from '@modelcontextprotocol/server'
import type { RequestContext, RequestHandler } from '@remix-run/fetch-router'

import { hostRejection, originRejection } from './validation.ts'

/**
 * A request context of any shape. The handler only reads the request, its headers, and its URL, so
 * it composes with whatever params and context entries the surrounding router provides.
 *
 * `any` is load-bearing here: a context carrying params or entries is not assignable to the empty
 * `RequestContext`, so a narrower parameter type would reject every real router's context.
 */
// deno-lint-ignore no-explicit-any
type AnyContext = RequestContext<any, any>

/**
 * Binds that mean "this server is only reachable from this machine", and so get DNS rebinding
 * protection turned on by default.
 */
const LOCALHOST_BINDS = ['127.0.0.1', 'localhost', '::1']

/**
 * Options for {@link mcp}.
 */
export interface McpOptions {
  /**
   * The hostname the server is bound to. Defaults to `'127.0.0.1'`.
   *
   * When it is `'127.0.0.1'`, `'localhost'`, or `'::1'`, host and origin validation are enabled
   * automatically to protect against DNS rebinding attacks on localhost servers.
   */
  host?: string
  /**
   * Allowed hostnames for DNS rebinding protection, overriding the default derived from `host`.
   * Hostnames only, without ports; for IPv6, include brackets (e.g. `'[::1]'`).
   *
   * Useful when binding to `'0.0.0.0'` or `'::'` but still restricting which hostnames are allowed.
   * Pass `false` to disable host validation — do that only when something in front of the router
   * (a proxy, a gateway, an authentication layer) already vouches for the request.
   */
  allowedHosts?: string[] | false
  /**
   * Allowed origin hostnames for `Origin` header validation, overriding the default derived from
   * `host`. Hostnames only, without scheme or port.
   *
   * Requests without an `Origin` header always pass, since non-browser MCP clients do not send one.
   * Pass `false` to disable origin validation.
   */
  allowedOrigins?: string[] | false
  /**
   * Options for the underlying `WebStandardStreamableHTTPServerTransport`.
   *
   * Defaults to `{ sessionIdGenerator: undefined }`, i.e. stateless mode: no session ID is issued
   * and no session state is kept between requests. Set `enableJsonResponse: true` to answer with a
   * plain JSON body instead of an SSE stream.
   */
  transport?: WebStandardStreamableHTTPServerTransportOptions
  /**
   * Derives per-request transport options from the request context.
   *
   * Use it to hand the transport a body some upstream middleware already consumed
   * (`{ parsedBody }`), or the caller's identity resolved by an authentication middleware
   * (`{ authInfo }`).
   */
  requestOptions?: (context: AnyContext) => HandleRequestOptions | Promise<HandleRequestOptions>
}

/**
 * Resolves an allow list from its explicit option and the bind address it defaults from.
 */
function resolveAllowed(
  option: string[] | false | undefined,
  host: string,
  localhostDefault: () => string[],
): string[] | undefined {
  if (option === false) return undefined
  if (option !== undefined) return option
  return LOCALHOST_BINDS.includes(host) ? localhostDefault() : undefined
}

/**
 * Creates a request handler that serves an {@link McpServer} over the MCP Streamable HTTP transport.
 *
 * Map it with `router.map()` so it receives every request method on the route: MCP uses `POST` for
 * JSON-RPC messages, `GET` to open the server-to-client SSE stream, and `DELETE` to end a session.
 *
 * The server is connected to the transport lazily, on the first request the handler serves, so
 * creating a router does not open a transport that may never be used.
 *
 * @param server The MCP server to serve
 * @param options Configuration options
 * @returns The request handler
 *
 * @example
 * ```ts
 * import { McpServer } from '@modelcontextprotocol/server'
 * import { createRouter } from '@remix-run/fetch-router'
 * import { mcp } from '@kuboon/remix-mcp'
 *
 * let server = new McpServer({ name: 'my-server', version: '1.0.0' })
 *
 * let router = createRouter()
 * router.map('/mcp', mcp(server))
 * ```
 */
export function mcp(server: McpServer, options: McpOptions = {}): RequestHandler<AnyContext> {
  let { host = '127.0.0.1', transport: transportOptions, requestOptions } = options

  let transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    ...transportOptions,
  })

  let allowedHosts = resolveAllowed(options.allowedHosts, host, localhostAllowedHostnames)
  let allowedOrigins = resolveAllowed(options.allowedOrigins, host, localhostAllowedOrigins)

  if (options.allowedHosts === undefined && (host === '0.0.0.0' || host === '::')) {
    console.warn(
      `Warning: MCP server is binding to ${host} without DNS rebinding protection. ` +
        'Pass the allowedHosts option to restrict allowed hosts, or use authentication to ' +
        'protect your server.',
    )
  }

  // `server.connect()` is in flight or settled; kept so concurrent first requests share one
  // connect instead of racing to open a second transport.
  let connecting: Promise<void> | undefined

  return async (context) => {
    if (allowedHosts) {
      let rejected = hostRejection(context, allowedHosts)
      if (rejected) return rejected
    }

    if (allowedOrigins) {
      let rejected = originRejection(context, allowedOrigins)
      if (rejected) return rejected
    }

    if (!server.isConnected()) {
      connecting ??= server.connect(transport).catch((error: unknown) => {
        // Let the next request try again rather than caching the failure forever.
        connecting = undefined
        throw error
      })
      await connecting
    }

    return await transport.handleRequest(context.request, await requestOptions?.(context))
  }
}
