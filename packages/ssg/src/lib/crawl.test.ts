import * as assert from '@remix-run/assert'
import { describe, it } from '@std/testing/bdd'

import { crawl, CrawlError } from './crawl.ts'
import type { CrawlFailure, CrawlResult, RouterLike } from './crawl.ts'

function makeRouter(pages: Record<string, { body: string; type?: string }>): RouterLike {
  return {
    fetch(request: Request) {
      let { pathname } = new URL(request.url)
      let page = pages[pathname]
      if (!page) {
        return new Response('not found', { status: 404 })
      }
      return new Response(page.body, {
        headers: { 'Content-Type': page.type ?? 'text/html; charset=utf-8' },
      })
    },
  }
}

async function collect(iter: AsyncIterable<CrawlResult>): Promise<CrawlResult[]> {
  let out: CrawlResult[] = []
  for await (let result of iter) {
    out.push(result)
  }
  return out
}

describe('crawl', () => {
  it('follows imports out of a JavaScript response', async () => {
    let router = makeRouter({
      '/': { body: '<script type="module" src="/assets/entry.js"></script>' },
      '/assets/entry.js': {
        body: 'import{a}from"./chunk-A.js";import("./lazy.js");a()',
        type: 'text/javascript; charset=utf-8',
      },
      '/assets/chunk-A.js': {
        body: 'export const a=()=>1',
        type: 'text/javascript; charset=utf-8',
      },
      '/assets/lazy.js': { body: 'export default 1', type: 'text/javascript; charset=utf-8' },
    })

    let paths = (await collect(crawl(router, { paths: ['/'] }))).map((result) => result.pathname)

    // A code-split bundle reaches its shared chunks only through `import`; no markup names them.
    assert.ok(paths.includes('/assets/chunk-A.js'), `static import followed, got ${paths}`)
    assert.ok(paths.includes('/assets/lazy.js'), `literal dynamic import followed, got ${paths}`)
  })

  it('ignores a bare specifier and an unparseable script', async () => {
    let router = makeRouter({
      '/': { body: '<script type="module" src="/assets/entry.js"></script>' },
      '/assets/entry.js': {
        body: 'import "remix/ui"; import(name); this is not javascript',
        type: 'text/javascript; charset=utf-8',
      },
    })

    let paths = (await collect(crawl(router, { paths: ['/'] }))).map((result) => result.pathname)

    assert.equal(paths.length, 2, `only the page and the entry, got ${paths}`)
  })

  it('spiders links from rendered HTML and dedupes visited paths', async () => {
    let router = makeRouter({
      '/': {
        body: '<a href="/about">a</a><a href="/about">dup</a><a href="/posts/1">p</a>',
      },
      '/about': { body: '<a href="/">home</a>' },
      '/posts/1': { body: 'post' },
    })

    let results = await collect(crawl(router, { paths: ['/'] }))

    assert.deepEqual(results.map((r) => r.pathname).sort(), ['/', '/about', '/posts/1'])
    let home = results.find((r) => r.pathname === '/')!
    assert.equal(home.filepath, '/index.html')
  })

  it('extracts asset paths and skips off-site and non-navigable references', async () => {
    let router = makeRouter({
      '/': {
        body: '<link href="/app.css" rel="stylesheet">' +
          '<script src="/entry.js"></script>' +
          '<img src="/logo.png">' +
          '<a href="https://ext.example/x">ext</a>' +
          '<a href="#top">hash</a>' +
          '<a href="mailto:a@b.c">mail</a>',
      },
      '/app.css': { body: 'body{}', type: 'text/css' },
      '/entry.js': { body: '/* js */', type: 'text/javascript' },
      '/logo.png': { body: 'png', type: 'image/png' },
    })

    let results = await collect(crawl(router, { paths: ['/'] }))

    assert.deepEqual(results.map((r) => r.pathname).sort(), [
      '/',
      '/app.css',
      '/entry.js',
      '/logo.png',
    ])
    // Non-HTML assets keep their pathname as the output filepath.
    let css = results.find((r) => r.pathname === '/app.css')!
    assert.equal(css.filepath, '/app.css')
  })

  it('does not follow links on a nofollow page but still records the page', async () => {
    let router = makeRouter({
      '/': {
        body: '<meta name="robots" content="noindex, nofollow"><a href="/secret">s</a>',
      },
      '/secret': { body: 'secret' },
    })

    let results = await collect(crawl(router, { paths: ['/'] }))

    assert.deepEqual(
      results.map((r) => r.pathname),
      ['/'],
    )
  })

  it('follows nofollow-page links when ignorePageNofollow returns true', async () => {
    let router = makeRouter({
      '/': {
        body: '<meta name="robots" content="nofollow"><a href="/secret">s</a>',
      },
      '/secret': { body: 'secret' },
    })

    let results = await collect(
      crawl(router, { paths: ['/'], ignorePageNofollow: (p) => p === '/' }),
    )

    assert.deepEqual(results.map((r) => r.pathname).sort(), ['/', '/secret'])
  })

  it('throws when a crawled path returns a non-ok response', async () => {
    let router = makeRouter({ '/': { body: '<a href="/missing">x</a>' } })

    await assert.rejects(() => collect(crawl(router, { paths: ['/'] })), /Crawl failed: 404/)
  })

  it('throws a CrawlError carrying the failure and its referrer', async () => {
    let router = makeRouter({ '/': { body: '<a href="/missing">x</a>' } })

    let err: unknown
    try {
      await collect(crawl(router, { paths: ['/'] }))
    } catch (e) {
      err = e
    }

    assert.ok(err instanceof CrawlError)
    assert.equal((err as CrawlError).failures.length, 1)
    let [failure] = (err as CrawlError).failures
    assert.equal(failure.pathname, '/missing')
    assert.equal(failure.status, 404)
    assert.equal(failure.referrer, '/')
  })

  it('skips broken links and keeps crawling when onError is "skip"', async () => {
    let router = makeRouter({
      '/': { body: '<a href="/missing">x</a><a href="/ok">y</a>' },
      '/ok': { body: 'ok' },
    })

    let results = await collect(crawl(router, { paths: ['/'], onError: 'skip' }))

    assert.deepEqual(results.map((r) => r.pathname).sort(), ['/', '/ok'])
  })

  it('reports each failure to an onError function and honours its decision', async () => {
    let router = makeRouter({
      '/': { body: '<a href="/missing">x</a><a href="/ok">y</a>' },
      '/ok': { body: 'ok' },
    })

    let seen: CrawlFailure[] = []
    let results = await collect(
      crawl(router, {
        paths: ['/'],
        onError: (f) => {
          seen.push(f)
          return 'skip'
        },
      }),
    )

    assert.deepEqual(results.map((r) => r.pathname).sort(), ['/', '/ok'])
    assert.equal(seen.length, 1)
    assert.equal(seen[0].pathname, '/missing')
    assert.equal(seen[0].referrer, '/')
  })
})
