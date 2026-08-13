/**
 * Module resolution and loading, delegated to Deno.
 *
 * This is the piece `@remix-run/assets` cannot provide: its resolver is `oxc-resolver`, which only
 * knows `node_modules`, so a `jsr:` specifier never resolves. Here everything comes from
 * `@deno/loader` — the same resolver and loader the Deno CLI uses — so JSR, npm, `deno.json` import
 * maps, and workspace members resolve exactly the way the running Deno process resolves them, and
 * TypeScript/JSX arrives already transpiled. There is no resolution logic of our own to keep in
 * sync, and no subprocess.
 */

import { RequestedModuleType, ResolutionMode, Workspace } from '@deno/loader'
import { init, parse } from 'es-module-lexer'

import { collectRequires, detectNamedExports, initCommonJsLexer, isCommonJs } from './cjs.ts'

/** One module, loaded and transpiled, with its imports resolved. */
export interface LoadedModule {
  /** The resolved specifier this module is keyed by. */
  specifier: string
  /** The transpiled JavaScript. For a CommonJS module this is the unwrapped body. */
  code: string
  /**
   * Authored specifier -> resolved specifier, for every import that resolved. For a CommonJS
   * module these are its `require()` specifiers.
   */
  dependencies: Map<string, string>
  /**
   * Whether this module is CommonJS and must be wrapped as an ES module before a browser can load
   * it. Browsers run ES modules only, so an unwrapped body would fail on `module is not defined`.
   */
  commonJs: boolean
  /** Names to re-export individually when wrapping, so `import { x } from …` keeps working. */
  namedExports: string[]
}

/** Every module reachable from the entrypoints. */
export interface ModuleGraph {
  /** Entrypoint, exactly as requested, -> its resolved specifier. */
  roots: Map<string, string>
  /** Resolved specifier -> module. */
  modules: Map<string, LoadedModule>
}

/** Options for {@link loadModuleGraph}. */
export interface LoadModuleGraphOptions {
  /** Path or `file:` URL of the `deno.json` supplying the import map and compiler options. */
  configPath?: string
  /**
   * Resolution platform. Defaults to `'browser'`, since these modules are served to browsers and
   * packages should resolve their browser-conditioned exports.
   */
  platform?: 'browser' | 'node'
  /** Node resolution conditions for `package.json` exports. */
  nodeConditions?: string[]
  /** Skip config file discovery entirely. */
  noConfig?: boolean
  /** Ignore the lockfile. */
  noLock?: boolean
}

/** Thrown when an entrypoint or one of its imports cannot be resolved or loaded. */
export class ModuleGraphError extends Error {
  override name = 'ModuleGraphError'
  /** The entrypoint or specifier that failed. */
  specifier: string

  constructor(specifier: string, detail: string, options?: { cause?: unknown }) {
    super(`Failed to build the module graph for "${specifier}". ${detail}`, options)
    this.specifier = specifier
  }
}

/**
 * Resolves, loads, and transpiles every module reachable from the entrypoints.
 *
 * Runs in-process — no `deno` subprocess, so no `--allow-run`. Reading sources and fetching
 * anything not already in the Deno cache still need `--allow-read` / `--allow-net`.
 *
 * @param entrypoints Absolute `file:` URLs of the client entrypoints
 * @param options Resolution options
 * @returns The loaded graph
 */
export async function loadModuleGraph(
  entrypoints: readonly string[],
  options: LoadModuleGraphOptions = {},
): Promise<ModuleGraph> {
  await initLexer()
  await initCommonJsLexer()

  using workspace = new Workspace({
    configPath: options.configPath,
    platform: options.platform ?? 'browser',
    nodeConditions: options.nodeConditions,
    noConfig: options.noConfig,
    noLock: options.noLock,
  })

  using loader = await workspace.createLoader()

  let diagnostics = await loader.addEntrypoints([...entrypoints])
  if (diagnostics.length > 0) {
    throw new ModuleGraphError(
      entrypoints[0] ?? '(no entrypoints)',
      diagnostics.map((diagnostic) => diagnostic.message).join('; '),
    )
  }

  let modules = new Map<string, LoadedModule>()
  let roots = new Map<string, string>()

  for (let entrypoint of entrypoints) {
    let resolved = resolveSpecifier(loader, entrypoint, undefined)
    if (resolved === null) {
      throw new ModuleGraphError(entrypoint, 'The entrypoint itself did not resolve.')
    }

    roots.set(entrypoint, resolved)
    await walk(loader, resolved, modules)
  }

  return { roots, modules }
}

