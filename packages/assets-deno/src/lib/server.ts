/**
 * The asset server itself.
 *
 * The problem both of its modes solve is the same one: a module shared by two client entries must
 * end up as *one* instance in the browser, or a module-level singleton silently becomes one
 * instance per entry. What breaks that guarantee is compiling each entry independently, which
 * inlines a private copy of the shared module into every output.
 *
 * - `'modules'` (the default) serves one URL per module and never bundles. The browser's module
 *   registry is keyed by URL, so one URL is one instance. This is how Vite's dev server works.
 * - `'bundle'` compiles every entrypoint as a single graph and lets `Deno.bundle`'s code splitting
 *   hoist shared modules into chunks both entries import. This is how Rollup, webpack, and Vite's
 *   production build do it — far fewer requests and minified output, at the cost of a compile step.
 *
 * Neither mode ever compiles an entrypoint on its own, which is the only thing that would duplicate
 * the singleton.
 */

import * as path from 'node:path'

import { buildBundle } from './bundle.ts'
import type { BundleModeOptions } from './bundle.ts'
import { wrapCommonJs } from './cjs.ts'
import { loadModuleGraph } from './loader.ts'
import { expandEntrypoints } from './entrypoints.ts'
import type { LoadModuleGraphOptions } from './loader.ts'
import { candidatePathFor, PathRegistry } from './paths.ts'
import { rewriteImports } from './rewrite.ts'
import type { ServedModule, ServerState } from './state.ts'

/** Options for {@link createAssetServer}. */
export interface AssetServerOptions {
  /**
   * Client entrypoints, as paths relative to `rootDir`, absolute `file:` URLs, or globs over
   * `rootDir` — `'islands/*.tsx'` names every island without naming any of them. Every module
   * reachable from an entrypoint is compiled and served.
   *
   * Globs are expanded once, at startup, and their matches sorted, so a build is reproducible. A
   * pattern that matches nothing is an error rather than an empty set.
   */
  entrypoints: readonly string[]
  /** Directory that entrypoints and served paths are resolved against. Defaults to `Deno.cwd()`. */
  rootDir?: string
  /** Public mount point for served modules. Defaults to `'/assets'`. */
  basePath?: string
  /**
   * Path to the `deno.json` supplying the import map and compiler options, relative to `rootDir`.
   * Its `compilerOptions` (`jsx`, `jsxImportSource`, …) are honored automatically.
   *
   * `'modules'` mode only. `Deno.bundle` takes no config argument — it uses the config the process
   * itself started with — so in `'bundle'` mode this is ignored and the process must be started
   * from the project the entrypoints belong to.
   */
  configPath?: string
  /**
   * Resolution platform. Defaults to `'browser'`, so packages resolve their browser-conditioned
   * exports.
   */
  platform?: 'browser' | 'node'
  /** Node resolution conditions for `package.json` exports. */
  nodeConditions?: string[]
  /**
   * `Cache-Control` for served modules. Defaults to `'no-cache'`, which lets the browser
   * revalidate against the `ETag` instead of holding a stale module.
   */
  cacheControl?: string
  /**
   * How the graph is compiled.
   *
   * - `'modules'` (default) — one URL per module, no bundling. Module identity is the URL.
   * - `'bundle'` — one `Deno.bundle({ codeSplitting: true })` call over every entrypoint, so shared
   *   modules are hoisted into shared chunks. Needs Deno's `--unstable-bundle` flag.
   *
   * Both keep a cross-entry singleton a singleton; they differ in request count and readability.
   */
  mode?: 'modules' | 'bundle'
  /** Bundle-mode tuning (minification, source maps, externals). Ignored in `'modules'` mode. */
  bundle?: BundleModeOptions
}

/**
 * What a renderer needs to load one client entry.
 *
 * Structurally what `@remix-run/assets` calls a `ScriptEntry`, so an asset server from here can be
 * handed straight to `render({ assets })` without an adapter between them.
 */
