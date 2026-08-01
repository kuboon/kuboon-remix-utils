/**
 * The asset server itself.
 *
 * Compiles client entrypoints and everything they import into individually addressable ES modules,
 * one URL per module, and serves them to the browser. No bundling — that is the point. A bundler
 * that compiles each client entry separately duplicates every shared module into every bundle, so
 * a module-level singleton silently becomes one instance per entry. Here `./session.ts` has one
 * URL, so the browser evaluates it once no matter how many entries import it.
 */

import { transpile } from '@deno/emit'
import { createRequire } from 'node:module'
import * as path from 'node:path'

import { loadModuleGraph } from './graph.ts'
import type { ModuleGraph } from './graph.ts'
import { candidatePathFor, PathRegistry } from './paths.ts'
import { rewriteImports } from './rewrite.ts'

/** Compiler options forwarded to the transpiler. */
export interface AssetCompilerOptions {
  /** JSX transform, e.g. `'react-jsx'`. */
  jsx?: string
  /** JSX import source, e.g. `'@remix-run/ui'`. */
  jsxImportSource?: string
  /** Emit `.d.ts`-stripping only; forwarded verbatim to `@deno/emit`. */
  [option: string]: unknown
}

/** Options for {@link createAssetServer}. */
export interface AssetServerOptions {
  /**
   * Client entrypoints, as paths relative to `rootDir` or absolute `file:` URLs. Every module
   * reachable from these is compiled and served.
   */
  entrypoints: readonly string[]
  /** Directory that entrypoints and served paths are resolved against. Defaults to `Deno.cwd()`. */
  rootDir?: string
  /** Public mount point for served modules. Defaults to `'/assets'`. */
  basePath?: string
  /** Path to the `deno.json` supplying the import map and compiler options. */
  configPath?: string
  /** Path to a standalone import map, when it is not in `configPath`. */
  importMap?: string
  /** Compiler options for the transpiler, e.g. the JSX runtime. */
  compilerOptions?: AssetCompilerOptions
  /** The `deno` executable used to build the module graph. Defaults to {@link Deno.execPath}. */
  denoExecPath?: string
  /**
   * `Cache-Control` for served modules. Defaults to `'no-cache'`, which lets the browser
   * revalidate against the `ETag` instead of holding a stale module.
   */
  cacheControl?: string
}

/** A compiled asset server. */
export interface DenoAssetServer {
  /** Public mount point, without a trailing slash. */
  readonly basePath: string
  /**
   * Serves one request.
   *
   * @param request The incoming request
   * @returns The module, or a `404` when nothing is served at that path
   */
  fetch(request: Request): Promise<Response>
  /**
   * The public URL for a client entrypoint, for putting in a `<script type="module" src>`.
   *
   * @param entrypoint The entrypoint, exactly as passed to {@link createAssetServer}
   * @returns The URL path
   */
  entryUrl(entrypoint: string): string
  /** Every served module, as `resolved specifier -> public path`. Useful for debugging and tests. */
  moduleUrls(): Map<string, string>
  /** Rebuilds the graph and recompiles. Call after sources change. */
  reload(): Promise<void>
}

/** Thrown when an entrypoint cannot be compiled. */
export class AssetCompilationError extends Error {
  override name = 'AssetCompilationError'

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
  }
}

interface ServedModule {
  /** The JavaScript to send, with imports already rewritten. */
  code: string
  /** Strong validator for conditional requests. */
  etag: string
}

/**
 * Compiles the entrypoints and returns a server for the resulting modules.
 *
 * Needs `--allow-run` (to build the graph with `deno info`), `--allow-read`, `--allow-env`, and
 * `--allow-net` on first compile if anything is not already in the Deno cache.
 *
 * @param options Configuration
 * @returns The compiled asset server
 *
 * @example
 * ```ts
 * import { createRouter } from '@remix-run/fetch-router'
 * import { createAssetServer } from '@kuboon/remix-assets-deno'
 *
 * let assets = await createAssetServer({
 *   rootDir: new URL('.', import.meta.url).pathname,
 *   entrypoints: ['client/nav_auth.tsx', 'client/signin_card.tsx'],
 *   configPath: 'client/deno.json',
 *   compilerOptions: { jsx: 'react-jsx', jsxImportSource: '@remix-run/ui' },
 * })
 *
 * let router = createRouter()
 * router.map('/assets/*path', ({ request }) => assets.fetch(request))
 * ```
 */
