/**
 * On-demand asset server for [`remix/fetch-router`](https://github.com/remix-run/remix/tree/main/packages/fetch-router),
 * built on Deno's own resolver and loader — so **JSR imports work**.
 *
 * Renamed from `@kuboon/remix-assets-deno` at 0.8.0; the `remix-` prefix went with the move, because the
 * scope says it now. The old name stops at 0.7.1 and stays on JSR — nothing was unpublished.
 *
 * @module
 */

export { AssetCompilationError, createAssetServer } from './lib/server.ts'
export type { AssetServerOptions, DenoAssetServer, ScriptEntry } from './lib/server.ts'
export { buildBundle, BundleError } from './lib/bundle.ts'
export type { BundleMessage, BundleModeOptions } from './lib/bundle.ts'
export type { ServedModule, ServerState } from './lib/state.ts'
export { loadModuleGraph, ModuleGraphError } from './lib/loader.ts'
export type { LoadedModule, LoadModuleGraphOptions, ModuleGraph } from './lib/loader.ts'
export { candidatePathFor, PathRegistry } from './lib/paths.ts'
export { rewriteImports } from './lib/rewrite.ts'
export type { SpecifierResolver } from './lib/rewrite.ts'
export {
  collectRequires,
  detectNamedExports,
  initCommonJsLexer,
  isCommonJs,
  wrapCommonJs,
} from './lib/cjs.ts'
export type { WrapCommonJsOptions } from './lib/cjs.ts'
