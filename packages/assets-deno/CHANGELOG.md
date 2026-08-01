# `remix-assets-deno` CHANGELOG

This is the changelog for [`remix-assets-deno`](https://github.com/kuboon/kuboon-remix-utils/tree/main/packages/assets-deno). It follows [semantic versioning](https://semver.org/).

## 0.1.0

- Initial release of `@kuboon/remix-assets-deno`, an on-demand asset server for `remix/fetch-router` that resolves imports through Deno rather than `node_modules`, so JSR specifiers, npm specifiers, and `deno.json` import maps all work.
- `createAssetServer(options)` compiles the entrypoints and everything they import into individually addressable ES modules and serves them with `ETag` revalidation. Because each resolved specifier gets exactly one URL, a module shared by several client entries is evaluated once by the browser — module-level singletons stay singletons without a `globalThis` anchor.
- Lower-level pieces are exported for custom pipelines: `loadModuleGraph` / `graphFromInfo`, `PathRegistry` / `candidatePathFor`, and `rewriteImports`.