export async function createAssetServer(
  options: AssetServerOptions,
): Promise<DenoAssetServer> {
  let rootDir = path.resolve(options.rootDir ?? Deno.cwd())
  let basePath = options.basePath ?? '/assets'
  let cacheControl = options.cacheControl ?? 'no-cache'

  let state = await build(options, rootDir, basePath)

  return {
    get basePath() {
      return state.registry.basePath
    },

    async fetch(request: Request): Promise<Response> {
      let url = new URL(request.url)
      let key = state.registry.keyFor(decodeURIComponent(url.pathname))
      let module = key === undefined ? undefined : state.modules.get(key)

      if (module === undefined) {
        return new Response('Not Found', {
          status: 404,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        })
      }

      if (request.headers.get('if-none-match') === module.etag) {
        return new Response(null, {
          status: 304,
          headers: { etag: module.etag, 'cache-control': cacheControl },
        })
      }

      return new Response(request.method === 'HEAD' ? null : module.code, {
        headers: {
          'content-type': 'text/javascript; charset=utf-8',
          etag: module.etag,
          'cache-control': cacheControl,
        },
      })
    },

    entryUrl(entrypoint: string): string {
      let url = state.entryUrls.get(entrypoint)
      if (url === undefined) {
        throw new AssetCompilationError(
          `"${entrypoint}" is not one of this asset server's entrypoints. ` +
            `Known entrypoints: ${[...state.entryUrls.keys()].join(', ')}.`,
        )
      }

      return url
    },

    moduleUrls(): Map<string, string> {
      return state.registry.entries()
    },

    async reload(): Promise<void> {
      state = await build(options, rootDir, basePath)
    },
  }
}

interface ServerState {
  registry: PathRegistry
  modules: Map<string, ServedModule>
  entryUrls: Map<string, string>
}

async function build(
  options: AssetServerOptions,
  rootDir: string,
  basePath: string,
): Promise<ServerState> {
  let entryUrlsBySpecifier = new Map<string, string>()
  let entrySpecifiers = options.entrypoints.map((entrypoint) => ({
    entrypoint,
    specifier: toFileUrl(entrypoint, rootDir),
  }))

  let configPath = options.configPath ? path.resolve(rootDir, options.configPath) : undefined
  let importMapPath = options.importMap ? path.resolve(rootDir, options.importMap) : undefined

  let graph = await loadModuleGraph(
    entrySpecifiers.map((entry) => entry.specifier),
    {
      rootDir,
      configPath,
      importMap: importMapPath,
      denoExecPath: options.denoExecPath,
    },
  )

  // `@deno/emit` wants a URL for the import map, not a bare filesystem path.
  let importMapUrl = importMapPath ?? configPath
  let emitted = await transpileAll(entrySpecifiers.map((entry) => entry.specifier), {
    importMap: importMapUrl === undefined ? undefined : toFileUrlFromPath(importMapUrl),
    compilerOptions: options.compilerOptions,
  })

  let registry = new PathRegistry(basePath)
  let npmRoots = collectNpmRoots(graph)
  let require = createRequire(path.join(rootDir, 'package.json'))

  // Pass 1: give every module a URL before rewriting anything, so a rewrite can always look up the
  // target it needs regardless of the order modules are visited in.
  let graphModules = [...graph.modules.values()].filter((module) => module.kind !== 'npm')
  for (let module of graphModules) {
    registry.register(module.specifier, candidatePathFor(module.specifier, { rootDir, npmRoots }))
  }

  // npm files are outside the Deno graph, so walk them from the npm modules the graph does name.
  let npmFiles = new Map<string, NpmFile>()
  let aliases = new Map<string, string>()
  for (let module of graph.modules.values()) {
    if (module.kind !== 'npm' || module.npmPackage === null) continue

    let entryFile = resolveNpmModule(module.specifier, module.npmPackage, graph, require)
    if (entryFile === null) continue

    walkNpmFile(entryFile, npmFiles, require)
    let publicPath = registry.register(
      entryFile,
      candidatePathFor(toFileUrlFromPath(entryFile), {
        rootDir,
        npmRoots,
      }),
    )
    aliases.set(module.specifier, publicPath)
  }

  for (let filePath of npmFiles.keys()) {
    registry.register(
      filePath,
      candidatePathFor(toFileUrlFromPath(filePath), { rootDir, npmRoots }),
    )
  }

  // Pass 2: emit each module with its imports pointing at the URLs assigned above.
  let modules = new Map<string, ServedModule>()

  for (let module of graphModules) {
    let source = emitted.get(module.specifier) ?? (await readLocal(module.local))
    if (source === null) continue

    let resolveSpecifier = (specifier: string): string | null => {
      let dependency = module.dependencies.find((entry) => entry.specifier === specifier)
      if (!dependency?.resolved) return null

      let target = graph.resolve(dependency.resolved)
      return registry.pathFor(target) ?? aliases.get(target) ?? null
    }

    modules.set(module.specifier, await toServedModule(source, resolveSpecifier))
  }

  for (let [filePath, npmFile] of npmFiles) {
    let resolveSpecifier = (specifier: string): string | null => {
      let target = npmFile.dependencies.get(specifier)
      return target === undefined ? null : registry.pathFor(target) ?? null
    }

    modules.set(filePath, await toServedModule(npmFile.source, resolveSpecifier))
  }

  for (let { entrypoint, specifier } of entrySpecifiers) {
    let publicPath = registry.pathFor(specifier)
    if (publicPath === undefined) {
      throw new AssetCompilationError(
        `Entrypoint "${entrypoint}" produced no module. ` +
          `Check that the path exists and is reachable from rootDir.`,
      )
    }

    entryUrlsBySpecifier.set(entrypoint, publicPath)
  }

  return { registry, modules, entryUrls: entryUrlsBySpecifier }
}

