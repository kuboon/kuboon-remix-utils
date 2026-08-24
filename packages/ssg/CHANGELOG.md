# `remix-ssg` CHANGELOG

This is the changelog for [`remix-ssg`](https://github.com/kuboon/kuboon-remix-utils/tree/main/packages/ssg). It follows [semantic versioning](https://semver.org/).

## 0.4.0

- Added `@kuboon/remix-ssg/site`: the parts a static site is assembled from, and one CLI entry, `build.ts`. A site wires the parts together itself, in a `router.ts` it owns:

  ```ts
  export const base = normalizeBase(Deno.env.get('BASE_URL'))
  export const entryPoints = ['/']

  let islands = await createIslands({ rootDir: 'islands', basePath: `${base}/assets` })

  export default compose(
    await createFileTree({
      rootDir: 'pages',
      basePath: base,
      transforms: [markdown({ base, islandUrls: islands.urls })],
    }),
    await createFileTree({ rootDir: 'static', basePath: `${base}/static` }),
    islands,
  )
  ```

  ```sh
  deno serve -P=dev --watch router.ts
  deno run -c deno.json -P=build jsr:@kuboon/remix-ssg/build.ts
  ```

  There is no dev-server command, because `router.ts` is an ordinary module that default-exports a `fetch` — `deno serve` already is one. Pass `-c deno.json` to the build: a remote main module picks up a project's config only when it is named, and both the permission set and `"unstable": ["bundle"]` come from there, so neither `-A` nor `--unstable-bundle` belongs on the command line.

- The static host's URL-to-file rule is a swappable object, `FileServerBehavior`, and the default is `githubPages()`. It decides two things that have to agree: where the build writes each page, and how the dev server resolves a request. `serveAsHost` wraps the composed site with it — not a setting on each middleware, because which file a URL resolves to is a property of the deploy target and every part of the site has to agree on it. The shape follows [`@kuboon/file-server-behavior`](https://jsr.io/@kuboon/file-server-behavior) closely enough to accept its implementations, without depending on it.

  Two consequences worth knowing. Pages are now written as `about.html` rather than `about/index.html`, because that is the file GitHub Pages reaches for first — so a site whose links say `/about` no longer pays a redirect. And `/about/` now 404s in the dev server, as it does on the deploy, instead of quietly working.

  `crawl` gained an `outputPath` option for the same reason; its default is unchanged.

- There is no config file and no site object. Islands have to be compiled before the layout can be handed `islandUrls` — the map from an island's name to the chunk the bundler emitted, which shifts with the set of entrypoints — and in a config that ordering had to be expressed as "the config is a function so it can receive them". In a router it is the order of two statements.

- What the framework deliberately does not have: a content model, a document shell, a route table. A `FileTransform` claims the files it renders and says where they are served, and it comes from the site — which is what keeps Markdown, or any other format, and its dependencies out of this package. The layout is the site's too. Transforms are tried in order, so a site can mix formats: the fixture serves `.md` as text and `.tsx` as pages that import an island and place it, with each page loading only the chunks it names.

- `SiteMiddleware` names the contract everything composed satisfies — mount point, fetch, what it serves, rebuild — which `@kuboon/remix-assets-deno`'s asset server already had. `compose` treats a `404` as "not mine" and passes it along, so pages and islands share a site without knowing about each other.

- `crawl` now follows `import` out of JavaScript responses. A code-split bundle reaches its shared chunks only that way, and seeding them separately was a special case standing in for what crawling is for. One rule covers the site: what is reachable from `entryPoints` is what gets generated. A page nothing links to is still _served_ — it is unreachable, not unserved — so naming it in `entryPoints` is all it takes to build it.

- Added `@kuboon/remix-ssg/client` with `island()`. Islands are compiled as one graph, so a module two of them import is emitted once — and the client runtime starts from the chunk they share rather than from a runtime entrypoint a site would have to declare. An island's id is a logical name rather than a URL, because ids are evaluated in the browser too, where predicting the bundler's output naming is guesswork.

- The framework's exports depend on `remix` and `@kuboon/remix-assets-deno`. Importing `@kuboon/remix-ssg` for `crawl`/`toOutput` does not enter those module graphs, so a crawl-only consumer fetches nothing new.

## 0.3.0

- `crawl` failures are handleable rather than fatal by default: a non-OK page raises a `CrawlError` carrying structured `CrawlFailure`s (status, pathname, referrer), and `onError` takes `'throw'`, `'skip'`, or a function deciding per failure — so a build can collect broken links and fail on its own terms.

## 0.2.0

- **Breaking:** the main entry (`@kuboon/remix-ssg`) is now free of `node:*` imports and depends only on web standards (`Request`/`Response`/`URL`). The filesystem-writing entry points `prerender` and `writeResult` moved to the new `@kuboon/remix-ssg/node` subpath.
- Added `toOutput(result)`, the runtime-agnostic transform that turns a `CrawlResult` into the `OutputFile` (`{ path, content }`) to write, so consumers can render a static site with any runtime's filesystem (or none).

## 0.1.0

- Initial release of `@kuboon/remix-ssg`, a static site generator (prerenderer) for `remix/fetch-router`, published to JSR from the `kuboon-remix-utils` repository via the shared `kuboon/workflows` release workflow.
