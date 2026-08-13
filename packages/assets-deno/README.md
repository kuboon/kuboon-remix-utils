# remix-assets-deno

On-demand asset server for [`remix/fetch-router`](https://github.com/remix-run/remix/tree/main/packages/fetch-router), built on Deno's own resolver and loader — so **JSR imports work**.

This is the JSR-capable counterpart of [`@remix-run/assets`](https://github.com/remix-run/remix/tree/main/packages/assets). That package resolves imports with `oxc-resolver`, which only understands `node_modules`, so a `jsr:` specifier never resolves — and `nodeModulesDir: "auto"` does not help, because Deno keeps JSR packages in its global cache and materializes only npm packages into `node_modules`. Here resolution, loading, and TypeScript/JSX transpilation all come from [`@deno/loader`](https://jsr.io/@deno/loader), the same machinery the Deno CLI uses, so JSR, npm, `deno.json` import maps, and workspace members resolve exactly the way the running Deno process resolves them.

## Why not just bundle?

Because bundling each client entry separately breaks singletons.

If three client entries all `import { sessionStore } from './session.ts'`, a bundler that compiles each entry independently inlines a **separate copy** of `session.ts` into each bundle. Module-level state is then per-bundle, so the "singleton" is really three instances — the usual workaround being to anchor the instance on `globalThis` behind a symbol.

This server does not bundle. Every module gets exactly one URL, so all three entries import the _same_ URL, and the browser's module registry evaluates it once. The singleton is a singleton because module identity is preserved.

> [!TIP]
> If you are happy keeping a build step, `Deno.bundle({ codeSplitting: true, format: 'esm' })` also fixes the duplicate-singleton problem by emitting shared chunks. Reach for this package when you want no build step and per-module URLs.

## Features

- **JSR + npm + import maps** — resolution comes from `@deno/loader`, not a reimplementation
- **True module identity** — one resolved specifier, one URL, one instance
- **No bundling, no build step, no subprocess** — compile in-process on startup, serve from memory
- **Runtime graph only** — type-only modules are never served, because they do not exist at runtime
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
})

let router = createRouter()
router.map('/assets/*path', ({ request }) => assets.fetch(request))
```

Then point each entry's `<script>` at its public URL:

```tsx
<script async type='module' src={assets.entryUrl('client/nav_auth.tsx')} />
```

Run with `--allow-read --allow-env --allow-net`. `--allow-net` is only needed when something is not already in the Deno cache. **No `--allow-run`** — nothing is shelled out to.

Your `deno.json`'s `compilerOptions` are honored, so a JSX config like
`{ "jsx": "react-jsx", "jsxImportSource": "@remix-run/ui" }` needs no repeating here.

### Deleting the globalThis singleton workaround

With one URL per module, module-level state is genuinely shared:

```ts
// Before: anchored on globalThis because each entry got its own copy.
const STORE_KEY = Symbol.for('kbn.dpop-session-store')
export const sessionStore = (globalThis[STORE_KEY] ??= new DpopSessionStore())

// After: a plain module-level instance.
export const sessionStore: DpopSessionStore = new DpopSessionStore()
```

## API

### `createAssetServer(options): Promise<DenoAssetServer>`

- `entrypoints` — client entrypoints, relative to `rootDir` or absolute `file:` URLs (required)
- `rootDir` — directory entrypoints resolve against (default `Deno.cwd()`)
- `basePath` — public mount point (default `'/assets'`)
- `configPath` — `deno.json` supplying the import map and compiler options, relative to `rootDir`
- `platform` — resolution platform, `'browser'` (default) or `'node'`
- `nodeConditions` — extra Node resolution conditions for `package.json` exports
- `cacheControl` — `Cache-Control` for served modules (default `'no-cache'`)

The returned server has `fetch(request)`, `entryUrl(entrypoint)`, `moduleUrls()`, `basePath`, and `reload()`.

### Lower-level pieces

`loadModuleGraph` (resolve, load, and transpile everything reachable from the entrypoints, pairing each authored specifier with what Deno resolved it to), `PathRegistry` / `candidatePathFor` (the specifier ↔ URL bijection), and `rewriteImports` (specifier rewriting via `es-module-lexer`) are exported for building your own pipeline.

## Scope

Deliberately not covered in `0.1.0`: CSS and other non-script assets, fingerprinted URLs, file watching, source maps, and minification. Scripts and their transitive graph only. Compilation happens once at startup; call `reload()` after sources change.

Dynamic `import()` is rewritten only when its argument is a string literal — there is nothing to resolve at build time otherwise.

## Related Packages

- [`@remix-run/assets`](https://github.com/remix-run/remix/tree/main/packages/assets) - the Node-oriented original, for `node_modules`-only projects
- [`@deno/loader`](https://jsr.io/@deno/loader) - Deno's resolver, loader, and transpiler, which this delegates to
- [`fetch-router`](https://github.com/remix-run/remix/tree/main/packages/fetch-router) - the router you mount it on

## License

See [LICENSE](https://github.com/remix-run/remix/blob/main/LICENSE)
