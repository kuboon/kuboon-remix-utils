import { LATEST_PROTOCOL_VERSION, McpServer } from '@modelcontextprotocol/server'
import * as assert from '@remix-run/assert'
import { createRouter } from '@remix-run/fetch-router'
import type { Router } from '@remix-run/fetch-router'
import { describe, it } from '@std/testing/bdd'

import { mcp } from './mcp.ts'
import type { McpOptions } from './mcp.ts'
import { localhostHostValidation } from './validation.ts'

function createServer(): McpServer {
  let server = new McpServer({ name: 'test-server', version: '1.2.3' })

  server.registerTool('ping', { description: 'Replies with pong' }, () => ({
    content: [{ type: 'text', text: 'pong' }],
  }))

  return server
}

function createMcpRouter(options: McpOptions = {}): Router {
  let router = createRouter()
  router.map('/mcp', mcp(createServer(), { transport: { enableJsonResponse: true }, ...options }))
  return router
}

let initialize = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: LATEST_PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: 'test-client', version: '1.0.0' },
  },
}

function post(
  router: Router,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<Response> {
  return router.fetch('http://localhost/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

describe('mcp', () => {
  it('answers an initialize request with the server info', async () => {
    let response = await post(createMcpRouter(), initialize)

    assert.equal(response.status, 200)

    let message = await response.json()
    assert.equal(message.id, 1)
    assert.equal(message.result.serverInfo.name, 'test-server')
    assert.equal(message.result.serverInfo.version, '1.2.3')
  })

  it('serves the tools registered on the server', async () => {
    let router = createMcpRouter()
    await post(router, initialize)

    let response = await post(router, { jsonrpc: '2.0', id: 2, method: 'tools/list' })
    let message = await response.json()

    assert.deepEqual(message.result.tools.map((tool: { name: string }) => tool.name), ['ping'])
  })

  it('runs a tool call', async () => {
    let router = createMcpRouter()
    await post(router, initialize)

    let response = await post(router, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'ping', arguments: {} },
    })
    let message = await response.json()

    assert.equal(message.result.content[0].text, 'pong')
  })

  it('handles a DELETE on the same route', async () => {
    let response = await createMcpRouter().fetch('http://localhost/mcp', { method: 'DELETE' })

    // Stateless mode has no session to terminate, so the transport answers rather than the
    // router's 404 default handler — proof that `map` routed every method to the handler.
    assert.notEqual(response.status, 404)
  })

  it('connects the server lazily, on the first request', async () => {
    let server = createServer()
    let router = createRouter()
    router.map('/mcp', mcp(server, { transport: { enableJsonResponse: true } }))

    assert.equal(server.isConnected(), false)

    await post(router, initialize)

    assert.equal(server.isConnected(), true)
  })

  it('passes a pre-parsed body through requestOptions', async () => {
    let router = createRouter()
    router.map('/mcp', {
      // Stand in for middleware that consumes the body before the handler runs.
      middleware: [async (context, next) => {
        await context.request.text()
        return await next()
      }],
      handler: mcp(createServer(), {
        transport: { enableJsonResponse: true },
        requestOptions: () => ({ parsedBody: initialize }),
      }),
    })

    let response = await post(router, initialize)
    let message = await response.json()

    assert.equal(message.result.serverInfo.name, 'test-server')
  })
})

describe('mcp host validation', () => {
  it('rejects a host outside the localhost allow list', async () => {
    let response = await createMcpRouter().fetch('http://attacker.example/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(initialize),
    })

    assert.equal(response.status, 403)

    let message = await response.json()
    assert.equal(message.error.code, -32000)
  })

  it('allows a host listed in allowedHosts', async () => {
    let router = createMcpRouter({ host: '0.0.0.0', allowedHosts: ['mcp.example'] })

    let response = await router.fetch('http://mcp.example/mcp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify(initialize),
    })

    assert.equal(response.status, 200)
  })

  it('skips host validation when allowedHosts is false', async () => {
    let router = createMcpRouter({ allowedHosts: false, allowedOrigins: false })

    let response = await router.fetch('http://attacker.example/mcp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify(initialize),
    })

    assert.equal(response.status, 200)
  })
})

describe('mcp origin validation', () => {
  it('rejects a cross-site origin', async () => {
    let response = await post(createMcpRouter(), initialize, { origin: 'https://attacker.example' })

    assert.equal(response.status, 403)
  })

  it('allows a localhost origin', async () => {
    let response = await post(createMcpRouter(), initialize, { origin: 'http://localhost:5173' })

    assert.equal(response.status, 200)
  })

  it('allows a request with no origin, as non-browser clients send none', async () => {
    let response = await post(createMcpRouter(), initialize)

    assert.equal(response.status, 200)
  })
})

describe('validation middleware', () => {
  it('rejects before the handler runs', async () => {
    let handlerRan = false
    let router = createRouter({ middleware: [localhostHostValidation()] })
    router.map('/mcp', () => {
      handlerRan = true
      return new Response('ok')
    })

    let response = await router.fetch('http://attacker.example/mcp')

    assert.equal(response.status, 403)
    assert.equal(handlerRan, false)
  })

  it('calls through when the host is allowed', async () => {
    let router = createRouter({ middleware: [localhostHostValidation()] })
    router.map('/mcp', () => new Response('ok'))

    let response = await router.fetch('http://127.0.0.1/mcp')

    assert.equal(await response.text(), 'ok')
  })
})
