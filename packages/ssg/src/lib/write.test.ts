import * as assert from '@remix-run/assert'
import { describe, it } from '@std/testing/bdd'

import { rewriteExtensionsToJs, writeResult } from './write.ts'

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

describe('writeResult', () => {
  it('skips 204 No Content responses', async () => {
    let output = await writeResult('/tmp/unused-ssg-output', {
      pathname: '/',
      filepath: '/index.html',
      response: new Response(null, { status: 204 }),
    })

    assert.equal(output, null)
  })
})
