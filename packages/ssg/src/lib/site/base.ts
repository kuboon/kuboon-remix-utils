/**
 * The deploy prefix.
 *
 * A sub-path deploy touches every part of a site at once — every URL carries the prefix, and no
 * output path does — so the one rule for turning a deploy URL into that prefix lives here rather
 * than being repeated wherever it is needed.
 */

/**
 * Turns a deploy URL or a bare prefix into a path prefix.
 *
 * A Pages workflow hands out a full URL; a person writing it by hand types `/repo`. Both arrive
 * here and leave as `/repo`, and a root deploy leaves as `''`.
 *
 * @param value A full URL, a path prefix, or nothing
 * @returns The prefix, without a trailing slash, or `''` for a root deploy
 *
 * @example
 * ```ts
 * export const base = normalizeBase(Deno.env.get('BASE_URL'))
 * ```
 */
export function normalizeBase(value: string | undefined | null): string {
  let raw = (value ?? '').trim()
  if (raw === '') return ''

  let prefix = /^https?:\/\//.test(raw) ? new URL(raw).pathname : raw
  let trimmed = prefix.replace(/^\/+/, '').replace(/\/+$/, '')
  return trimmed === '' ? '' : `/${trimmed}`
}

/**
 * Mounts a path under a prefix.
 *
 * The root is the case that bites: mounted at `/repo`, a site's `/` is `/repo`, not `/repo/` —
 * the latter matches nothing.
 *
 * @param base The prefix, from {@link normalizeBase}
 * @param servedPath A path starting with `/`
 * @returns The public path
 */
export function joinBase(base: string, servedPath: string): string {
  if (servedPath === '/' || servedPath === '') return base === '' ? '/' : base
  return `${base}${servedPath.startsWith('/') ? '' : '/'}${servedPath}`
}

/** Drops the deploy prefix from a path, so built files land at the output root. */
export function stripBase(servedPath: string, base: string): string {
  let relative = servedPath.replace(/^\/+/, '')
  if (base === '') return relative

  let prefix = `${base.replace(/^\//, '')}/`
  return relative.startsWith(prefix) ? relative.slice(prefix.length) : relative
}
