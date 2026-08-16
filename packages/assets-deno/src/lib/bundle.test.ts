import * as assert from '@remix-run/assert'
import * as path from 'node:path'
import { describe, it } from '@std/testing/bdd'

import { createAssetServer } from './server.ts'
import type { DenoAssetServer } from './server.ts'

let fixtureDir = new URL('./__fixtures__/', import.meta.url).pathname

function createBundledServer(): Promise<DenoAssetServer> {
  return createAssetServer({
    rootDir: fixtureDir,
    entrypoints: ['entry_a.ts', 'entry_b.ts'],
    mode: 'bundle',
    // Readable output, so a test can assert on names the minifier would have mangled.
    bundle: { minify: false, sourcemap: 'none' },
  })
}

async function fetchText(server: DenoAssetServer, urlPath: string): Promise<string> {
  let response = await server.fetch(new Request(`http://localhost${urlPath}`))
  assert.equal(response.status, 200, `expected 200 for ${urlPath}`)
  return await response.text()
}

/** The specifiers a chunk imports, as written in its own source. */
function importedSpecifiers(code: string): string[] {
  return [...code.matchAll(/from\s*["']([^"']+)["']/g)].map((match) => match[1])
}

/**
 * Writes every served chunk to a directory and returns it.
 *
 * Chunks import each other by relative path, so they have to sit next to each other on disk before
 * they can be evaluated — which is the same reason serving them under one base path works.
 */
async function materialize(server: DenoAssetServer): Promise<string> {
  let directory = await Deno.makeTempDir({ prefix: 'assets-deno-bundle-' })

  for (let publicPath of server.moduleUrls().values()) {
    let relative = publicPath.slice(server.basePath.length + 1)
    let filePath = path.join(directory, relative)
    await Deno.mkdir(path.dirname(filePath), { recursive: true })
    await Deno.writeTextFile(filePath, await fetchText(server, publicPath))
  }

  return directory
}

describe('createAssetServer (bundled mode)', () => {
  it('serves every entrypoint as JavaScript', async () => {
    let server = await createBundledServer()

    for (let entrypoint of ['entry_a.ts', 'entry_b.ts']) {
      let response = await server.fetch(
        new Request(`http://localhost${server.entryUrl(entrypoint)}`),
      )

      assert.equal(response.status, 200, `expected 200 for ${entrypoint}`)
      assert.ok(
        response.headers.get('content-type')?.startsWith('text/javascript'),
        'serves a JavaScript content type',
      )
    }
  })

  it('hoists a module shared by two entrypoints into one chunk both import', async () => {
    let server = await createBundledServer()

    let a = await fetchText(server, server.entryUrl('entry_a.ts'))
    let b = await fetchText(server, server.entryUrl('entry_b.ts'))

    let fromA = importedSpecifiers(a)
    let fromB = importedSpecifiers(b)

    assert.equal(fromA.length, 1, 'entry_a imports exactly one chunk')
    assert.equal(fromB.length, 1, 'entry_b imports exactly one chunk')
    assert.equal(fromB[0], fromA[0], 'both entrypoints import the same shared chunk')
  })

  it('emits the shared module exactly once across every chunk', async () => {
    let server = await createBundledServer()

    let bodies = await Promise.all(
      [...server.moduleUrls().values()].map((url) => fetchText(server, url)),
    )

    // The body of `bump()`, which only the shared module contains — call sites read `.bump()`.
    let definingChunks = bodies.filter((body) => body.includes('++this.count'))

    assert.equal(definingChunks.length, 1, 'exactly one chunk defines the shared module')
  })

  it('keeps the shared module a single instance when the chunks are evaluated', async () => {
    let server = await createBundledServer()
    let directory = await materialize(server)

    try {
      let entryPath = (entrypoint: string) =>
        path.join(directory, server.entryUrl(entrypoint).slice(server.basePath.length + 1))

      let a = await import(`file://${entryPath('entry_a.ts')}`)
      let b = await import(`file://${entryPath('entry_b.ts')}`)

      // Both entries bump the *same* counter, so the second call sees the first one's increment.
      assert.ok(a.a().endsWith(':1'), 'entry_a sees the counter at 1')
      assert.equal(b.b(), 2, 'entry_b sees the counter the other entry already bumped')
    } finally {
      await Deno.remove(directory, { recursive: true })
    }
  })

  it('emits far fewer files than one URL per module', async () => {
    let bundled = await createBundledServer()
    let unbundled = await createAssetServer({
      rootDir: fixtureDir,
      entrypoints: ['entry_a.ts', 'entry_b.ts'],
      configPath: 'import_map.json',
    })

    assert.ok(
      bundled.moduleUrls().size < unbundled.moduleUrls().size,
      `bundled (${bundled.moduleUrls().size}) should serve fewer files ` +
        `than module mode (${unbundled.moduleUrls().size})`,
    )
  })

  it('minifies by default', async () => {
    let server = await createAssetServer({
      rootDir: fixtureDir,
      entrypoints: ['entry_b.ts'],
      mode: 'bundle',
      bundle: { sourcemap: 'none' },
    })

    let code = await fetchText(server, server.entryUrl('entry_b.ts'))

    assert.ok(!code.includes('\n\n'), 'minified output has no blank lines')
  })

  it('serves source maps alongside the chunks when asked', async () => {
    let server = await createAssetServer({
      rootDir: fixtureDir,
      entrypoints: ['entry_b.ts'],
      mode: 'bundle',
      bundle: { minify: false, sourcemap: 'linked' },
    })

    let mapUrl = [...server.moduleUrls().values()].find((url) => url.endsWith('.map'))
    assert.ok(mapUrl !== undefined, 'emits a source map')

    let response = await server.fetch(new Request(`http://localhost${mapUrl}`))
    assert.equal(response.status, 200)
    assert.ok(
      response.headers.get('content-type')?.startsWith('application/json'),
      'serves the map as JSON',
    )
  })

  it('answers 304 for a conditional request', async () => {
    let server = await createBundledServer()
    let url = `http://localhost${server.entryUrl('entry_b.ts')}`

    let first = await server.fetch(new Request(url))
    let etag = first.headers.get('etag')
    assert.ok(etag !== null, 'sends an ETag')

    let second = await server.fetch(new Request(url, { headers: { 'if-none-match': etag } }))
    assert.equal(second.status, 304)
  })

  it('404s for a path it does not serve', async () => {
    let server = await createBundledServer()

    let response = await server.fetch(new Request('http://localhost/assets/nope.js'))

    assert.equal(response.status, 404)
  })

  it('rebuilds on reload', async () => {
    let server = await createBundledServer()
    let before = server.entryUrl('entry_a.ts')

    await server.reload()

    assert.equal(server.entryUrl('entry_a.ts'), before, 'entry URLs are stable across a reload')
  })
})
