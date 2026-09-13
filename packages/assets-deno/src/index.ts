/**
 * On-demand asset server for [`remix/fetch-router`](https://github.com/remix-run/remix/tree/main/packages/fetch-router),
 * built on Deno's own resolver and loader — so **JSR imports work**.
 *
 * ## This package has moved
 *
 * It continues as **`@remix-kbn/assets-deno`**. The `remix-` prefix goes with the move, because the scope now
 * says it.
 *
 * ```diff
 * - "@kuboon/remix-assets-deno": "jsr:@kuboon/remix-assets-deno@^0.7.0"
 * + "@remix-kbn/assets-deno": "jsr:@remix-kbn/assets-deno"
 * ```
 *
 * 0.7.1 carries this notice and nothing else — its code is 0.7.0's. What comes after it
 * is published under the new name; if `@remix-kbn/assets-deno` is not on JSR yet as you read this, that is the
 * only thing left to happen.
 *
 * Nothing breaks if you stay. JSR cannot unpublish, so every version under this name keeps
 * resolving exactly as it does today, and there is no deadline attached to moving.
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