/** The subset of `@deno/loader`'s `Loader` this module uses. */
type LoaderLike = Awaited<ReturnType<Workspace['createLoader']>>

/**
 * Loads a module and everything it imports, depth-first.
 *
 * Each module is recorded before its dependencies are visited, so an import cycle terminates.
 */
async function walk(
  loader: LoaderLike,
  specifier: string,
  modules: Map<string, LoadedModule>,
): Promise<void> {
  if (modules.has(specifier)) return

  let code = await loadCode(loader, specifier)
  if (code === null) {
    // An `external` response means Deno resolved it but has no module body to give us — a node:
    // builtin, say. Leaving it out means the rewriter keeps the specifier as authored.
    return
  }

  let esmSpecifiers = staticSpecifiers(code)
  let commonJs = isCommonJs(code, esmSpecifiers.length > 0)

  let module: LoadedModule = {
    specifier,
    code,
    dependencies: new Map(),
    commonJs,
    namedExports: commonJs ? detectNamedExports(code) : [],
  }
  // Recorded before recursing so an import cycle terminates.
  modules.set(specifier, module)

  // A CJS module's dependencies are its `require()` calls, and they resolve under Node's require
  // semantics rather than ESM's — extensionless and directory specifiers only work that way.
  let authoredSpecifiers = commonJs ? collectRequires(code) : esmSpecifiers
  let mode = commonJs ? ResolutionMode.Require : ResolutionMode.Import

  for (let authored of authoredSpecifiers) {
    let resolved = resolveSpecifier(loader, authored, specifier, mode)
    if (resolved === null) continue

    module.dependencies.set(authored, resolved)
    await walk(loader, resolved, modules)
  }
}

async function loadCode(loader: LoaderLike, specifier: string): Promise<string | null> {
  let response
  try {
    response = await loader.load(specifier, RequestedModuleType.Default)
  } catch (error) {
    throw new ModuleGraphError(
      specifier,
      error instanceof Error ? error.message : String(error),
      { cause: error },
    )
  }

  if (response.kind !== 'module') return null

  let code: unknown = response.code
  if (typeof code === 'string') return code
  if (code instanceof Uint8Array) return new TextDecoder().decode(code)
  return null
}

/**
 * Resolves one specifier, returning `null` rather than throwing when Deno cannot.
 *
 * A `node:` builtin or an unresolvable optional import should leave the specifier untouched in the
 * output rather than fail the whole build; the emitted module then names it exactly as authored.
 */
function resolveSpecifier(
  loader: LoaderLike,
  specifier: string,
  referrer: string | undefined,
  mode: ResolutionMode = ResolutionMode.Import,
): string | null {
  try {
    return loader.resolveSync(specifier, referrer, mode)
  } catch {
    return null
  }
}

let lexerReady: Promise<void> | undefined

function initLexer(): Promise<void> {
  return (lexerReady ??= init as unknown as Promise<void>)
}

/**
 * Lists the statically analyzable import specifiers in a module.
 *
 * Uses the same lexer as the rewriter, so the set discovered here is exactly the set that will be
 * rewritten later — a module cannot be reached during the walk and then missed during the rewrite.
 */
function staticSpecifiers(code: string): string[] {
  let imports
  try {
    ;[imports] = parse(code)
  } catch {
    return []
  }

  let specifiers = new Set<string>()
  for (let record of imports) {
    if (record.n !== undefined) specifiers.add(record.n)
  }

  return [...specifiers]
}