async function toServedModule(
  source: string,
  resolveSpecifier: (specifier: string) => string | null,
): Promise<ServedModule> {
  let code = await rewriteImports(source, resolveSpecifier)
  return { code, etag: await etagFor(code) }
}

async function transpileAll(
  specifiers: readonly string[],
  options: { importMap?: string; compilerOptions?: AssetCompilerOptions },
): Promise<Map<string, string>> {
  let emitted = new Map<string, string>()

  for (let specifier of specifiers) {
    let result: Map<string, string>
    try {
      result = await transpile(specifier, {
        importMap: options.importMap,
        compilerOptions: options.compilerOptions as Record<string, unknown> | undefined,
      })
    } catch (error) {
      throw new AssetCompilationError(
        `Failed to compile "${specifier}". ${
          error instanceof Error ? error.message : String(error)
        }`,
        { cause: error },
      )
    }

    for (let [key, code] of result) {
      if (!emitted.has(key)) emitted.set(key, code)
    }
  }

  return emitted
}

interface NpmFile {
  source: string
  /** Authored specifier -> absolute path on disk. */
  dependencies: Map<string, string>
}

/**
 * Reads an npm file and everything it imports, depth-first.
 *
 * npm packages ship JavaScript already, so nothing is transpiled here — only read, and their
 * specifiers recorded so pass 2 can rewrite them.
 */
function walkNpmFile(
  filePath: string,
  seen: Map<string, NpmFile>,
  require: NodeJS.Require,
): void {
  if (seen.has(filePath)) return

  let source: string
  try {
    source = Deno.readTextFileSync(filePath)
  } catch {
    return
  }

  let file: NpmFile = { source, dependencies: new Map() }
  // Recorded before recursing so an import cycle terminates.
  seen.set(filePath, file)

  for (let specifier of staticSpecifiers(source)) {
    let resolved = resolveFromFile(specifier, filePath, require)
    if (resolved === null) continue

    file.dependencies.set(specifier, resolved)
    walkNpmFile(resolved, seen, require)
  }
}

/**
 * Extracts import specifiers without paying for a full parse.
 *
 * Only used for npm files, whose published output is plain ESM. The authoritative rewrite still
 * goes through `es-module-lexer`; a specifier missed here simply is not pre-registered, and a
 * spurious one resolves to nothing and is dropped.
 */
function staticSpecifiers(source: string): string[] {
  let specifiers = new Set<string>()
  let pattern =
    /(?:^|[\s;}])(?:import|export)\s[^;'"]*?["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)|\bimport\s+["']([^"']+)["']/g

  for (let match of source.matchAll(pattern)) {
    let specifier = match[1] ?? match[2] ?? match[3]
    if (specifier !== undefined) specifiers.add(specifier)
  }

  return [...specifiers]
}

function resolveFromFile(
  specifier: string,
  importerPath: string,
  require: NodeJS.Require,
): string | null {
  if (specifier.startsWith('node:') || specifier.startsWith('data:')) return null
  if (specifier.startsWith('http://') || specifier.startsWith('https://')) return null

  try {
    return createRequire(importerPath).resolve(specifier)
  } catch {
    // Fall back to the app-anchored require: a package may rely on a hoisted dependency.
    try {
      return require.resolve(specifier)
    } catch {
      return null
    }
  }
}

function resolveNpmModule(
  specifier: string,
  packageId: string,
  graph: ModuleGraph,
  require: NodeJS.Require,
): string | null {
  let npmPackage = graph.npmPackages.get(packageId)
  if (npmPackage === undefined) return null

  // `npm:/@remix-run/ui@0.4.0/jsx-runtime` -> subpath `/jsx-runtime`.
  let body = specifier.startsWith('npm:/')
    ? specifier.slice('npm:/'.length)
    : specifier.slice('npm:'.length)
  let subpath = body.startsWith(packageId) ? body.slice(packageId.length) : ''
  let request = `${npmPackage.name}${subpath}`

  try {
    return require.resolve(request)
  } catch {
    return npmPackage.localPath
  }
}

function collectNpmRoots(graph: ModuleGraph): Map<string, string> {
  let roots = new Map<string, string>()
  for (let [id, npmPackage] of graph.npmPackages) {
    if (npmPackage.localPath !== null) roots.set(npmPackage.localPath, id)
  }

  return roots
}

async function readLocal(local: string | null): Promise<string | null> {
  if (local === null) return null

  try {
    return await Deno.readTextFile(local)
  } catch {
    return null
  }
}

function toFileUrl(entrypoint: string, rootDir: string): string {
  if (entrypoint.startsWith('file://')) return entrypoint
  return toFileUrlFromPath(path.resolve(rootDir, entrypoint))
}

function toFileUrlFromPath(filePath: string): string {
  let url = new URL('file://')
  url.pathname = filePath.split('/').map(encodeURIComponent).join('/')
  return url.href
}

async function etagFor(code: string): Promise<string> {
  let digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(code))
  let hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return `"${hex}"`
}
