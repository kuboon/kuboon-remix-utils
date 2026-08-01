# remix-mcp

Serve a [Model Context Protocol](https://modelcontextprotocol.io) server from a
[`remix/fetch-router`](https://github.com/remix-run/remix/tree/main/packages/fetch-router) route.

This is the Remix counterpart of
[`mcp-server-hono-middleware`](https://github.com/yusukebe/mcp-server-hono-middleware) /
[`@modelcontextprotocol/hono`](https://www.npmjs.com/package/@modelcontextprotocol/hono): a thin
adapter, not an MCP implementation. `@modelcontextprotocol/server` does the protocol work; this
package hands its `WebStandardStreamableHTTPServerTransport` a Remix request and gives you the
Host/Origin checks the MCP spec asks local servers to perform.

## Features

- **One route, every method** — `router.map()` sends `POST` (JSON-RPC), `GET` (SSE stream), and
  `DELETE` (session teardown) to the same handler
- **Safe by default** — DNS rebinding and cross-site `Origin` protection turn themselves on for
  localhost binds, and can be pointed at your own allow list or switched off explicitly
- **Lazy connect** — the server connects to the transport on the first request it serves, and
  concurrent first requests share one connect instead of racing
- **Web standards only** — no `node:*` imports, so it runs on Deno, Node, Bun, and Cloudflare
  Workers alike

## Installation

This package is published to [JSR](https://jsr.io/@kuboon/remix-mcp):

```sh
deno add jsr:@kuboon/remix-mcp npm:@modelcontextprotocol/server npm:@remix-run/fetch-router
```

For Node:

```sh
npx jsr add @kuboon/remix-mcp
npm install @modelcontextprotocol/server @remix-run/fetch-router
```

## Usage

```ts
import { McpServer } from '@modelcontextprotocol/server'
import { createRouter } from '@remix-run/fetch-router'
import { mcp } from '@kuboon/remix-mcp'
import * as z from 'zod'

let server = new McpServer({ name: 'my-server', version: '1.0.0' })

server.registerTool(
  'add',
  { description: 'Adds two numbers', inputSchema: z.object({ a: z.number(), b: z.number() }) },
  ({ a, b }) => ({ content: [{ type: 'text', text: String(a + b) }] }),
)

let router = createRouter()
router.map('/mcp', mcp(server))

export default router
```

Use `router.map()` rather than `router.post()`: MCP talks over `POST` for JSON-RPC messages, `GET`
to open the server-to-client SSE stream, and `DELETE` to end a session, and `map()` is the
method-agnostic registration.

### Behind a proxy or on a public host

Host and Origin validation default to the localhost allow list, which rejects any other host with a
`403`. Tell the handler what to accept when the server is reachable under a real name:

```ts
router.map('/mcp', mcp(server, { host: '0.0.0.0', allowedHosts: ['mcp.example.com'] }))
```

Pass `false` to opt out of a check entirely — appropriate only when something in front of the
router (a proxy, a gateway, an authentication layer) already vouches for the request:

```ts
router.map('/mcp', mcp(server, { allowedHosts: false, allowedOrigins: false }))
```

### Plain JSON responses

By default the transport answers a `POST` with an SSE stream. For simple request/response clients,
ask for a JSON body instead:

```ts
router.map('/mcp', mcp(server, { transport: { enableJsonResponse: true } }))
```

### Authentication

Resolve the caller in middleware and forward it to the transport, which passes it on to your tool
handlers as `extra.authInfo`:

```ts
import { createContextKey } from '@remix-run/fetch-router'
import type { AuthInfo } from '@modelcontextprotocol/server'

let AuthInfoKey = createContextKey<AuthInfo>()

router.map('/mcp', {
  middleware: [authenticate(AuthInfoKey)],
  handler: mcp(server, {
    requestOptions: (context) => ({ authInfo: context.get(AuthInfoKey) }),
  }),
})
```

`requestOptions` is also how you hand the transport a body that upstream middleware already
consumed, as `{ parsedBody }`.

## API

### `mcp(server, options?): RequestHandler`

Creates the request handler that serves `server`. Options:

- `host` — the hostname the server is bound to (default `'127.0.0.1'`). A localhost-class value
  (`'127.0.0.1'`, `'localhost'`, `'::1'`) turns on Host and Origin validation.
- `allowedHosts` — hostnames to accept, overriding the default derived from `host`; `false`
  disables Host validation. Hostnames only, no ports; for IPv6 include brackets (`'[::1]'`).
- `allowedOrigins` — origin hostnames to accept, overriding the default derived from `host`;
  `false` disables Origin validation. Requests with no `Origin` header always pass, since
  non-browser MCP clients do not send one.
- `transport` — options for the underlying `WebStandardStreamableHTTPServerTransport`. Defaults to
  `{ sessionIdGenerator: undefined }` (stateless mode).
- `requestOptions(context)` — derives per-request transport options (`parsedBody`, `authInfo`) from
  the request context.

The host is read from the `Host` header, falling back to the request URL's authority so that
in-process `router.fetch()` calls and HTTP/2 requests (where the authority arrives as
`:authority`) validate the same way.

### Validation middleware

The same checks as standalone `Middleware`, for routes that are not the MCP endpoint itself — an
OAuth metadata route, say — or for applying them router-wide:

- `hostHeaderValidation(allowedHostnames)`
- `localhostHostValidation()`
- `originValidation(allowedOriginHostnames)`
- `localhostOriginValidation()`

```ts
let router = createRouter({ middleware: [localhostHostValidation()] })
```

`hostRejection(context, allowedHostnames)` and `originRejection(context, allowedOriginHostnames)`
are the underlying checks, returning the `403` response or `undefined`. Use them when a handler
validates inline rather than through the middleware chain.

## Sessions

The default transport runs stateless (`sessionIdGenerator: undefined`), which is what serverless
deployments want: no session ID is issued and nothing is kept between requests. Stateful mode keeps
session state in the transport instance, so a single shared handler only works when every request
for a session reaches the same process — run one transport per session otherwise.

## Related Packages

- [`@modelcontextprotocol/server`](https://www.npmjs.com/package/@modelcontextprotocol/server) -
  the MCP server SDK and the transport this wraps
- [`fetch-router`](https://github.com/remix-run/remix/tree/main/packages/fetch-router) - the router
  you mount the endpoint on
- [`mcp-server-hono-middleware`](https://github.com/yusukebe/mcp-server-hono-middleware) - the Hono
  original this mirrors

## License

See [LICENSE](https://github.com/remix-run/remix/blob/main/LICENSE)