export interface ScriptEntry {
  /** Public URL of the entry module, for a `<script type="module" src>`. */
  href: string
  /** The graph behind it, for `<link rel="modulepreload">`. See {@link DenoAssetServer.getPreloads}. */
  preloads: string[]
  /**
   * The import map the browser needs to resolve the entry's imports.
   *
   * Always empty here, and that is not a gap: every specifier is rewritten to a served URL at
   * compile time, so nothing bare is left for a browser to resolve. The field exists because a
   * renderer asks for it, and an empty map is the honest answer rather than a missing one.
   */
  importMap: { imports: Record<string, string>; scopes?: Record<string, Record<string, string>> }
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
  /**
   * The public URL for a client entry, named however the caller has it.
   *
   * Same answer as {@link DenoAssetServer.entryUrl}, but an entry may also be named by its absolute
   * path or its `file:` URL — which is what `clientEntry(import.meta.url, …)` hands a renderer, and
   * what makes this pair with `render({ assets })` from `@remix-run/render-middleware`.
   *
   * @param entry The entrypoint as configured, an absolute path, or a `file:` URL
   * @returns The URL path
   */
  getHref(entry: string): Promise<string>
  /**
   * Every module a browser needs for an entry, shallowest first, the entry itself included.
   *
   * For putting in `<link rel="modulepreload">`: the browser starts fetching the whole graph at
   * once instead of discovering each level after the last one parses.
   *
   * @param entry One entry, or several, named as {@link DenoAssetServer.getHref} accepts
   * @returns Public URL paths, deduplicated, in breadth-first order
   */
  getPreloads(entry: string | readonly string[]): Promise<string[]>
  /**
   * Everything a renderer needs to load one client entry: the URL, the graph behind it, and the
   * import map to resolve it with.
   *
   * This is what `render({ assets })` from `@remix-run/render-middleware` asks for — one call
   * rather than the `getHref` and `getPreloads` pair it used before. The two remain, because a
   * caller that wants only a URL should not have to destructure three things to get it.
   *
   * @param entry The entry, named as {@link DenoAssetServer.getHref} accepts
   * @returns The entry's URL, its preloads, and its import map
   */
  getScriptEntry(entry: string): Promise<ScriptEntry>
  /** Every served module, as `resolved specifier -> public path`. Useful for debugging and tests. */
  moduleUrls(): Map<string, string>
  /** Rebuilds the graph and recompiles. Call after sources change. */
  reload(): Promise<void>
}

/** Thrown when an entrypoint cannot be compiled or is not one of the configured entrypoints. */
export class AssetCompilationError extends Error {
  override name = 'AssetCompilationError'

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
  }
}

/**
 * Compiles the entrypoints and returns a server for the resulting modules.
 *
 * Runs entirely in-process. Needs `--allow-read`, `--allow-env`, and `--allow-net` on first compile
 * if anything is not already in the Deno cache — but no `--allow-run`.
 *
 * @param options Configuration
 * @returns The compiled asset server
 *
 * @example
 * ```ts
 * import { createRouter } from '@remix-run/fetch-router'
 * import { createAssetServer } from '@remix-kbn/assets-deno'
 *
 * let assets = await createAssetServer({
 *   rootDir: new URL('.', import.meta.url).pathname,
 *   entrypoints: ['client/nav_auth.tsx', 'client/signin_card.tsx'],
 *   configPath: 'client/deno.json',
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

  let state = await compile(options, rootDir, basePath)

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
          'content-type': module.contentType ?? 'text/javascript; charset=utf-8',
          etag: module.etag,
          'cache-control': cacheControl,
        },
      })
    },

    entryUrl(entrypoint: string): string {
      return hrefFor(state, entrypoint, rootDir)
    },

    // Both are async because that is the shape a renderer expects of an asset server — and because
    // a bad entry should reject rather than throw past the caller's `await`.
    async getHref(entry: string): Promise<string> {
      return hrefFor(state, entry, rootDir)
    },

    async getPreloads(entry: string | readonly string[]): Promise<string[]> {
      return preloadsFor(state, entry, rootDir)
    },

    async getScriptEntry(entry: string): Promise<ScriptEntry> {
      return {
        href: hrefFor(state, entry, rootDir),
        preloads: preloadsFor(state, entry, rootDir),
        importMap: { imports: {} },
      }
    },

    moduleUrls(): Map<string, string> {
      return state.registry.entries()
    },

    async reload(): Promise<void> {
      state = await compile(options, rootDir, basePath)
    },
  }
}

/**
 * Every module a browser needs for one or more entries, shallowest first.
 *
 * Breadth-first, so a module is preloaded before the ones it pulls in — which is the order a
 * browser would have discovered them in, minus the waiting.
 *
 * @param state The current compile
 * @param entry One entry, or several, named as {@link hrefFor} accepts
 * @param rootDir What a relative entrypoint resolves against
 * @returns Public URL paths, deduplicated, in breadth-first order
 */
function preloadsFor(
  state: ServerState,
  entry: string | readonly string[],
  rootDir: string,
): string[] {
  let ordered: string[] = []
  let queue = (Array.isArray(entry) ? entry : [entry as string])
    .map((one) => hrefFor(state, one, rootDir))

  while (queue.length > 0) {
    let next = queue.shift()!
    if (ordered.includes(next)) continue
    ordered.push(next)
    queue.push(...(state.imports.get(next) ?? []))
  }

  return ordered
}

/**
 * The public URL of an entry, whichever way it is named.
 *
 * @param state The current compile
 * @param entry An entrypoint as configured, an absolute path, or a `file:` URL
 * @param rootDir What a relative entrypoint resolves against
 * @returns The public URL path
 */
