# remix-assets-deno

On-demand asset server for [`remix/fetch-router`](https://github.com/remix-run/remix/tree/main/packages/fetch-router), built on Deno's own module resolution — so **JSR imports work**.

This is the JSR-capable counterpart of [`@remix-run/assets`](https://github.com/remix-run/remix/tree/main/packages/assets). That package resolves imports with `oxc-resolver`, which only understands `node_modules`, so a `jsr:` specifier never resolves — and `nodeModulesDir: "auto"` does not help, because Deno keeps JSR packages in its global cache and materializes only npm packages into `node_modules`. Here the module graph comes from `deno info`, so JSR, npm, `deno.json` import maps, and workspace members all resolve exactly the way the running Deno process resolves them.

## Why not just bundle?

Because bundling each client entry separately breaks singletons.

If three client entries all `import { sessionStore } from './session.ts'`, a bundler that compiles each entry independently inlines a **separate copy** of `session.ts` into each bundle. Module-level state is then per-bundle, so the "singleton" is really three instances — the usual workaround being to anchor the instance on `globalThis` behind a symbol.

This server does not bundle. Every module gets exactly one URL, so all three entries import the _same_ URL, and the browser's module registry evaluates it once. The singleton is a singleton because module identity is preserved.

> [!TIP]
> If you are happy keeping a build step, `Deno.bundle({ codeSplitting: true, format: 'esm' })` also fixes the duplicate-singleton problem by emitting shared chunks. Reach for this package when you want no build step and per-module URLs.

## Features

- **JSR + npm + import maps** — resolution comes from `deno info`, not a reimplementation
- **True module identity** — one resolved specifier, one URL, one instance
- **No bundling, no build step** — compile on startup, serve from memory
- **Readable URLs** — `/assets/app/client/session.js`, `/assets/jsr/@kuboon/dpop/0.1.2/client/mod.js`
- **Conditional requests** — `ETag` + `304`, so reloads are cheap

## Installation

```sh
deno add jsr:@kuboon/remix-assets-deno
```

## Usage

```ts
import { createRouter } from '@remix-run/fetch-router'
import { createAssetServer } from '@kuboon/remix-assets-deno'

let assets = await createAssetServer({
  rootDir: new URL('..', import.meta.url).pathname,
  entrypoints: ['client/nav_auth.tsx', 'client/signin_card.tsx', 'client/push_card.tsx'],
  configPath: 'client/deno.json',
  compilerOptions: { jsx: 'react-jsx', jsxImportSource: '@remix-run/ui' },
})

let router = createRouter()
router.map('/assets/*path', ({ request }) => assets.fetch(request))
```

Then point each entry's `<script>` at its public URL:

```tsx
<script async type='module' src={assets.entryUrl('client/nav_auth.tsx')} />
```

Run with `--allow-run --allow-read --allow-env --allow-net`. `--allow-run` is for `deno info`, which builds the graph at startup; `--allow-net` is only needed when something is not already in the Deno cache.

### Deleting the globalThis singleton workaround

With one URL per module, module-level state is genuinely shared:

```ts
// Before: anchored on globalThis because each entry got its own copy.
const STORE_KEY = Symbol.for('kbn.dpop-session-store')
export const sessionStore = (globalThis[STORE_KEY] ??= new DpopSessionStore())

// After: a plain module-level instance.
export const sessionStore: DpopSessionStore = new DpopSessionStore()
```

### Import maps and JSR subpaths

`deno.json`'s `imports` special-cases JSR, so `"@std/encoding": "jsr:@std/encoding@^1"` covers subpaths. A **standalone** import map follows the import-maps spec strictly, so subpaths need their own trailing-slash entry:

```json
{
  "imports": {
    "@std/encoding": "jsr:@std/encoding@^1",
    "@std/encoding/": "jsr:/@std/encoding@^1/"
  }
}
```

## API

### `createAssetServer(options): Promise<DenoAssetServer>`

- `entrypoints` — client entrypoints, relative to `rootDir` or absolute `file:` URLs (required)
- `rootDir` — directory entrypoints resolve against, and the anchor for npm resolution (default `Deno.cwd()`)
- `basePath` — public mount point (default `'/assets'`)
- `configPath` — `deno.json` supplying the import map
- `importMap` — a standalone import map, when it is not in `configPath`
- `compilerOptions` — forwarded to the transpiler, e.g. `{ jsx, jsxImportSource }`
- `cacheControl` — `Cache-Control` for served modules (default `'no-cache'`)
- `denoExecPath` — the `deno` binary used for `deno info` (default `Deno.execPath()`)

The returned server has `fetch(request)`, `entryUrl(entrypoint)`, `moduleUrls()`, `basePath`, and `reload()`.

### Lower-level pieces

`loadModuleGraph` / `graphFromInfo` (the `deno info` graph, with each authored specifier paired to what Deno resolved it to), `PathRegistry` / `candidatePathFor` (the specifier ↔ URL bijection), and `rewriteImports` (specifier rewriting via `es-module-lexer`) are exported for building your own pipeline.

## Scope

Deliberately not covered in `0.1.0`: CSS and other non-script assets, fingerprinted URLs, file watching, source maps, and minification. Scripts and their transitive graph only. Compilation happens once at startup; call `reload()` after sources change.

Dynamic `import()` is rewritten only when its argument is a string literal — there is nothing to resolve at build time otherwise.

## Related Packages

- [`@remix-run/assets`](https://github.com/remix-run/remix/tree/main/packages/assets) - the Node-oriented original, for `node_modules`-only projects
- [`@deno/emit`](https://jsr.io/@deno/emit) - the transpiler this builds on
- [`fetch-router`](https://github.com/remix-run/remix/tree/main/packages/fetch-router) - the router you mount it on

## License

See [LICENSE](https://github.com/remix-run/remix/blob/main/LICENSE)
