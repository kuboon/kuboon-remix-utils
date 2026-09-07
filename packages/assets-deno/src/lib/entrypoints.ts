/**
 * Turning what a site wrote into the list of files to compile.
 *
 * An entrypoint may be a path or a glob. The glob is the point: a site with twenty islands should
 * not have to name twenty files, and a file appearing under `islands/` is a decision the directory
 * already records. `@remix-run/assets` does the same thing from the other end — its `allowFiles`
 * globs decide what may be compiled, and it compiles on demand. Nothing here can compile on demand:
 * `Deno.bundle` takes its entry points up front, and code splitting cannot know what is shared
 * until it knows every entry. So the glob is expanded here instead, once, at startup.
 */

import * as path from 'node:path'

import { expandGlob } from '@std/fs/expand-glob'

/** Characters that make a path a pattern rather than a name. */
const GLOB_MAGIC = /[*?[\]{}]/

/** Whether an entrypoint is a pattern to expand or a file to take as written. */
export function isGlob(entrypoint: string): boolean {
  return !entrypoint.startsWith('file://') && GLOB_MAGIC.test(entrypoint)
}

/**
 * Expands every glob among the entrypoints, in place, keeping everything else as written.
 *
 * Matches are sorted, so the same directory produces the same list on every run — which keeps the
 * bundler's chunk naming stable across builds.
 *
 * @param entrypoints Paths relative to `rootDir`, `file:` URLs, or globs over `rootDir`
 * @param rootDir Absolute directory the patterns are relative to
 * @returns The entrypoints with each glob replaced by its matches, relative to `rootDir`
 * @throws When a glob matches no file — a pattern that names nothing is a mistake, not an empty set
 */
export async function expandEntrypoints(
  entrypoints: readonly string[],
  rootDir: string,
): Promise<string[]> {
  let expanded: string[] = []

  for (let entrypoint of entrypoints) {
    if (!isGlob(entrypoint)) {
      if (!expanded.includes(entrypoint)) expanded.push(entrypoint)
      continue
    }

    let matches: string[] = []
    for await (let entry of expandGlob(entrypoint, { root: rootDir, includeDirs: false })) {
      matches.push(path.relative(rootDir, entry.path))
    }

    if (matches.length === 0) {
      throw new Error(
        `Entrypoint pattern "${entrypoint}" matched no files under "${rootDir}".`,
      )
    }

    for (let match of matches.sort()) {
      if (!expanded.includes(match)) expanded.push(match)
    }
  }

  return expanded
}
