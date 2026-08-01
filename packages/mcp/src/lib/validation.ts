import {
  localhostAllowedHostnames,
  localhostAllowedOrigins,
  validateHostHeader,
  validateOriginHeader,
} from '@modelcontextprotocol/server'
import type { Middleware, RequestContext } from '@remix-run/fetch-router'

/**
 * A request context of any shape. Validation only reads headers and the URL, so it works with
 * whatever params and context entries the surrounding router happens to provide.
 *
 * `any` is load-bearing here: a context carrying params or entries is not assignable to the empty
 * `RequestContext`, so a narrower parameter type would reject every real router's context.
 */
// deno-lint-ignore no-explicit-any
type AnyContext = RequestContext<any, any>

/**
 * Builds the JSON-RPC error body the MCP spec expects for a rejected HTTP request.
 */
function jsonRpcError(message: string, status: number): Response {
  return Response.json({ jsonrpc: '2.0', error: { code: -32000, message }, id: null }, { status })
}

/**
 * Reads the host to validate, preferring the `Host` header and falling back to the request URL's
 * authority.
 *
 * The fallback matters because a `Request` is not always born from an HTTP/1.1 wire format: an
 * in-process `router.fetch('http://localhost/mcp')` and HTTP/2's `:authority` both produce a
 * request with no `Host` header, while the URL still carries the authority the client asked for.
 */
function requestHost(context: AnyContext): string {
  return context.headers.get('host') ?? context.url.host
}

/**
 * Rejects a request whose `Host` is not in `allowedHostnames`, returning `undefined` when it may
 * proceed. The building block behind {@link hostHeaderValidation}, exposed for handlers that
 * validate inline rather than through the middleware chain.
 *
 * @param context The request context to validate
 * @param allowedHostnames Allowed hostnames, without ports. For IPv6, include brackets (`[::1]`).
 * @returns A `403` JSON-RPC error response, or `undefined` when the host is allowed
 */
export function hostRejection(
  context: AnyContext,
  allowedHostnames: string[],
): Response | undefined {
  let result = validateHostHeader(requestHost(context), allowedHostnames)
  return result.ok ? undefined : jsonRpcError(result.message, 403)
}

/**
 * Rejects a request whose `Origin` is not in `allowedOriginHostnames`, returning `undefined` when
 * it may proceed. Requests without an `Origin` header pass, since non-browser MCP clients do not
 * send one.
 *
 * @param context The request context to validate
 * @param allowedOriginHostnames Allowed origin hostnames, without scheme or port
 * @returns A `403` JSON-RPC error response, or `undefined` when the origin is allowed
 */
export function originRejection(
  context: AnyContext,
  allowedOriginHostnames: string[],
): Response | undefined {
  let result = validateOriginHeader(context.headers.get('origin'), allowedOriginHostnames)
  return result.ok ? undefined : jsonRpcError(result.message, 403)
}

/**
 * Middleware for DNS rebinding protection. Validates the request's host (port-agnostic) against an
 * allowed list and answers `403` with a JSON-RPC error when it does not match.
 *
 * @param allowedHostnames Allowed hostnames, without ports. For IPv6, include brackets (`[::1]`).
 * @returns The middleware
 */
export function hostHeaderValidation(allowedHostnames: string[]): Middleware {
  return async (context, next) => hostRejection(context, allowedHostnames) ?? await next()
}

/**
 * Convenience middleware for `localhost` DNS rebinding protection.
 */
export function localhostHostValidation(): Middleware {
  return hostHeaderValidation(localhostAllowedHostnames())
}

/**
 * Middleware for `Origin` header validation. Validates the `Origin` hostname (port-agnostic)
 * against an allowed list.
 *
 * Requests without an `Origin` header pass; a present value that is not allowed, or that cannot be
 * parsed, is rejected with `403`.
 *
 * @param allowedOriginHostnames Allowed origin hostnames, without scheme or port
 * @returns The middleware
 */
export function originValidation(allowedOriginHostnames: string[]): Middleware {
  return async (context, next) => originRejection(context, allowedOriginHostnames) ?? await next()
}

/**
 * Convenience middleware for localhost `Origin` validation. Allows only origins whose hostname is
 * `localhost`, `127.0.0.1`, or `[::1]`.
 */
export function localhostOriginValidation(): Middleware {
  return originValidation(localhostAllowedOrigins())
}
