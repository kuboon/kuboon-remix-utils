import * as assert from '@remix-run/assert'
import { describe, it } from '@std/testing/bdd'

import { createAssetServer } from './server.ts'
import type { DenoAssetServer } from './server.ts'

let fixtureDir = new URL('./__fixtures__/', import.meta.url).pathname

function createFixtureServer(): Promise<DenoAssetServer> {
  return createAssetServer({
    rootDir: fixtureDir,
    entrypoints: ['entry_a.ts', 'entry_b.ts'],
    importMap: 'import_map.json',
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
      importMap: 'import_map.json',
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
