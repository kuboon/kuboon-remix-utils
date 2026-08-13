import * as assert from '@remix-run/assert'
import { describe, it } from '@std/testing/bdd'

import { createAssetServer } from './server.ts'
import type { DenoAssetServer } from './server.ts'

let fixtureDir = new URL('./__fixtures__/', import.meta.url).pathname

function createFixtureServer(): Promise<DenoAssetServer> {
  return createAssetServer({
    rootDir: fixtureDir,
    entrypoints: ['entry_a.ts', 'entry_b.ts'],
    configPath: 'import_map.json',
  })
}

async function fetchText(server: DenoAssetServer, path: string): Promise<string> {
  let response = await server.fetch(new Request(`http://localhost${path}`))
  assert.equal(response.status, 200, `expected 200 for ${path}`)
  return await response.text()
}

/** Pulls the URL a module imports for a given original file name. */
function importedUrl(code: string, name: string): string | null {
  let match = code.match(new RegExp(`["']([^"']*${name}[^"']*)["']`))
  return match?.[1] ?? null
}

describe('createAssetServer', () => {
  it('serves both entrypoints as JavaScript', async () => {
    let server = await createFixtureServer()

    let response = await server.fetch(
      new Request(`http://localhost${server.entryUrl('entry_a.ts')}`),
    )

    assert.equal(response.status, 200)
    assert.ok(
      response.headers.get('content-type')?.startsWith('text/javascript'),
      'serves a JavaScript content type',
    )
  })

  it('gives a module shared by two entrypoints one identical URL', async () => {
    let server = await createFixtureServer()

    let a = await fetchText(server, server.entryUrl('entry_a.ts'))
    let b = await fetchText(server, server.entryUrl('entry_b.ts'))

    let fromA = importedUrl(a, 'shared')
    let fromB = importedUrl(b, 'shared')

    assert.ok(fromA !== null, 'entry_a imports the shared module')
    assert.equal(fromB, fromA, 'both entrypoints name the shared module by the same URL')
  })

  it('serves the shared module exactly once', async () => {
    let server = await createFixtureServer()

    let sharedUrls = [...server.moduleUrls()]
      .filter(([specifier]) => specifier.endsWith('shared.ts'))
      .map(([, url]) => url)

    assert.equal(sharedUrls.length, 1, 'one specifier, one URL')
  })

  it('shares one live instance, which is what the singleton depends on', async () => {
    let server = await createFixtureServer()

    let a = await fetchText(server, server.entryUrl('entry_a.ts'))
    let sharedUrl = importedUrl(a, 'shared')
    assert.ok(sharedUrl !== null)

    // The browser keys its module registry on URL, so one URL means one evaluation. Evaluating the
    // served module twice here stands in for two entries importing it.
    let sharedCode = await fetchText(server, sharedUrl)
    let blob = `data:text/javascript,${encodeURIComponent(sharedCode)}`
    let first = await import(blob)
    let second = await import(blob)

    assert.equal(second.counter, first.counter, 'the same module object, not a copy')
    first.counter.bump()
    assert.equal(second.counter.count, 1, 'state is observed through both references')
  })

  it('compiles and serves a JSR dependency', async () => {
    let server = await createFixtureServer()

    let jsrUrls = [...server.moduleUrls()]
      .filter(([specifier]) => specifier.startsWith('https://jsr.io/@std/encoding/'))
      .map(([, url]) => url)

    assert.ok(jsrUrls.length > 0, 'the JSR dependency is in the served graph')

    let code = await fetchText(server, jsrUrls[0])
    assert.ok(code.length > 0, 'the JSR module has a body')
  })

  it('rewrites the JSR specifier to a served URL', async () => {
    let server = await createFixtureServer()

    let a = await fetchText(server, server.entryUrl('entry_a.ts'))

    assert.ok(!a.includes('"@std/encoding/hex"'), 'the bare JSR specifier is gone')
    assert.ok(a.includes('/assets/jsr/@std/encoding/'), 'replaced by a served URL')
  })

  it('emits no unresolved bare or relative specifiers in served modules', async () => {
    let server = await createFixtureServer()

    for (let url of server.moduleUrls().values()) {
      let code = await fetchText(server, url)
      for (
        let match of code.matchAll(/(?:^|\n)\s*(?:import|export)[^;\n]*?from\s*["']([^"']+)["']/g)
      ) {
        let specifier = match[1]
        assert.ok(
          specifier.startsWith('/') || specifier.startsWith('node:'),
          `${url} imports "${specifier}", which the browser could not resolve`,
        )
      }
    }
  })

  it('answers 404 for a path it does not serve', async () => {
    let server = await createFixtureServer()

    let response = await server.fetch(new Request('http://localhost/assets/nope.js'))

    assert.equal(response.status, 404)
  })

  it('revalidates with an ETag', async () => {
    let server = await createFixtureServer()
    let url = `http://localhost${server.entryUrl('entry_a.ts')}`

    let first = await server.fetch(new Request(url))
    let etag = first.headers.get('etag')
    assert.ok(etag !== null, 'sends an ETag')
    await first.text()

    let second = await server.fetch(new Request(url, { headers: { 'if-none-match': etag } }))

    assert.equal(second.status, 304)
  })

  it('mounts at a custom base path', async () => {
    let server = await createAssetServer({
      rootDir: fixtureDir,
      entrypoints: ['entry_b.ts'],
      configPath: 'import_map.json',
      basePath: '/static',
    })

    assert.equal(server.basePath, '/static')
    assert.ok(server.entryUrl('entry_b.ts').startsWith('/static/'))
  })

  it('rejects an entrypoint it was never given', async () => {
    let server = await createFixtureServer()

    assert.throws(() => server.entryUrl('nope.ts'))
  })
})

