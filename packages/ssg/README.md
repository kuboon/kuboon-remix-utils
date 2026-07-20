# remix-ssg

Static site generation (SSG) for [`remix/fetch-router`](https://github.com/remix-run/remix/tree/main/packages/fetch-router). Pre-render a Remix router to static HTML files at build time.

`remix-ssg` drives your router in-process with `router.fetch()`, spiders the links and asset references in the rendered HTML, and writes every response to disk as a static site. Rendering happens inside your router (via `remix/ui/server`), so this package adds the crawl-and-write layer, not a renderer. It is a generalized extraction of the prerenderer that builds the Remix docs site.

## Features

- **Router-driven** — works with any `remix/fetch-router` router (or any `fetch`-shaped object); no framework lock-in
- **Link-crawling** — seed a few paths and it discovers the rest by following rendered `<a>`/asset links (honoring `nofollow`)
- **Hydration-safe** — preserves Remix UI hydration comment markers and rewrites TS/JSX asset extensions to `.js` for static hosting
- **Zero dependencies** — pure Node build-time tool (`node:fs`), no runtime dependencies

## Installation

This package is published to [JSR](https://jsr.io/@kuboon/remix-ssg):

```sh
npx jsr add @kuboon/remix-ssg
```

For Deno:

```sh
deno add jsr:@kuboon/remix-ssg
```

## Usage

```ts
import { createRouter } from 'remix/fetch-router'
import { prerender } from '@kuboon/remix-ssg'

let router = createRouter()
// ...map your routes (which render HTML via remix/ui/server)...

let stats = await prerender({
  router,
  outDir: 'build/site',
  paths: ['/'], // seed paths; linked pages are discovered by crawling
})

console.log(`Wrote ${stats.pages} pages and ${stats.assets} assets`)
```

Output: each HTML page is written as `<pathname>/index.html` (clean URLs), and assets are written under their URL path with TS/JSX extensions rewritten to `.js`.

## API

### `prerender(options): Promise<PrerenderStats>`

Batteries-included generator. Options:

- `router` — the router (or `fetch`-shaped object) to render (required)
- `outDir` — directory to write the static site into (required)
- `paths` — seed pathnames to crawl from (default `['/']`)
- `publicDir` — static files copied into `outDir` before crawling (favicons, images, …)
- `spider` — follow links found in rendered HTML (default `true`)
- `concurrency` — concurrent in-flight requests (default `1`)
- `ignorePageNofollow(pathname)` — crawl a page's links even when it is marked `nofollow`
- `onResult(result, outputPath)` — called after each result is written

Returns `{ pages, assets, files }`.

### `crawl(router, options): AsyncIterableIterator<CrawlResult>`

The low-level spider, for custom output handling. Yields `{ pathname, filepath, response }`.

### `writeResult(outDir, result)` / `rewriteExtensionsToJs(html)`

The disk-writing and static-HTML-rewriting helpers used by `prerender`.

## Related Packages

- [`fetch-router`](https://github.com/remix-run/remix/tree/main/packages/fetch-router) - The router you prerender
- [`ui`](https://github.com/remix-run/remix/tree/main/packages/ui) - `renderToStream` / `renderToString`, the SSR engine your routes render with
- [`assets`](https://github.com/remix-run/remix/tree/main/packages/assets) - Compiles the client JS/CSS the crawler emits for hydration

## License

See [LICENSE](https://github.com/remix-run/remix/blob/main/LICENSE)
