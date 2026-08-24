import * as assert from '@remix-run/assert'
import { describe, it } from '@std/testing/bdd'

import { githubPages, outputPathFor, serveAsHost } from './host.ts'
import type { FileServerBehavior } from './host.ts'
import type { SiteMiddleware } from './middleware.ts'

/** A site that answers for a fixed set of URLs, so the host layer is what is under test. */
function siteServing(...urls: string[]): SiteMiddleware {
  let served = new Set(urls)

  return {
    basePath: '',
    // deno-lint-ignore require-await
    fetch: async (request) => {
      // Decoded, like the real file tree — its entries are keyed by the path a person would type.
      let pathname = decodeURIComponent(new URL(request.url).pathname)
      return served.has(pathname)
        ? new Response(pathname, { headers: { 'content-type': 'text/html; charset=utf-8' } })
        : new Response('Not Found', { status: 404 })
    },
    paths: () => served,
    reload: () => Promise.resolve(),
  }
}

describe('githubPages', () => {
  it('serves a directory URL from its index', () => {
    assert.deepEqual(githubPages().toLocalPaths('/blog/'), ['/blog/index.html'])
  })

  it('serves anything with an extension as it is', () => {
    assert.deepEqual(githubPages().toLocalPaths('/assets/chunk.js'), ['/assets/chunk.js'])
  })

  it('tries the .html file first, then redirects to the directory form', () => {
    assert.deepEqual(githubPages().toLocalPaths('/about'), [
      '/about.html',
      { target: '/about/', path: '/about/index.html' },
    ])
  })
})

describe('outputPathFor', () => {
  it('picks the file the host would reach for first', () => {
    let behavior = githubPages()

    assert.equal(outputPathFor(behavior, '/'), '/index.html')
    assert.equal(outputPathFor(behavior, '/about'), '/about.html')
    assert.equal(outputPathFor(behavior, '/blog/hello'), '/blog/hello.html')
    assert.equal(outputPathFor(behavior, '/assets/chunk.js'), '/assets/chunk.js')
  })
})

describe('serveAsHost', () => {
  it('answers a URL from the file the build would have written for it', async () => {
    let site = serveAsHost(siteServing('/', '/about'))

    assert.equal((await site.fetch(new Request('http://localhost/about'))).status, 200)
    assert.equal((await site.fetch(new Request('http://localhost/'))).status, 200)
  })

  it('answers the .html URL too, because the host would', async () => {
    let site = serveAsHost(siteServing('/about'))

    let response = await site.fetch(new Request('http://localhost/about.html'))
    assert.equal(response.status, 200)
    assert.equal(await response.text(), '/about', 'served from the page, not a second copy')
  })

  it('404s a trailing slash the deploy would 404, rather than being kinder than production', async () => {
    let site = serveAsHost(siteServing('/about'))

    assert.equal((await site.fetch(new Request('http://localhost/about/'))).status, 404)
  })

  it('redirects when the host would — only the directory form exists', async () => {
    // A behavior that writes pages as directory indexes, so `/about` has no `.html` to reach.
    let directoryIndexes: FileServerBehavior = {
      toLocalPaths: (urlPath) =>
        urlPath.endsWith('/')
          ? [`${urlPath}index.html`]
          : [{ target: `${urlPath}/`, path: `${urlPath}/index.html` }],
    }
    let site = serveAsHost(siteServing('/about/'), { behavior: directoryIndexes })

    let response = await site.fetch(new Request('http://localhost/about'))
    assert.equal(response.status, 301)
    assert.equal(new URL(response.headers.get('location')!).pathname, '/about/')
  })

  it('re-requests a path that needs escaping without losing half of it', async () => {
    // A decoded path handed to `new URL()` turns everything after a `#` into a fragment, so the
    // page silently 404s. It has to be escaped on the way back into a URL.
    let site = serveAsHost(siteServing('/blog/release notes #2'))

    let response = await site.fetch(
      new Request('http://localhost/blog/release%20notes%20%232'),
    )

    assert.equal(response.status, 200)
    assert.equal(await response.text(), '/blog/release notes #2')
  })

  it('resolves within the artifact, so a deploy prefix is not part of the file name', async () => {
    let site = serveAsHost(siteServing('/repo', '/repo/about'), { base: '/repo' })

    assert.equal((await site.fetch(new Request('http://localhost/repo'))).status, 200)
    assert.equal((await site.fetch(new Request('http://localhost/repo/about.html'))).status, 200)
    assert.equal((await site.fetch(new Request('http://localhost/about'))).status, 404)
  })

  it('reindexes on reload, so a page added since startup is reachable', async () => {
    let served = new Set(['/'])
    let inner: SiteMiddleware = {
      basePath: '',
      // deno-lint-ignore require-await
      fetch: async (request) =>
        new Response('', {
          status: served.has(new URL(request.url).pathname) ? 200 : 404,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        }),
      paths: () => served,
      reload: () => Promise.resolve(),
    }
    let site = serveAsHost(inner)

    assert.equal((await site.fetch(new Request('http://localhost/new'))).status, 404)
    served.add('/new')
    await site.reload()
    assert.equal((await site.fetch(new Request('http://localhost/new'))).status, 200)
  })
})
