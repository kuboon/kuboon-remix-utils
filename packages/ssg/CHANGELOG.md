# `remix-ssg` CHANGELOG

This is the changelog for [`remix-ssg`](https://github.com/kuboon/kuboon-remix-utils/tree/main/packages/ssg). It follows [semantic versioning](https://semver.org/).

## 0.4.0

- Added `@kuboon/remix-ssg/site` and two CLI entries, `build.ts` and `dev.ts`. Three directories compose into one handler: `islands/` compiled as a single code-split graph, `pages/` served through the site's own transforms, `static/` served verbatim. The build crawls that handler and the dev server serves it, so moving from a static deploy to a live server is a change of deploy target rather than of code.

  ```sh
  deno run -c deno.json -P=build jsr:@kuboon/remix-ssg/build.ts
  deno run -c deno.json -P=dev   jsr:@kuboon/remix-ssg/dev.ts
  ```

  Pass `-c deno.json`: a remote main module picks up a project's config only when it is named, and both the permission set and `"unstable": ["bundle"]` come from there — so neither `-A` nor `--unstable-bundle` belongs on the command line.

- What the framework deliberately does not have: a content model, a document shell, a route table. A `FileTransform` claims the files it renders and says where they are served, and it comes from the site — which is what keeps Markdown, or any other format, and its dependencies out of this package. The layout is the site's too.

- `SiteMiddleware` names the contract everything in the pipeline satisfies — mount point, fetch, what it serves, rebuild — which `@kuboon/remix-assets-deno`'s asset server already had. `compose` treats a `404` as "not mine" and passes it along, so pages and islands share a site without knowing about each other.

- `crawl` now follows `import` out of JavaScript responses. A code-split bundle reaches its shared chunks only that way, and seeding them separately was a special case standing in for what crawling is for. One rule covers the site: what is reachable from the entry points is what gets generated.

- Added `@kuboon/remix-ssg/client` with `island()`. Islands are compiled as one graph, so a module two of them import is emitted once — and the client runtime starts from the chunk they share rather than from a runtime entrypoint a site would have to declare. An island's id is a logical name rather than a URL, because ids are evaluated in the browser too, where predicting the bundler's output naming is guesswork.

- The framework's exports depend on `remix` and `@kuboon/remix-assets-deno`. Importing `@kuboon/remix-ssg` for `crawl`/`toOutput` does not enter those module graphs, so a crawl-only consumer fetches nothing new.

## 0.3.0

- `crawl` failures are handleable rather than fatal by default: a non-OK page raises a `CrawlError` carrying structured `CrawlFailure`s (status, pathname, referrer), and `onError` takes `'throw'`, `'skip'`, or a function deciding per failure — so a build can collect broken links and fail on its own terms.

## 0.2.0

- **Breaking:** the main entry (`@kuboon/remix-ssg`) is now free of `node:*` imports and depends only on web standards (`Request`/`Response`/`URL`). The filesystem-writing entry points `prerender` and `writeResult` moved to the new `@kuboon/remix-ssg/node` subpath.
- Added `toOutput(result)`, the runtime-agnostic transform that turns a `CrawlResult` into the `OutputFile` (`{ path, content }`) to write, so consumers can render a static site with any runtime's filesystem (or none).

## 0.1.0

- Initial release of `@kuboon/remix-ssg`, a static site generator (prerenderer) for `remix/fetch-router`, published to JSR from the `kuboon-remix-utils` repository via the shared `kuboon/workflows` release workflow.
