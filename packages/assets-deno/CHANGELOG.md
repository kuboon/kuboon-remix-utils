# `remix-assets-deno` CHANGELOG

This is the changelog for [`remix-assets-deno`](https://github.com/kuboon/kuboon-remix-utils/tree/main/packages/assets-deno). It follows [semantic versioning](https://semver.org/).

## 0.4.0

- Added `mode: 'bundle'`, which compiles every entrypoint in one `Deno.bundle({ codeSplitting: true, format: 'esm' })` call so modules shared between entries are hoisted into shared chunks. This is the bundler's answer to the same duplicated-singleton problem the default per-module-URL mode solves by preserving module identity — one graph in, code-split chunks out, never one compile per entry. Minified by default, with source maps; far fewer requests than one URL per module. Requires Deno's `--unstable-bundle` flag.
- Added `bundle` options (`minify`, `keepNames`, `sourcemap`, `external`) and the `BundleError` thrown when the bundler is unavailable or reports diagnostics.
- `configPath` is documented as `'modules'`-mode only: `Deno.bundle` resolves the import map and `compilerOptions` from the config the process started with, and offers no way to override it.
- Served artifacts now carry a `Content-Type`, so bundled-mode source maps are served as JSON rather than JavaScript.

## 0.3.0

- CommonJS dependencies are now served instead of silently emitting a body no browser can run. A CJS module is wrapped as an ES module — its `require()` calls with literal specifiers hoisted to real imports and resolved under Node's require semantics, its body run with `module`, `exports`, `require`, `__filename`, `__dirname`, and `this` bound to `module.exports`, and its exports re-published as a default export plus one named export per name `cjs-module-lexer` detects.
- **Breaking:** a module whose source is `.cjs` or `.cts` is now served under a `.js` URL. The served body is an ES module, so a URL still claiming `.cjs` advertises a format the content does not have, and a client that trusts the extension rejects it.
- **Breaking:** `LoadedModule` gains `commonJs` and `namedExports`.
- What CommonJS interop does not cover: `require(someVariable)` throws at runtime rather than resolving, Node globals such as `process` and `Buffer` are not shimmed, and a CJS import cycle resolves in ESM order.

## 0.2.0

- Resolution, loading, and TypeScript/JSX transpilation now come from [`@deno/loader`](https://jsr.io/@deno/loader) instead of a `deno info --json` subprocess. Everything runs in-process, so **`--allow-run` is no longer required** — `--allow-read`, `--allow-env`, and `--allow-net` are enough. The `@deno/emit` dependency is gone too, since the loader returns modules already transpiled, and npm no longer needs a separate `createRequire` walk: one resolver now handles JSR, npm, import-map, and relative specifiers alike.
- Only the runtime graph is served. Type-only modules, which `deno info` reported and which were previously emitted as empty JavaScript, are no longer served at all.
- **Breaking:** `AssetServerOptions.importMap` is removed — pass the config file as `configPath` instead. Because `@deno/loader` reads it as a Deno config, a bare `"@std/encoding": "jsr:@std/encoding@^1"` now covers subpaths, so the trailing-slash entry a standalone import map needed is no longer necessary.
- **Breaking:** `AssetServerOptions.compilerOptions` and the `AssetCompilerOptions` type are removed. The config file's own `compilerOptions` (`jsx`, `jsxImportSource`, …) are honored automatically.
- **Breaking:** `AssetServerOptions` gains `platform` (`'browser'` by default) and `nodeConditions`.
- **Breaking:** the graph API is reshaped around the loader. `graphFromInfo` and the `GraphDependency` / `GraphModule` / `NpmPackage` types are removed; `ModuleGraph`, `LoadModuleGraphOptions`, and `loadModuleGraph`'s result change accordingly, and modules now carry their transpiled `code`. A new `LoadedModule` type is exported.
- **Breaking:** `candidatePathFor` no longer takes `npmRoots`. Files under `node_modules` are named from their last `node_modules` segment instead.

## 0.1.0

- Initial release of `@kuboon/remix-assets-deno`, an on-demand asset server for `remix/fetch-router` that resolves imports through Deno rather than `node_modules`, so JSR specifiers, npm specifiers, and `deno.json` import maps all work.
- `createAssetServer(options)` compiles the entrypoints and everything they import into individually addressable ES modules and serves them with `ETag` revalidation. Because each resolved specifier gets exactly one URL, a module shared by several client entries is evaluated once by the browser — module-level singletons stay singletons without a `globalThis` anchor.
- Lower-level pieces are exported for custom pipelines: `loadModuleGraph` / `graphFromInfo`, `PathRegistry` / `candidatePathFor`, and `rewriteImports`.