function hrefFor(state: ServerState, entry: string, rootDir: string): string {
  let url = state.entryUrls.get(entry) ??
    state.entryFiles.get(
      entry.startsWith('file://')
        ? decodeURIComponent(new URL(entry).pathname)
        : path.resolve(rootDir, entry),
    )

  if (url === undefined) {
    throw new AssetCompilationError(
      `"${entry}" is not one of this asset server's entrypoints. ` +
        `Known entrypoints: ${[...state.entryUrls.keys()].join(', ')}.`,
    )
  }

  return url
}

async function compile(
  options: AssetServerOptions,
  rootDir: string,
  basePath: string,
): Promise<ServerState> {
  // Expanded here rather than in each mode, so both see the same list and a glob means the same
  // thing whichever way the site is compiled.
  let resolved = {
    ...options,
    entrypoints: await expandEntrypoints(options.entrypoints, rootDir),
  }

  return options.mode === 'bundle'
    ? buildBundle(resolved, rootDir, basePath)
    : buildModules(resolved, rootDir, basePath)
}

async function buildModules(
  options: AssetServerOptions,
  rootDir: string,
  basePath: string,
): Promise<ServerState> {
  let entrySpecifiers = options.entrypoints.map((entrypoint) => ({
    entrypoint,
    specifier: toFileUrl(entrypoint, rootDir),
  }))

  let loaderOptions: LoadModuleGraphOptions = {
    configPath: options.configPath
      ? toFileUrlFromPath(path.resolve(rootDir, options.configPath))
      : undefined,
    platform: options.platform,
    nodeConditions: options.nodeConditions,
  }

  let graph = await loadModuleGraph(
    entrySpecifiers.map((entry) => entry.specifier),
    loaderOptions,
  )

  let registry = new PathRegistry(basePath)

  // Pass 1: give every module a URL before rewriting anything, so a rewrite can always look up the
  // target it needs regardless of the order modules are visited in.
  for (let specifier of graph.modules.keys()) {
    registry.register(specifier, candidatePathFor(specifier, { rootDir }))
  }

  // Pass 2: emit each module with its imports pointing at the URLs assigned above.
  let modules = new Map<string, ServedModule>()
  for (let module of graph.modules.values()) {
    let urlFor = (specifier: string): string | null => {
      let resolved = module.dependencies.get(specifier)
      return resolved === undefined ? null : registry.pathFor(resolved) ?? null
    }

    let code
    if (module.commonJs) {
      // A CJS body is not valid in a browser at all, so it is wrapped rather than rewritten: its
      // `require()` targets become real imports and its exports are re-published as ESM.
      let imports = new Map<string, string>()
      for (let specifier of module.dependencies.keys()) {
        let url = urlFor(specifier)
        if (url !== null) imports.set(specifier, url)
      }

      code = wrapCommonJs(module.code, {
        imports,
        namedExports: module.namedExports,
        filename: filenameOf(module.specifier),
        dirname: dirnameOf(module.specifier),
      })
    } else {
      code = await rewriteImports(module.code, urlFor)
    }

    modules.set(module.specifier, { code, etag: await etagFor(code) })
  }

  // What each module imports, as public paths — the same graph the rewrite above just walked.
  let imports = new Map<string, string[]>()
  for (let module of graph.modules.values()) {
    let from = registry.pathFor(module.specifier)
    if (from === undefined) continue

    let targets: string[] = []
    for (let resolved of module.dependencies.values()) {
      let target = registry.pathFor(resolved)
      if (target !== undefined && !targets.includes(target)) targets.push(target)
    }

    if (targets.length > 0) imports.set(from, targets)
  }

  let entryUrls = new Map<string, string>()
  let entryFiles = new Map<string, string>()
  for (let { entrypoint, specifier } of entrySpecifiers) {
    let resolved = graph.roots.get(specifier)
    let publicPath = resolved === undefined ? undefined : registry.pathFor(resolved)
    if (publicPath === undefined) {
      throw new AssetCompilationError(
        `Entrypoint "${entrypoint}" produced no module. ` +
          `Check that the path exists and is reachable from rootDir.`,
      )
    }

    entryUrls.set(entrypoint, publicPath)
    entryFiles.set(filenameOf(specifier), publicPath)
  }

  return { registry, modules, entryUrls, entryFiles, imports }
}

/** The `__filename` a wrapped CJS module sees. Informational only — nothing reads the disk. */
function filenameOf(specifier: string): string {
  return specifier.startsWith('file://')
    ? decodeURIComponent(new URL(specifier).pathname)
    : specifier
}

/** The `__dirname` a wrapped CJS module sees. */
function dirnameOf(specifier: string): string {
  let filename = filenameOf(specifier)
  let index = filename.lastIndexOf('/')
  return index <= 0 ? '/' : filename.slice(0, index)
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
