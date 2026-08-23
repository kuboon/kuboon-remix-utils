/**
 * Bundled mode: one graph in, code-split chunks out.
 *
 * The default mode of this package serves one URL per module, which keeps a module shared by two
 * entries a single instance because the browser's module registry is keyed by URL. Bundling is the
 * *other* way to get that guarantee, and the one every major build system uses: compile all
 * entrypoints as a **single graph**, then partition it so a module reachable from more than one
 * entry lands in a shared chunk that both entries import. Rollup and webpack call this code
 * splitting; `Deno.bundle({ codeSplitting: true })` delegates to esbuild's implementation of it.
 *
 * The failure this avoids is not "bundling" — it is *bundling each entry separately*, which inlines
 * a private copy of the shared module into every output. One `Deno.bundle` call with every
 * entrypoint is what keeps the singleton a singleton.
 *
 * What this buys over module mode is what a bundler is for: far fewer requests, no import
 * waterfall, and minification. What it costs is a compile step on startup and per-module URLs in
 * devtools.
 *
 * ## No import rewriting
 *
 * The emitted chunks import each other by *relative* path (`./chunk-ABC123.js`), so serving the
 * output tree unchanged under one base path makes those resolve on their own. That is why nothing
 * here touches the code it serves.
 *
 * ## The config caveat
 *
 * `Deno.bundle` has no config option: it resolves the import map and `compilerOptions` from the
 * config the *process* started with, so {@link AssetServerOptions.configPath} cannot be honored
 * here (`Deno.chdir` does not help — the config is bound at startup). In practice this is what you
 * want, because a server started from its own project directory already resolves the right config.
 */

import * as path from 'node:path'

import { PathRegistry, toJsExtension } from './paths.ts'
import type { ServedModule, ServerState } from './state.ts'

/**
 * The slice of `Deno.bundle` this module uses, declared structurally.
 *
 * `Deno.bundle`'s own types only exist when the process was type-checked with `--unstable-bundle`,
 * and a consumer of this package should not have to enable an unstable flag just to type-check
 * their own code. So the API is described here and reached through a cast.
 */
interface BundleApi {
  (options: {
    entrypoints: string[]
    outputDir?: string
    write?: boolean
    format?: 'esm' | 'cjs' | 'iife'
    codeSplitting?: boolean
    platform?: 'browser' | 'deno'
    minify?: boolean
    keepNames?: boolean
    external?: string[]
    sourcemap?: 'linked' | 'inline' | 'external'
  }): Promise<BundleResult>
}

interface BundleResult {
  success: boolean
  errors: BundleMessage[]
  warnings: BundleMessage[]
  outputFiles?: BundleOutputFile[]
}

/** One output file the bundler produced, kept in memory. */
interface BundleOutputFile {
  /** Absolute path the file *would* have been written to. */
  path: string
  /** Content hash, reused as the `ETag`. */
  hash: string
  /** The file's contents. */
  text(): string
}

/** A diagnostic from the bundler. */
export interface BundleMessage {
  text: string
  location?: { file: string; line: number; column: number } | null
}

/** Bundle-mode tuning. Ignored in `'modules'` mode. */
export interface BundleModeOptions {
  /** Minify the output. Defaults to `true` — the reason to bundle at all is bytes on the wire. */
  minify?: boolean
  /** Keep function and class names when minifying, for readable stack traces. */
  keepNames?: boolean
  /**
   * Source map style. Defaults to `'linked'`, which emits `.js.map` files alongside the chunks and
   * serves them from the same base path.
   */
  sourcemap?: 'linked' | 'inline' | 'external' | 'none'
  /** Specifiers to leave as bare imports instead of inlining, e.g. an import-mapped CDN package. */
  external?: string[]
}

/** Options {@link buildBundle} needs, a subset of `AssetServerOptions`. */
export interface BuildBundleOptions {
  entrypoints: readonly string[]
  platform?: 'browser' | 'node'
  bundle?: BundleModeOptions
}

/** Thrown when `Deno.bundle` is unavailable or reports errors. */
export class BundleError extends Error {
  override name = 'BundleError'
  /** The bundler's own diagnostics, empty when the bundler could not be reached at all. */
  messages: BundleMessage[]

  constructor(message: string, messages: BundleMessage[] = []) {
    super(message)
    this.messages = messages
  }
}

/**
 * Compiles every entrypoint in one `Deno.bundle` call and returns the chunks, ready to serve.
 *
 * @param options Entrypoints and bundle tuning
 * @param rootDir Absolute directory entrypoints resolve against
 * @param basePath Public mount point for the emitted chunks
 * @returns The served state: chunk registry, chunk bodies, and each entrypoint's public URL
 */
