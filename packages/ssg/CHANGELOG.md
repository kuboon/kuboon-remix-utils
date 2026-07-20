# `remix-ssg` CHANGELOG

This is the changelog for [`remix-ssg`](https://github.com/kuboon/kuboon-remix-utils/tree/main/packages/ssg). It follows [semantic versioning](https://semver.org/).

## 0.2.0

- **Breaking:** the main entry (`@kuboon/remix-ssg`) is now free of `node:*` imports and depends only on web standards (`Request`/`Response`/`URL`). The filesystem-writing entry points `prerender` and `writeResult` moved to the new `@kuboon/remix-ssg/node` subpath.
- Added `toOutput(result)`, the runtime-agnostic transform that turns a `CrawlResult` into the `OutputFile` (`{ path, content }`) to write, so consumers can render a static site with any runtime's filesystem (or none).

## 0.1.0

- Initial release of `@kuboon/remix-ssg`, a static site generator (prerenderer) for `remix/fetch-router`, published to JSR from the `kuboon-remix-utils` repository via the shared `kuboon/workflows` release workflow.
