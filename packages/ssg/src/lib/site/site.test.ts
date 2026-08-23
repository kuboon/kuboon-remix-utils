import * as assert from '@remix-run/assert'
import * as path from 'node:path'
import { describe, it } from '@std/testing/bdd'

import { buildSite } from './build.ts'
import { createSite } from './create.tsx'
import { loadSiteConfig } from './load.ts'

let siteDir = path.join(new URL('./__fixtures__/site/', import.meta.url).pathname)

async function build(base?: string) {
  let outDir = await Deno.makeTempDir({ prefix: 'remix-ssg-site-' })
  let stats = await buildSite({ rootDir: siteDir, outDir, base })
  let files = new Set<string>()

  for await (let entry of walk(outDir, outDir)) files.add(entry)

  return { stats, outDir, files, read: (rel: string) => Deno.readTextFile(path.join(outDir, rel)) }
}

async function* walk(directory: string, root: string): AsyncIterableIterator<string> {
  for await (let entry of Deno.readDir(directory)) {
    let full = path.join(directory, entry.name)
    if (entry.isDirectory) yield* walk(full, root)
    else yield path.relative(root, full)
  }
}

describe('buildSite', () => {
  it('writes a page per route, plus content index and entries', async () => {
    let { files, outDir } = await build()

    try {
      assert.ok(files.has('index.html'), 'writes the home page')
      assert.ok(files.has('about/index.html'), 'writes a discovered page')
      assert.ok(files.has('notes/index.html'), 'generates the content index')
      assert.ok(files.has('notes/first/index.html'), 'writes a content entry')
      assert.ok(files.has('notes/second/index.html'), 'writes every content entry')
    } finally {
      await Deno.remove(outDir, { recursive: true })
    }
  })

  it('skips a page marked dynamic and says so', async () => {
    let { stats, files, outDir } = await build()

    try {
      assert.equal(stats.skipped.join(','), '/live', 'reports the skipped pattern')
      assert.ok(!files.has('live/index.html'), 'writes nothing for it')
    } finally {
      await Deno.remove(outDir, { recursive: true })
    }
  })

  it('writes every client chunk, including the shared one no HTML links to', async () => {
    let { files, outDir } = await build()

    try {
      let chunks = [...files].filter((file) => file.startsWith('assets/'))
      assert.ok(chunks.length >= 3, `expected entry chunks plus a shared one, got ${chunks}`)
      assert.ok(
        chunks.some((chunk) => chunk.includes('chunk-')),
        `expected a shared chunk in ${chunks}`,
      )
    } finally {
      await Deno.remove(outDir, { recursive: true })
    }
  })

  it('emits the module two islands share exactly once', async () => {
    let { files, outDir, read } = await build()

    try {
      let bodies = await Promise.all(
        [...files].filter((file) => file.endsWith('.js')).map((file) => read(file)),
      )
      let defining = bodies.filter((body) => body.includes('fixture-click-store'))

      assert.equal(defining.length, 1, 'exactly one chunk defines the shared store')
    } finally {
      await Deno.remove(outDir, { recursive: true })
    }
  })

  it('embeds the island URL map and loads the chunks it names', async () => {
    let { outDir, read } = await build()

    try {
      let html = await read('index.html')
      let match = html.match(/id="rmx-ssg-islands"[^>]*>([^<]*)</)
      assert.ok(match !== null, 'embeds the island map')

      let map = JSON.parse(match[1].replaceAll('&quot;', '"')) as Record<string, string>
      assert.ok(map.counter !== undefined && map.total !== undefined, 'maps both islands')

      for (let url of Object.values(map)) {
        assert.ok(html.includes(`src="${url}"`), `loads the chunk for ${url}`)
      }
    } finally {
      await Deno.remove(outDir, { recursive: true })
    }
  })

  it('ships no JavaScript on a page that did not opt into hydration', async () => {
    let { outDir, read } = await build()

    try {
      let html = await read('about/index.html')
      assert.ok(!html.includes('<script'), 'about has no script tags')
    } finally {
      await Deno.remove(outDir, { recursive: true })
    }
  })

  it('prefixes every URL under a base path but writes files at the root', async () => {
    let { files, outDir, read } = await build('/repo')

    try {
      assert.ok(files.has('index.html'), 'output still lands at the root')
      assert.ok(
        [...files].some((file) => file.startsWith('assets/')),
        'chunks land under assets/ too',
      )

      let html = await read('index.html')
      assert.ok(html.includes('href="/repo/static/styles.css"'), 'stylesheet carries the prefix')
      assert.ok(html.includes('src="/repo/assets/'), 'chunk URLs carry the prefix')
      assert.ok(html.includes('href="/repo/notes"'), 'nav links carry the prefix')
      assert.ok(html.includes('href="/repo"'), 'the root link drops the trailing slash')
    } finally {
      await Deno.remove(outDir, { recursive: true })
    }
  })
})

describe('createSite', () => {
  it('renders a dynamic page when served rather than skipping it', async () => {
    let { config, rootDir } = await loadSiteConfig(siteDir)
    let site = await createSite(config, { rootDir, mode: 'serve', base: '' })

    let response = await site.router.fetch(new Request('http://localhost/live'))

    assert.equal(response.status, 200)
    assert.ok((await response.text()).includes('<h1>Live</h1>'))
  })

  it('serves static files and 404s outside them', async () => {
    let { config, rootDir } = await loadSiteConfig(siteDir)
    let site = await createSite(config, { rootDir, mode: 'serve', base: '' })

    let css = await site.router.fetch(new Request('http://localhost/static/styles.css'))
    assert.equal(css.status, 200)

    let missing = await site.router.fetch(new Request('http://localhost/static/nope.css'))
    assert.equal(missing.status, 404)
  })
})

describe('loadSiteConfig', () => {
  it('explains itself when there is no config', async () => {
    let empty = await Deno.makeTempDir({ prefix: 'remix-ssg-empty-' })

    try {
      await assert.rejects(
        () => loadSiteConfig(empty),
        (error: Error) => error.message.includes('No site config'),
      )
    } finally {
      await Deno.remove(empty, { recursive: true })
    }
  })
})
