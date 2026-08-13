# `remix-assets-deno` CHANGELOG

This is the changelog for [`remix-assets-deno`](https://github.com/kuboon/kuboon-remix-utils/tree/main/packages/assets-deno). It follows [semantic versioning](https://semver.org/).

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
