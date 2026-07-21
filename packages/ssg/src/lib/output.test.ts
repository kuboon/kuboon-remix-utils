import * as assert from '@remix-run/assert'
import { describe, it } from '@std/testing/bdd'

import { rewriteExtensionsToJs, toOutput } from './output.ts'

describe('rewriteExtensionsToJs', () => {
  it('rewrites script src, link href, and inline module URLs to .js', () => {
    let html = '<!-- rmx:h:1 -->' +
      '<link rel="modulepreload" href="/a.tsx">' +
      '<script src="/b.jsx"></script>' +
      '<script>{"moduleUrl":"/c.mts"}</script>' +
      '<a href="/src/page.tsx">view source</a>'

    let out = rewriteExtensionsToJs(html)

    assert.ok(out.includes('<!-- rmx:h:1 -->'), 'preserves hydration comment')
    assert.ok(out.includes('href="/a.js"'), 'rewrites link href')
    assert.ok(out.includes('src="/b.js"'), 'rewrites script src')
    assert.ok(out.includes('"moduleUrl":"/c.js"'), 'rewrites inline module URL')
    assert.ok(out.includes('href="/src/page.tsx"'), 'leaves <a> href untouched')
  })

  it('returns the input unchanged when nothing matches', () => {
    let html = '<p>hello <code>page.tsx</code></p>'
    assert.equal(rewriteExtensionsToJs(html), html)
  })
})

describe('toOutput', () => {
  it('skips 204 No Content responses', async () => {
    let output = await toOutput({
      pathname: '/',
      filepath: '/index.html',
      response: new Response(null, { status: 204 }),
    })

    assert.equal(output, null)
  })

  it('rewrites extensions in HTML responses', async () => {
    let output = await toOutput({
      pathname: '/',
      filepath: '/index.html',
      response: new Response('<script src="/entry.tsx"></script>', {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      }),
    })

    assert.ok(output != null)
    assert.equal(output.path, '/index.html')
    assert.equal(typeof output.content, 'string')
    assert.ok((output.content as string).includes('src="/entry.js"'))
  })

  it('rewrites the script filepath to .js and rewrites import specifiers', async () => {
    let output = await toOutput({
      pathname: '/entry.tsx',
      filepath: '/entry.tsx',
      response: new Response("import x from './x.tsx'\n", {
        headers: { 'Content-Type': 'text/javascript' },
      }),
    })

    assert.ok(output != null)
    assert.equal(output.path, '/entry.js')
    assert.ok((output.content as string).includes("'./x.js'"))
  })

  it('returns raw bytes for non-HTML, non-script responses', async () => {
    let output = await toOutput({
      pathname: '/favicon.ico',
      filepath: '/favicon.ico',
      response: new Response(new Uint8Array([1, 2, 3]), {
        headers: { 'Content-Type': 'image/x-icon' },
      }),
    })

    assert.ok(output != null)
    assert.equal(output.path, '/favicon.ico')
    assert.ok(output.content instanceof Uint8Array)
    assert.equal((output.content as Uint8Array).length, 3)
  })
})
