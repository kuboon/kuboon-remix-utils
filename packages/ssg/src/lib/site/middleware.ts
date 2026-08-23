/**
 * The contract a site is assembled from.
 *
 * A site is a handful of things that answer requests under a path prefix, composed into one
 * handler. `@kuboon/remix-assets-deno`'s asset server already has this shape — mount point, fetch,
 * what it serves, rebuild — so a file tree of pages that matches it composes with islands for free,
 * and the build and the dev server drive the same object.
 */

/** Something that serves part of a site. */
export interface SiteMiddleware {
  /** Public mount point, without a trailing slash. `''` mounts at the root. */
  readonly basePath: string
  /**
   * Answers one request.
   *
   * @param request The incoming request
   * @returns The response, or a `404` when this middleware serves nothing there
   */
  fetch(request: Request): Promise<Response>
  /**
   * Every path this middleware can serve.
   *
   * Informational — the crawl is seeded with entry points and finds the rest by following links,
   * so a page listed here that nothing links to is not part of the site. Useful for diagnostics,
   * and for a caller that wants to seed something deliberately.
   */
  paths(): Iterable<string>
  /** Recomputes whatever was compiled at startup. */
  reload(): Promise<void>
}

/**
 * Composes middlewares into one handler, first match wins.
 *
 * A `404` from one is treated as "not mine" and passed along, so a file tree and an asset server
 * can share a mount point without either knowing about the other.
 *
 * @param middlewares The middlewares, in priority order
 * @returns A `fetch`-shaped object — what `crawl` drives and what `Deno.serve` serves
 */
export function compose(
  ...middlewares: readonly SiteMiddleware[]
): { fetch(request: Request): Promise<Response> } {
  return {
    async fetch(request: Request): Promise<Response> {
      for (let middleware of middlewares) {
        let response = await middleware.fetch(request)
        if (response.status !== 404) return response
      }

      return new Response('Not Found', {
        status: 404,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      })
    },
  }
}
