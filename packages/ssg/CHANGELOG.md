# `remix-ssg` CHANGELOG

This is the changelog for [`remix-ssg`](https://github.com/kuboon/kuboon-remix-utils/tree/main/packages/ssg). It follows [semantic versioning](https://semver.org/).

## 0.4.0

- Added `@kuboon/remix-ssg/site` and two CLI entries, `build.ts` and `dev.ts`, which together take over everything a static site would otherwise hand-write: the deploy-prefix mount, the document shell, static file serving, client bundling, and the crawl. A site keeps `site.config.ts` and three directories — `routes/`, `islands/`, `static/` — plus whatever its content sources need.

  ```sh
  deno run -c deno.json -P=build jsr:@kuboon/remix-ssg/build.ts
  deno run -c deno.json -P=dev   jsr:@kuboon/remix-ssg/dev.ts
  ```

  Pass `-c deno.json`: a remote main module only picks up a project's config when it is named, and both the permission set and `"unstable": ["bundle"]` come from there — so neither `-A` nor `--unstable-bundle` belongs on the command line.

- Added `@kuboon/remix-ssg/client` with `island()`, the browser half. Islands are compiled as one code-split graph, so a module two of them import is emitted once — and the client runtime starts from the chunk they share rather than from a separate entrypoint a site would have to declare.

- An island's `clientEntry()` id is a logical name (`island:counter#Counter`), not a URL. Ids are evaluated in the browser too, where predicting the bundler's output naming is guesswork — it shifts with the set of entrypoints. The server embeds the name-to-chunk map it got from the bundler instead.

- Content is format-agnostic: a site's content source hands over `ContentEntry` objects whose bodies are already rendered, so Markdown — or anything else — stays the site's own business, along with its dependencies.

- Pages and islands are `.tsx`. A `.ts` module in `routes/` or `islands/` is a helper, not a page and not an entrypoint.

- A page marked `dynamic` answers `204` in the static build and renders normally when served, so a request-dependent page does not silently bake one visitor's answer into a file.

- The framework's exports depend on `remix` and `@kuboon/remix-assets-deno`. Importing `@kuboon/remix-ssg` for `crawl`/`toOutput` does not enter those module graphs, so a crawl-only consumer fetches nothing new.

## 0.3.0

- `crawl` failures are handleable rather than fatal by default: a non-OK page raises a `CrawlError` carrying structured `CrawlFailure`s (status, pathname, referrer), and `onError` takes `'throw'`, `'skip'`, or a function deciding per failure — so a build can collect broken links and fail on its own terms.

## 0.2.0

- **Breaking:** the main entry (`@kuboon/remix-ssg`) is now free of `node:*` imports and depends only on web standards (`Request`/`Response`/`URL`). The filesystem-writing entry points `prerender` and `writeResult` moved to the new `@kuboon/remix-ssg/node` subpath.
- Added `toOutput(result)`, the runtime-agnostic transform that turns a `CrawlResult` into the `OutputFile` (`{ path, content }`) to write, so consumers can render a static site with any runtime's filesystem (or none).

## 0.1.0

- Initial release of `@kuboon/remix-ssg`, a static site generator (prerenderer) for `remix/fetch-router`, published to JSR from the `kuboon-remix-utils` repository via the shared `kuboon/workflows` release workflow.
