/**
 * The module graph, as Deno itself sees it.
 *
 * This is the piece `@remix-run/assets` cannot provide: its resolver is `oxc-resolver`, which only
 * knows `node_modules`, so a `jsr:` specifier never resolves. Here the graph comes from
 * `deno info --json`, so JSR, npm, `deno.json` import maps, and workspace members all resolve
 * exactly the way the running Deno process resolves them — no resolution logic of our own to keep
 * in sync.
 */

/** One import as written in a module, paired with what Deno resolved it to. */
export interface GraphDependency {
  /** The specifier exactly as authored, e.g. `'./session.ts'` or `'@kuboon/dpop'`. */
  specifier: string
  /** The fully resolved specifier, or `null` when Deno could not resolve it. */
  resolved: string | null
}

/** One module in the graph, keyed by its resolved specifier. */
export interface GraphModule {
  /** The resolved specifier, e.g. `'https://jsr.io/@kuboon/dpop/0.1.2/client/mod.ts'`. */
  specifier: string
  /** Deno's module kind, e.g. `'esm'` or `'npm'`. */
  kind: string
  /** Absolute path on disk, when Deno has one. `null` for npm modules. */
  local: string | null
  /** Deno's media type, e.g. `'TSX'`. */
  mediaType: string | null
  /** The npm package id (`'@remix-run/ui@0.4.0'`) for npm modules. */
  npmPackage: string | null
  dependencies: GraphDependency[]
}

/** An npm package Deno materialized into `node_modules`. */
export interface NpmPackage {
  name: string
  version: string
  /** The package root on disk, when `nodeModulesDir` put one there. */
  localPath: string | null
}

/** The merged graph for every entrypoint. */
export interface ModuleGraph {
  /** Resolved specifiers of the entrypoints, in the order they were requested. */
  roots: string[]
  modules: Map<string, GraphModule>
  npmPackages: Map<string, NpmPackage>
  /**
   * Follows Deno's redirect table to the specifier a module is actually keyed by.
   *
   * Redirects carry two normalizations that matter: `jsr:@kuboon/dpop@^0.1.2` becomes the concrete
   * `https://jsr.io/@kuboon/dpop/0.1.2/client/mod.ts`, and the npm range in
   * `npm:@remix-run/ui@^0.4.0` becomes the locked `npm:/@remix-run/ui@0.4.0`. Dependency records
   * hold the pre-redirect form, so every lookup has to go through here.
   */
  resolve(specifier: string): string
}

/** Raw `deno info --json` shapes, narrowed to the fields this module reads. */
interface RawInfo {
  roots?: unknown
  modules?: unknown
  redirects?: unknown
  npmPackages?: unknown
}

/** Options for {@link loadModuleGraph}. */
export interface LoadModuleGraphOptions {
  /** Working directory for `deno info`. Defaults to the current directory. */
  rootDir?: string
  /** Path to a `deno.json`, passed through as `--config`. */
  configPath?: string
  /** Path to an import map, passed through as `--import-map`. */
  importMap?: string
  /** The `deno` executable to run. Defaults to {@link Deno.execPath}. */
  denoExecPath?: string
}

/** Thrown when `deno info` fails, carrying its stderr so the cause is visible. */
export class ModuleGraphError extends Error {
  override name = 'ModuleGraphError'
  /** The entrypoint whose graph failed to load. */
  entrypoint: string
  /** `deno info` stderr, or the underlying failure text. */
  detail: string

  constructor(entrypoint: string, detail: string) {
    super(`Failed to load the module graph for "${entrypoint}". ${detail}`)
    this.entrypoint = entrypoint
    this.detail = detail
  }
}

/**
 * Builds the merged module graph for every entrypoint by shelling out to `deno info --json`.
 *
 * `deno info` takes one module at a time, so this runs once per entrypoint and merges. That is a
 * startup cost, not a per-request one: the server builds the graph once and rebuilds only on
 * {@link DenoAssetServer.reload}.
 *
 * Requires `--allow-run` for the `deno` executable, plus whatever the graph itself needs to read.
 *
 * @param entrypoints Module specifiers (paths or `file:` URLs) to build the graph from
 * @param options Resolution options
 * @returns The merged graph
 */
export async function loadModuleGraph(
  entrypoints: readonly string[],
  options: LoadModuleGraphOptions = {},
): Promise<ModuleGraph> {
  let modules = new Map<string, GraphModule>()
  let npmPackages = new Map<string, NpmPackage>()
  let redirects = new Map<string, string>()
  let roots: string[] = []

  for (let entrypoint of entrypoints) {
    let raw = await runDenoInfo(entrypoint, options)
    let parsed = parseInfo(raw)

    for (let [from, to] of parsed.redirects) redirects.set(from, to)
    for (let [id, npmPackage] of parsed.npmPackages) npmPackages.set(id, npmPackage)
    for (let [specifier, module] of parsed.modules) {
      // Entrypoints share dependencies by design — that sharing is the whole point — so the first
      // record for a specifier wins and later identical ones are skipped.
      if (!modules.has(specifier)) modules.set(specifier, module)
    }

    roots.push(...parsed.roots)
  }

  return {
    roots,
    modules,
    npmPackages,
    resolve: (specifier) => followRedirects(specifier, redirects),
  }
}

