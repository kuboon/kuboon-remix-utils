/**
 * Turning a directory into one handler.
 *
 * Three conventions and nothing else: `islands/` is compiled as a single code-split graph, `pages/`
 * is served through the site's transforms, `static/` is served verbatim. The result is a `fetch`
 * that the build crawls and the dev server serves — the same object either way, which is what makes
 * moving from a static deploy to a live server a change of deploy target rather than of code.
 */

import * as path from 'node:path'
import { createAssetServer } from '@kuboon/remix-assets-deno'

import type { SiteConfig, SiteDefinition } from './config.ts'
import { createFileTree } from './file-tree.ts'
import { compose } from './middleware.ts'
import type { SiteMiddleware } from './middleware.ts'
import type { DenoAssetServer } from '@kuboon/remix-assets-deno'

/** Extensions an island is written in. A `.ts` next to one is a helper, not an entrypoint. */
const ISLAND_EXTENSIONS = ['.tsx', '.jsx']

/** Options for {@link assembleSite}. */
export interface AssembleOptions {
  /** The site root. */
  rootDir: string
  /** Deploy path prefix, without a trailing slash. Defaults to `BASE_URL`'s pathname. */
  base?: string
  /** Minify the client chunks. Defaults to `true`. */
  minify?: boolean
}

/** An assembled site. */
export interface AssembledSite {
  /** What the build crawls and the dev server serves. */
  fetch(request: Request): Promise<Response>
  /** Deploy path prefix. */
  base: string
  /** Where the crawl starts. */
  entryPoints: string[]
  /** Every middleware, in priority order — for diagnostics and reloads. */
  middlewares: SiteMiddleware[]
}

/**
 * Assembles a site from its directories and its config.
 *
 * @param definition The site, from `site.config.ts`
 * @param options Where the site lives and how to compile it
 * @returns One handler, plus what the build needs to start
 */
export async function assembleSite(
  definition: SiteDefinition,
  options: AssembleOptions,
): Promise<AssembledSite> {
  let rootDir = path.resolve(options.rootDir)
  let base = normalizeBase(options.base ?? baseFromEnv())

  // Resolved before the site's config, because a layout needs the chunk URLs and only the bundler
  // knows them — output names shift with the set of entrypoints.
  let dirs = typeof definition === 'function' ? {} : definition.dirs ?? {}
  let islandsDir = path.join(rootDir, dirs.islands ?? 'islands')
  let islandFiles = await findIslands(islandsDir)

  let islands = await createAssetServer({
    rootDir,
    entrypoints: islandFiles.map((island) => island.filePath),
    basePath: `${base}/assets`,
    mode: 'bundle',
    bundle: { minify: options.minify ?? true, sourcemap: 'none' },
  })

  let islandUrls: Record<string, string> = {}
  for (let island of islandFiles) islandUrls[island.name] = islands.entryUrl(island.filePath)

  let config: SiteConfig = typeof definition === 'function'
    ? await definition({ base, islandUrls })
    : definition

  let names = config.dirs ?? dirs

  let middlewares: SiteMiddleware[] = [
    await createFileTree({
      rootDir: path.join(rootDir, names.pages ?? 'pages'),
      basePath: base,
      transforms: config.transforms,
    }),
    await createFileTree({
      rootDir: path.join(rootDir, names.static ?? 'static'),
      basePath: `${base}/static`,
    }),
    asMiddleware(islands),
  ]

  return {
    fetch: compose(...middlewares).fetch,
    base,
    entryPoints: (config.entryPoints ?? ['/']).map((entry) => joinBase(base, entry)),
    middlewares,
  }
}

/**
 * Gives the asset server the middleware contract.
 *
 * It already has every part but the name: `moduleUrls()` is what it serves, keyed by the specifier
 * it came from. A thin view rather than a change upstream, so a crawl-only consumer of that package
 * is unaffected.
 */
function asMiddleware(assets: DenoAssetServer): SiteMiddleware {
  return {
    basePath: assets.basePath,
    fetch: (request) => assets.fetch(request),
    paths: () => assets.moduleUrls().values(),
    reload: () => assets.reload(),
  }
}

/** An island module: its name, and where it lives. */
interface Island {
  name: string
  filePath: string
}

/** Every island under a directory, named by its path within it. */
async function findIslands(islandsDir: string): Promise<Island[]> {
  let found: Island[] = []

  async function walk(directory: string): Promise<void> {
    let entries: Deno.DirEntry[]
    try {
      entries = await Array.fromAsync(Deno.readDir(directory))
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) return
      throw error
    }

    for (let entry of entries) {
      if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue

      let entryPath = path.join(directory, entry.name)
      if (entry.isDirectory) {
        await walk(entryPath)
      } else if (ISLAND_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) {
        found.push({
          name: stripExtension(path.relative(islandsDir, entryPath)),
          filePath: entryPath,
        })
      }
    }
  }

  await walk(islandsDir)
  return found.sort((a, b) => a.name.localeCompare(b.name))
}

function stripExtension(filePath: string): string {
  for (let extension of ISLAND_EXTENSIONS) {
    if (filePath.endsWith(extension)) return filePath.slice(0, -extension.length)
  }

  return filePath
}

/** Accepts a full URL or a bare prefix, since deploy workflows pass the former. */
export function normalizeBase(value: string): string {
  if (value === '') return ''
  if (/^https?:\/\//.test(value)) return new URL(value).pathname.replace(/\/+$/, '')
  return `/${value.replace(/^\/+/, '').replace(/\/+$/, '')}`
}

/** The root needs care: routes mount *at* the prefix, so under `/repo` the home page is `/repo`. */
function joinBase(base: string, pattern: string): string {
  if (pattern === '/' || pattern === '') return base === '' ? '/' : base
  return `${base}${pattern.startsWith('/') ? '' : '/'}${pattern}`
}

function baseFromEnv(): string {
  return normalizeBase(Deno.env.get('BASE_URL') ?? '')
}
