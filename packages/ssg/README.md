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

## The site framework

`crawl` and `toOutput` are the primitives. `@kuboon/remix-ssg/site` is the whole static site built
on them, so a project holds its content and nothing else.

```
my-site/
  deno.json           # imports, tasks, permission sets
  site.config.ts      # title, nav, content sources
  routes/
    index.tsx         # /
    about.tsx         # /about
  content/
    mod.ts            # your Markdown (or anything) handling lives here
    hello.md
  islands/
    counter.tsx       # a hydrated island
    store.ts          # a helper the islands share — not an entrypoint
  static/
    styles.css  favicon.svg
```

```sh
deno run -c deno.json -P=build jsr:@kuboon/remix-ssg/build.ts
deno run -c deno.json -P=dev   jsr:@kuboon/remix-ssg/dev.ts
```

> [!IMPORTANT]
> `-c deno.json` is not optional. A remote main module picks up a project's config only when it is
> named, and both the permission set and `"unstable": ["bundle"]` come from there. That is also
> what lets the commands run without `-A`.

```jsonc
// deno.json
{
  "tasks": {
    "build": "deno run -c deno.json -P=build jsr:@kuboon/remix-ssg/build.ts",
    "dev": "deno run -c deno.json -P=dev jsr:@kuboon/remix-ssg/dev.ts"
  },
  "unstable": ["bundle"],
  "permissions": {
    "build": {
      "read": ["."],
      "write": ["dist"],
      "env": { "allow": ["BASE_URL"], "ignore": ["NODE_ENV"] },
      "import": true
    },
    "dev": { "read": ["."], "env": { "allow": ["BASE_URL", "PORT"] }, "net": true, "import": true }
  },
  "compilerOptions": { "jsx": "react-jsx", "jsxImportSource": "remix/ui" }
}
```

### Pages

A file under `routes/` is a page; its path is its route. `index.tsx` names its own directory, so
`routes/index.tsx` is `/` and `routes/blog/index.tsx` is `/blog`.

```tsx
import type { PageMeta } from '@kuboon/remix-ssg/site'
import { Counter } from '../islands/counter.tsx'

export const meta: PageMeta = { title: 'Home', hydrate: true }

export default function Home() {
  return (
    <>
      <h1>Hello</h1>
      <Counter />
    </>
  )
}
```

`hydrate` is opt-in: a page without it ships no JavaScript at all.

### Islands

An island is a component in `islands/`, declared with `island(name, exportName, component)`.

```tsx
import { island } from '@kuboon/remix-ssg/client'

export const Counter = island('counter', 'Counter', function Counter(handle) {
  return () => <button>…</button>
})
```

Every island goes into a **single** `Deno.bundle({ codeSplitting: true })` call, so a module more
than one of them imports — the Remix UI runtime, a store they share — is emitted once into a chunk
they all load. Compiling each entry on its own is what turns a module-level singleton into one
instance per island; this never does that.

The client runtime starts from that shared chunk, which is why a site declares no runtime
entrypoint. Ids are logical names rather than URLs (`island:counter#Counter`) because an id is
evaluated in the browser too, and the server embeds the name-to-chunk map the bundler produced.

### Content

The framework never sees Markdown. A content source hands over entries whose bodies are already
rendered, so the format — and its dependencies — stay yours:

```ts
// content/mod.ts
import type { ContentEntry } from '@kuboon/remix-ssg/site'

export async function list(): Promise<ContentEntry[]> {/* read ./*.md */}
export async function get(slug: string): Promise<ContentEntry | null> {/* … */}
```

```ts
// site.config.ts
import { defineSite } from '@kuboon/remix-ssg/site'
import * as blog from './content/mod.ts'

export default defineSite({
  title: 'my site',
  nav: [{ href: '/', label: 'Home' }, { href: '/blog', label: 'Blog' }],
  content: { '/blog': blog },
})
```

`site.config.ts` is the only project file the CLI imports by path, which is what keeps a content
source's types intact — a directory the CLI globbed and imported would arrive as `any`.

### Growing a server later

The same router is crawled by `build.ts` and served by `dev.ts`, so moving from a static deploy to
a live server changes the deploy target, not the code. For the step after that, a page can declare
itself request-dependent:

```tsx
export const meta: PageMeta = { title: 'Account', dynamic: true }
```

The static build answers `204` and writes nothing for it, rather than freezing one request's answer
into a file every visitor then gets. Served live, it renders normally.

### Base paths

`BASE_URL` (or `--base`) mounts the whole site under a path prefix, as a GitHub Pages project site
or a per-PR preview needs. Links and asset URLs carry the prefix; the build strips it back off when
writing, so the output always lands at the root of `dist/`.

## Related Packages

- [`fetch-router`](https://github.com/remix-run/remix/tree/main/packages/fetch-router) - The router you prerender
- [`ui`](https://github.com/remix-run/remix/tree/main/packages/ui) - `renderToStream` / `renderToString`, the SSR engine your routes render with
- [`assets`](https://github.com/remix-run/remix/tree/main/packages/assets) - Compiles the client JS/CSS the crawler emits for hydration

## License

See [LICENSE](https://github.com/remix-run/remix/blob/main/LICENSE)