export async function buildBundle(
  options: BuildBundleOptions,
  rootDir: string,
  basePath: string,
): Promise<ServerState> {
  let bundle = (Deno as { bundle?: BundleApi }).bundle
  if (typeof bundle !== 'function') {
    throw new BundleError(
      'Deno.bundle is unavailable. Bundled mode needs the --unstable-bundle flag ' +
        '(e.g. `deno run --unstable-bundle -A server.ts`), or use mode: "modules" instead.',
    )
  }

  let entryPaths = options.entrypoints.map((entrypoint) => ({
    entrypoint,
    filePath: resolveEntry(entrypoint, rootDir),
  }))

  if (entryPaths.length === 0) {
    throw new BundleError('Bundled mode needs at least one entrypoint.')
  }

  // esbuild names each entry's output relative to the lowest common ancestor of all entry
  // directories ("outbase"), so that is what maps an entrypoint back to its chunk below.
  let outBase = lowestCommonDirectory(entryPaths.map((entry) => path.dirname(entry.filePath)))

  // Never written to — `write: false` keeps everything in memory. It only anchors the relative
  // paths esbuild computes between the outputs.
  let outputDir = path.join(rootDir, '.remix-assets-deno-out')

  let tuning = options.bundle ?? {}
  let sourcemap = tuning.sourcemap ?? 'linked'

  let result = await bundle({
    entrypoints: entryPaths.map((entry) => entry.filePath),
    outputDir,
    write: false,
    format: 'esm',
    // The whole point: one graph, shared modules hoisted into chunks both entries import.
    codeSplitting: true,
    platform: options.platform === 'node' ? 'deno' : 'browser',
    minify: tuning.minify ?? true,
    keepNames: tuning.keepNames,
    external: tuning.external,
    ...(sourcemap === 'none' ? {} : { sourcemap }),
  })

  if (!result.success) {
    throw new BundleError(
      `Deno.bundle failed:\n${formatMessages(result.errors)}`,
      result.errors,
    )
  }

  let registry = new PathRegistry(basePath)
  let modules = new Map<string, ServedModule>()

  for (let file of result.outputFiles ?? []) {
    let relative = path.relative(outputDir, file.path)
    registry.register(file.path, relative)
    modules.set(file.path, {
      code: file.text(),
      // esbuild already hashed the contents; no reason to hash them again.
      etag: `"${file.hash}"`,
      contentType: contentTypeFor(relative),
    })
  }

  let entryUrls = new Map<string, string>()
  for (let { entrypoint, filePath } of entryPaths) {
    let expected = path.join(outputDir, toJsExtension(path.relative(outBase, filePath)))
    let publicPath = registry.pathFor(expected)
    if (publicPath === undefined) {
      throw new BundleError(
        `Entrypoint "${entrypoint}" produced no output chunk. ` +
          `Expected "${path.relative(outputDir, expected)}", but the bundler emitted: ` +
          `${[...registry.entries().keys()].map((p) => path.relative(outputDir, p)).join(', ')}.`,
      )
    }

    entryUrls.set(entrypoint, publicPath)
  }

  return { registry, modules, entryUrls }
}

function resolveEntry(entrypoint: string, rootDir: string): string {
  if (entrypoint.startsWith('file://')) return decodeURIComponent(new URL(entrypoint).pathname)
  return path.resolve(rootDir, entrypoint)
}

/**
 * The deepest directory containing all of the given directories — esbuild's `outbase`.
 *
 * With a single entrypoint that is just its own directory, so `src/client.tsx` emits `client.js` at
 * the output root rather than `src/client.js`.
 */
function lowestCommonDirectory(directories: string[]): string {
  let [first, ...rest] = directories
  let common = first.split('/')

  for (let directory of rest) {
    let segments = directory.split('/')
    let length = 0
    while (
      length < common.length && length < segments.length && common[length] === segments[length]
    ) {
      length++
    }
    common = common.slice(0, length)
  }

  return common.join('/') || '/'
}

function contentTypeFor(relativePath: string): string {
  if (relativePath.endsWith('.map')) return 'application/json; charset=utf-8'
  if (relativePath.endsWith('.css')) return 'text/css; charset=utf-8'
  return 'text/javascript; charset=utf-8'
}

function formatMessages(messages: BundleMessage[]): string {
  return messages
    .map((message) => {
      let where = message.location
        ? ` (${message.location.file}:${message.location.line}:${message.location.column})`
        : ''
      return `  ${message.text}${where}`
    })
    .join('\n')
}
