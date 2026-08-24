/**
 * Client components, compiled as one graph.
 *
 * Every island goes into a single `Deno.bundle({ codeSplitting: true })` call, which is the whole
 * point: a module two islands import — the Remix UI runtime, a shared store — is emitted once, into
 * a chunk both import, so it is one module at runtime and not two copies with two states.
 *
 * What comes back is a {@link SiteMiddleware} like any other, plus the one thing only the bundler
 * knows: which chunk each island ended up in. A layout needs that to emit its script tags, because
 * output names shift with the set of entrypoints and cannot be predicted from a convention.
 */

import * as path from 'node:path'
import { createAssetServer } from '@kuboon/remix-assets-deno'
import type { BundleModeOptions } from '@kuboon/remix-assets-deno'

import type { SiteMiddleware } from './middleware.ts'

/** Extensions an island is written in. A `.ts` next to one is a helper, not an entrypoint. */
const ISLAND_EXTENSIONS = ['.tsx', '.jsx']

/** Options for {@link createIslands}. */
export interface IslandsOptions {
  /** Directory of island modules. Every `.tsx`/`.jsx` under it is an entrypoint. */
  rootDir: string
  /** Public mount point for the chunks. Defaults to `'/assets'`. */
  basePath?: string
  /** Bundle tuning — minification, source maps, externals. */
  bundle?: BundleModeOptions
}

/** Compiled islands, ready to compose. */
export interface Islands extends SiteMiddleware {
  /**
   * Island name -> public chunk URL.
   *
   * The name is the module's path under `rootDir`, without its extension: `islands/ui/counter.tsx`
   * is `ui/counter`.
   */
  readonly urls: Readonly<Record<string, string>>
}

/**
 * Compiles a directory of islands into code-split chunks.
 *
 * @param options Where the islands are and how to compile them
 * @returns A middleware serving the chunks, and the URL each island landed at
 *
 * @example
 * ```ts
 * let islands = await createIslands({ rootDir: 'islands', basePath: `${base}/assets` })
 * ```
 */
export async function createIslands(options: IslandsOptions): Promise<Islands> {
  let rootDir = path.resolve(options.rootDir)
  let files = await findIslands(rootDir)

  let assets = await createAssetServer({
    rootDir,
    entrypoints: files.map((island) => island.filePath),
    basePath: options.basePath ?? '/assets',
    mode: 'bundle',
    bundle: { sourcemap: 'none', ...options.bundle },
  })

  let urls: Record<string, string> = {}
  for (let island of files) urls[island.name] = assets.entryUrl(island.filePath)

  return {
    basePath: assets.basePath,
    urls,
    fetch: (request) => assets.fetch(request),
    // The asset server has every part of the contract but the name: what it serves is
    // `moduleUrls()`, keyed by the specifier each chunk came from. A view of it here rather than a
    // change upstream, so a consumer that only wants an asset server is unaffected.
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
