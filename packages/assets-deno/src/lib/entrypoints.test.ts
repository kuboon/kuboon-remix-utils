import * as assert from '@remix-run/assert'
import { describe, it } from '@std/testing/bdd'

import { createAssetServer } from './server.ts'
import { expandEntrypoints, isGlob } from './entrypoints.ts'

let fixtureDir = new URL('./__fixtures__/', import.meta.url).pathname

describe('expandEntrypoints', () => {
  it('leaves a plain path as written', async () => {
    let expanded = await expandEntrypoints(['entry_a.ts'], fixtureDir)

    assert.deepEqual(expanded, ['entry_a.ts'])
  })

  it('expands a glob to its matches, sorted', async () => {
    let expanded = await expandEntrypoints(['entry_*.ts'], fixtureDir)

    assert.deepEqual(expanded, ['entry_a.ts', 'entry_b.ts', 'entry_cjs.ts'])
  })

  it('refuses a pattern that matches nothing', async () => {
    await assert.rejects(
      () => expandEntrypoints(['islands/*.tsx'], fixtureDir),
      /matched no files/,
    )
  })

  it('does not treat a file: URL as a pattern', () => {
    assert.equal(isGlob('file:///tmp/a[1].ts'), false)
    assert.equal(isGlob('islands/*.tsx'), true)
    assert.equal(isGlob('entry_a.ts'), false)
  })

  it('serves everything a glob matched', async () => {
    let server = await createAssetServer({
      rootDir: fixtureDir,
      entrypoints: ['entry_[ab].ts'],
      configPath: 'import_map.json',
    })

    for (let entrypoint of ['entry_a.ts', 'entry_b.ts']) {
      let response = await server.fetch(
        new Request(`http://localhost${await server.getHref(entrypoint)}`),
      )
      assert.equal(response.status, 200, entrypoint)
    }
  })
})
