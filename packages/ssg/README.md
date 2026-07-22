# remix-ssg

Static site generation (SSG) for [`remix/fetch-router`](https://github.com/remix-run/remix/tree/main/packages/fetch-router). Pre-render a Remix router to static HTML files at build time.

`remix-ssg` drives your router in-process with `router.fetch()`, spiders the links and asset references in the rendered HTML, and writes every response to disk as a static site. Rendering happens inside your router (via `remix/ui/server`), so this package adds the crawl-and-write layer, not a renderer. It is a generalized extraction of the prerenderer that builds the Remix docs site.

## Features

- **Router-driven** — works with any `remix/fetch-router` router (or any `fetch`-shaped object); no framework lock-in
- **Link-crawling** — seed a few paths and it discovers the rest by following rendered `<a>`/asset links (honoring `nofollow`)
- **Hydration-safe** — preserves Remix UI hydration comment markers and rewrites TS/JSX asset extensions to `.js` for static hosting
- **Runtime-agnostic core** — the main entry (`crawl`, `toOutput`, `rewriteExtensionsToJs`) depends only on web standards (`Request`/`Response`/`URL`); all filesystem writing lives in the optional `@kuboon/remix-ssg/node` subpath

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

Batteries-included, writing to disk with Node's `fs` — import it from the `/node` subpath:

```ts
import { createRouter } from 'remix/fetch-router'
import { prerender } from '@kuboon/remix-ssg/node'

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

### Runtime-agnostic (no Node)

The main entry has no `node:*` imports. Crawl the router and transform each response into an
`OutputFile` (`{ path, content }`) yourself, then write it with whatever your runtime provides:

```ts
import { crawl, toOutput } from '@kuboon/remix-ssg'

for await (let result of crawl(router, { paths: ['/'] })) {
  let file = await toOutput(result)
  if (!file) continue // 204 No Content
  // `file.path` is relative to the site root; `file.content` is a string or Uint8Array.
  await myWriteFile(`build/site/${file.path}`, file.content)
}
```

## API

### Main entry (`@kuboon/remix-ssg`) — no Node

### `crawl(router, options): AsyncIterableIterator<CrawlResult>`

The low-level spider. Drives `router.fetch()` from the seed paths, follows rendered links/assets, and yields `{ pathname, filepath, response }`.

By default a page that responds non-OK aborts the crawl with a `CrawlError`. The error carries structured `failures` — `{ pathname, status, statusText, referrer }`, where `referrer` is the page whose HTML linked to the broken path — so you can see _which page_ produced the bad link instead of parsing a message string. Pass `onError` to keep crawling past broken links:

```ts
import { crawl, CrawlError } from '@kuboon/remix-ssg'

let broken: CrawlFailure[] = []
for await (
  let result of crawl(router, {
    paths: ['/'],
    onError: (failure) => {
      broken.push(failure) // { pathname, status, referrer }
      return 'skip' // keep crawling; or 'throw' to abort here
    },
  })
) {
  // …write result…
}
if (broken.length) console.warn(`${broken.length} broken link(s)`, broken)
```

`onError` accepts `'throw'` (default), `'skip'`, or a function returning either.

### `toOutput(result): Promise<OutputFile | null>`

Transforms one `CrawlResult` into the `{ path, content }` to write (extensions rewritten, HTML/script/raw handled), or `null` for a `204`. The pure, filesystem-free half of writing a page.

### `rewriteExtensionsToJs(html): string`

Rewrites TS/JSX source extensions to `.js` in a rendered HTML document's asset references and inline hydration module URLs.

### Node subpath (`@kuboon/remix-ssg/node`)

### `prerender(options): Promise<PrerenderStats>`

Batteries-included, writes to disk. Options:

- `router` — the router (or `fetch`-shaped object) to render (required)
- `outDir` — directory to write the static site into (required)
- `paths` — seed pathnames to crawl from (default `['/']`)
- `publicDir` — static files copied into `outDir` before crawling (favicons, images, …)
- `spider` — follow links found in rendered HTML (default `true`)
- `concurrency` — concurrent in-flight requests (default `1`)
- `ignorePageNofollow(pathname)` — crawl a page's links even when it is marked `nofollow`
- `onError` — how to handle a non-OK page: `'throw'` (default), `'skip'`, or a function returning either (see `crawl` above)
- `onResult(result, outputPath)` — called after each result is written

Returns `{ pages, assets, files }`.

### `writeResult(outDir, result): Promise<string | null>`

Writes one `CrawlResult` to disk under `outDir` (the Node-specific half of `toOutput`), returning the absolute path written or `null` when skipped.

## Related Packages

- [`fetch-router`](https://github.com/remix-run/remix/tree/main/packages/fetch-router) - The router you prerender
- [`ui`](https://github.com/remix-run/remix/tree/main/packages/ui) - `renderToStream` / `renderToString`, the SSR engine your routes render with
- [`assets`](https://github.com/remix-run/remix/tree/main/packages/assets) - Compiles the client JS/CSS the crawler emits for hydration

## License

See [LICENSE](https://github.com/remix-run/remix/blob/main/LICENSE)
