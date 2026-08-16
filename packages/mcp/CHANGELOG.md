# `remix-mcp` CHANGELOG

This is the changelog for [`remix-mcp`](https://github.com/kuboon/kuboon-remix-utils/tree/main/packages/mcp). It follows [semantic versioning](https://semver.org/).

## 0.1.1

- Bumped `@remix-run/fetch-router` to `^0.21.0` (Remix v3 `beta.6`). No API change here: `0.21.0`'s only breaking change is `Route.href()` taking an options object, which this package does not call.

## 0.1.0

- Initial release of `@kuboon/remix-mcp`, the `remix/fetch-router` counterpart of [`mcp-server-hono-middleware`](https://github.com/yusukebe/mcp-server-hono-middleware).
- `mcp(server, options)` returns a request handler that serves an `McpServer` over the MCP Streamable HTTP transport, with Host/Origin validation enabled by default for localhost binds and a `requestOptions` hook for forwarding `parsedBody` / `authInfo`.
- `hostHeaderValidation`, `localhostHostValidation`, `originValidation`, and `localhostOriginValidation` expose the same checks as standalone middleware, over `hostRejection` / `originRejection`.