describe('createAssetServer with CommonJS', () => {
  function createCjsServer(): Promise<DenoAssetServer> {
    return createAssetServer({
      rootDir: fixtureDir,
      entrypoints: ['entry_cjs.ts'],
      configPath: 'import_map.json',
    })
  }

  it('serves a CommonJS module as an ES module rather than refusing it', async () => {
    let server = await createCjsServer()

    let url = [...server.moduleUrls()].find(([s]) => s.endsWith('legacy.cjs'))?.[1]
    assert.ok(url !== undefined, 'the CommonJS module is in the served graph')

    let code = await fetchText(server, url)
    assert.ok(code.includes('export default'), 'the wrapped module has a default export')
    // The body still says `module.exports` — correctly, inside the wrapper — so the meaningful
    // check is that the wrapper supplying `module` is there at all.
    assert.ok(
      code.includes('const __cjs_module = { exports: {} }'),
      'the body is given the module object it expects',
    )
  })

  it('serves it under a .js URL, since the body is now an ES module', async () => {
    let server = await createCjsServer()

    let url = [...server.moduleUrls()].find(([s]) => s.endsWith('legacy.cjs'))?.[1]
    assert.ok(url?.endsWith('.js'), `expected a .js URL, got ${url}`)
  })

  it('points the importing module at that URL', async () => {
    let server = await createCjsServer()

    let entry = await fetchText(server, server.entryUrl('entry_cjs.ts'))

    assert.ok(!entry.includes('./legacy.cjs'), 'the authored .cjs specifier is gone')
    assert.ok(entry.includes('/assets/app/legacy.js'), 'replaced by the served URL')
  })

  it('re-exports the names the CommonJS module assigns', async () => {
    let server = await createCjsServer()

    let url = [...server.moduleUrls()].find(([s]) => s.endsWith('legacy.cjs'))?.[1]
    let code = await fetchText(server, url!)

    assert.ok(code.includes('export const greet'), 'exports greet by name')
    assert.ok(code.includes('export const VERSION'), 'exports VERSION by name')
  })

  it('follows require() into further CommonJS modules', async () => {
    let server = await createCjsServer()

    let served = [...server.moduleUrls()].map(([specifier]) => specifier)
    assert.ok(
      served.some((specifier) => specifier.endsWith('shared_cjs.cjs')),
      'the required module is part of the graph',
    )
  })

  it('emits a wrapped module that actually runs', async () => {
    let server = await createCjsServer()

    // shared_cjs.cjs requires nothing, so it can be evaluated standalone here. Everything the
    // wrapper provides — module, exports, the named re-export — has to work for this to pass.
    let url = [...server.moduleUrls()].find(([s]) => s.endsWith('shared_cjs.cjs'))?.[1]
    let code = await fetchText(server, url!)

    let mod = await import(`data:text/javascript,${encodeURIComponent(code)}`)

    assert.equal(typeof mod.default.counter.next, 'function')
    assert.equal(mod.default.counter.next(), 1)
    assert.equal(mod.counter, mod.default.counter, 'the named export is the same object')
  })
})
