# `remix-mcp` CHANGELOG

This is the changelog for [`remix-mcp`](https://github.com/kuboon/kuboon-remix-utils/tree/main/packages/mcp). It follows [semantic versioning](https://semver.org/).

## 0.2.0

- Moved to the `@remix-kbn` scope: this package is **`@remix-kbn/mcp`** from 0.2.0 on, and was `@kuboon/remix-mcp` up to 0.1.1. The `remix-` prefix goes with the move, since the scope already says it.

  ```diff
  - "@kuboon/remix-mcp": "jsr:@kuboon/remix-mcp@^0.1.1"
  + "@remix-kbn/mcp": "jsr:@remix-kbn/mcp@^0.2.0"
  ```

  No code changed with the rename. The minor bump is so that no version number exists under both names — 0.2.0 is only ever the new one — rather than because anything behaves differently.

  JSR cannot unpublish, so everything under the old name stays where it is; entries below 0.1.1 describe releases made there.

## 0.1.1

- Bumped `@remix-run/fetch-router` to `^0.21.0` (Remix v3 `beta.6`). No API change here: `0.21.0`'s only breaking change is `Route.href()` taking an options object, which this package does not call.

## 0.1.0

- Initial release of `@kuboon/remix-mcp`, the `remix/fetch-router` counterpart of [`mcp-server-hono-middleware`](https://github.com/yusukebe/mcp-server-hono-middleware).
- `mcp(server, options)` returns a request handler that serves an `McpServer` over the MCP Streamable HTTP transport, with Host/Origin validation enabled by default for localhost binds and a `requestOptions` hook for forwarding `parsedBody` / `authInfo`.
- `hostHeaderValidation`, `localhostHostValidation`, `originValidation`, and `localhostOriginValidation` expose the same checks as standalone middleware, over `hostRejection` / `originRejection`.
