/**
 * Directory conventions: what a site's files mean without a manifest listing them.
 *
 * `routes/` holds pages, named by path. `islands/` holds client components, named by path. Nothing
 * enumerates either one — adding a file is the whole registration step.
 */

import * as path from 'node:path'

/**
 * Extensions a page or island is written in.
 *
 * Components only. A `.ts` module sitting in `routes/` or `islands/` is a helper — a store two
 * islands share, a formatting function — and registering it as a page, or handing it to the
 * bundler as its own entrypoint, is never what was meant.
 */
const SOURCE_EXTENSIONS = ['.tsx', '.jsx']

/** A page module found under `routes/`. */
export interface DiscoveredPage {
  /** Route pattern, relative to the site root (`/`, `/about`, `/blog/archive`). */
  pattern: string
  /** Absolute path of the module. */
  filePath: string
}

/** An island module found under `islands/`. */
export interface DiscoveredIsland {
  /** Logical name — the path under `islands/`, without the extension. */
  name: string
  /** Absolute path of the module. */
  filePath: string
}

/**
 * Finds every page under `routes/`.
 *
 * A file's path becomes its route: `index` names its own directory, so `routes/index.tsx` is `/`
 * and `routes/blog/index.tsx` is `/blog`, while `routes/about.tsx` is `/about`. Names starting
 * with `_` are skipped, which leaves somewhere to put a shared fragment.
 *
 * @param routesDir Absolute path of the `routes/` directory
 * @returns Every page, ordered by pattern for a stable build
 */
export async function discoverPages(routesDir: string): Promise<DiscoveredPage[]> {
  let pages: DiscoveredPage[] = []

  for (let filePath of await walkSources(routesDir)) {
    let relative = stripExtension(path.relative(routesDir, filePath))
    let segments = relative.split('/')
    if (segments[segments.length - 1] === 'index') segments.pop()

    pages.push({ pattern: `/${segments.join('/')}`.replace(/\/+$/, '') || '/', filePath })
  }

  return pages.sort((a, b) => a.pattern.localeCompare(b.pattern))
}

/**
 * Finds every island under `islands/`.
 *
 * The name is the path under `islands/` without the extension, which is exactly what
 * `island(name, …)` is given on the other side.
 *
 * @param islandsDir Absolute path of the `islands/` directory
 * @returns Every island, ordered by name for a stable build
 */
export async function discoverIslands(islandsDir: string): Promise<DiscoveredIsland[]> {
  let islands: DiscoveredIsland[] = []

  for (let filePath of await walkSources(islandsDir)) {
    islands.push({ name: stripExtension(path.relative(islandsDir, filePath)), filePath })
  }

  return islands.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Every source file under a directory, recursively.
 *
 * A missing directory yields nothing rather than throwing — a site with no islands is a site, not
 * a misconfiguration.
 */
async function walkSources(directory: string): Promise<string[]> {
  let found: string[] = []

  let entries: Deno.DirEntry[]
  try {
    entries = await Array.fromAsync(Deno.readDir(directory))
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return []
    throw error
  }

  for (let entry of entries) {
    if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue

    let entryPath = path.join(directory, entry.name)
    if (entry.isDirectory) {
      found.push(...await walkSources(entryPath))
    } else if (isSource(entry.name)) {
      found.push(entryPath)
    }
  }

  return found
}

function isSource(name: string): boolean {
  if (name.endsWith('.test.ts') || name.endsWith('.test.tsx')) return false
  return SOURCE_EXTENSIONS.some((extension) => name.endsWith(extension))
}

function stripExtension(filePath: string): string {
  for (let extension of SOURCE_EXTENSIONS) {
    if (filePath.endsWith(extension)) return filePath.slice(0, -extension.length)
  }

  return filePath
}