/**
 * Builds a graph from an already-parsed `deno info --json` payload.
 *
 * Exposed so the graph layer can be exercised without spawning a subprocess.
 *
 * @param payloads One or more `deno info --json` results
 * @returns The merged graph
 */
export function graphFromInfo(payloads: readonly unknown[]): ModuleGraph {
  let modules = new Map<string, GraphModule>()
  let npmPackages = new Map<string, NpmPackage>()
  let redirects = new Map<string, string>()
  let roots: string[] = []

  for (let payload of payloads) {
    let parsed = parseInfo(payload)
    for (let [from, to] of parsed.redirects) redirects.set(from, to)
    for (let [id, npmPackage] of parsed.npmPackages) npmPackages.set(id, npmPackage)
    for (let [specifier, module] of parsed.modules) {
      if (!modules.has(specifier)) modules.set(specifier, module)
    }
    roots.push(...parsed.roots)
  }

  return {
    roots,
    modules,
    npmPackages,
    resolve: (specifier) => followRedirects(specifier, redirects),
  }
}

async function runDenoInfo(
  entrypoint: string,
  options: LoadModuleGraphOptions,
): Promise<unknown> {
  let args = ['info', '--json']
  if (options.configPath) args.push('--config', options.configPath)
  if (options.importMap) args.push('--import-map', options.importMap)
  args.push(entrypoint)

  let output: Deno.CommandOutput
  try {
    output = await new Deno.Command(options.denoExecPath ?? Deno.execPath(), {
      args,
      cwd: options.rootDir,
      stdout: 'piped',
      stderr: 'piped',
    }).output()
  } catch (error) {
    throw new ModuleGraphError(
      entrypoint,
      error instanceof Error ? error.message : String(error),
    )
  }

  if (!output.success) {
    throw new ModuleGraphError(entrypoint, new TextDecoder().decode(output.stderr).trim())
  }

  try {
    return JSON.parse(new TextDecoder().decode(output.stdout))
  } catch (error) {
    throw new ModuleGraphError(
      entrypoint,
      `Could not parse "deno info --json" output. ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }
}

interface ParsedInfo {
  roots: string[]
  modules: Map<string, GraphModule>
  npmPackages: Map<string, NpmPackage>
  redirects: Map<string, string>
}

function parseInfo(payload: unknown): ParsedInfo {
  let raw = (isRecord(payload) ? payload : {}) as RawInfo

  let redirects = new Map<string, string>()
  if (isRecord(raw.redirects)) {
    for (let [from, to] of Object.entries(raw.redirects)) {
      if (typeof to === 'string') redirects.set(from, to)
    }
  }

  let npmPackages = new Map<string, NpmPackage>()
  if (isRecord(raw.npmPackages)) {
    for (let [id, value] of Object.entries(raw.npmPackages)) {
      if (!isRecord(value)) continue
      npmPackages.set(id, {
        name: typeof value.name === 'string' ? value.name : id,
        version: typeof value.version === 'string' ? value.version : '',
        localPath: typeof value.localPath === 'string' ? value.localPath : null,
      })
    }
  }

  let modules = new Map<string, GraphModule>()
  if (Array.isArray(raw.modules)) {
    for (let value of raw.modules) {
      if (!isRecord(value) || typeof value.specifier !== 'string') continue
      modules.set(value.specifier, {
        specifier: value.specifier,
        kind: typeof value.kind === 'string' ? value.kind : 'esm',
        local: typeof value.local === 'string' ? value.local : null,
        mediaType: typeof value.mediaType === 'string' ? value.mediaType : null,
        npmPackage: typeof value.npmPackage === 'string' ? value.npmPackage : null,
        dependencies: parseDependencies(value.dependencies),
      })
    }
  }

  let roots = Array.isArray(raw.roots) ? raw.roots.filter((root) => typeof root === 'string') : []

  return { roots, modules, npmPackages, redirects }
}

function parseDependencies(value: unknown): GraphDependency[] {
  if (!Array.isArray(value)) return []

  let dependencies: GraphDependency[] = []
  for (let entry of value) {
    if (!isRecord(entry) || typeof entry.specifier !== 'string') continue
    // `code` is the runtime import; `type` is a types-only reference, which the browser never
    // fetches, so a dependency with only `type` resolves to null and is left alone.
    let resolved = readResolvedSpecifier(entry.code)
    dependencies.push({ specifier: entry.specifier, resolved })
  }

  return dependencies
}

function readResolvedSpecifier(value: unknown): string | null {
  if (!isRecord(value)) return null
  return typeof value.specifier === 'string' ? value.specifier : null
}

/**
 * Walks the redirect table to a fixed point, guarding against a cycle so a malformed table cannot
 * hang the server.
 */
function followRedirects(specifier: string, redirects: ReadonlyMap<string, string>): string {
  let current = specifier
  let seen = new Set<string>([current])

  while (true) {
    let next = redirects.get(current)
    if (next === undefined || seen.has(next)) return current
    seen.add(next)
    current = next
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
