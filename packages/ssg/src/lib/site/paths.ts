/**
 * Turning a site path into the URL a document should carry.
 *
 * Its own module because both the shell and the router need it, and a shared import beats a cycle
 * between them.
 */

/**
 * Applies the deploy prefix to a site path.
 *
 * The root needs care: routes are mounted *at* the prefix, so under `/repo` the home page is
 * `/repo`, not `/repo/` — the latter matches nothing.
 *
 * @param base Deploy prefix, without a trailing slash, or `''`
 * @param pattern Site path, starting with `/`
 * @returns The public path
 */
export function hrefFor(base: string, pattern: string): string {
  if (pattern === '/' || pattern === '') return base === '' ? '/' : base
  return `${base}${pattern}`
}
