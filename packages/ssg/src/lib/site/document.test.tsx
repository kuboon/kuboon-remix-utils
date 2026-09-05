import * as assert from '@remix-run/assert'
import { describe, it } from '@std/testing/bdd'
import type { RemixNode } from '@remix-run/ui'

import { htmlDocument } from './document.ts'

describe('htmlDocument', () => {
  it('opens with a doctype, which remix/ui never emits itself', async () => {
    let html = await htmlDocument(
      <html lang='en'>
        <head>
          <title>Hi</title>
        </head>
        <body>
          <p>Hello</p>
        </body>
      </html>,
    ).text()

    assert.ok(html.startsWith('<!DOCTYPE html>'))
  })

  it('keeps the flush marker the client runtime navigates by', async () => {
    // `renderToString` strips this, and a page served without it leaves an internal link changing
    // the URL and nothing else, silently. So the marker is the point of streaming here.
    let html = await htmlDocument(
      <html lang='en'>
        <body>
          <p>Hello</p>
        </body>
      </html>,
    ).text()

    assert.ok(html.trimEnd().endsWith('<!-- rmx:flush document -->'))
  })

  it('defaults to an HTML content type, and takes an override', async () => {
    let plain = htmlDocument(<html lang='en'></html>)
    assert.equal(plain.headers.get('content-type'), 'text/html; charset=utf-8')

    let custom = htmlDocument(<html lang='en'></html>, {
      response: { status: 404, headers: { 'content-type': 'text/html' } },
    })
    assert.equal(custom.status, 404)
    assert.equal(custom.headers.get('content-type'), 'text/html')
  })

  it('reports a render error instead of swallowing it', async () => {
    function Boom(): () => RemixNode {
      return () => {
        throw new Error('boom')
      }
    }

    await assert.rejects(() =>
      htmlDocument(
        <html lang='en'>
          <body>
            <Boom />
          </body>
        </html>,
      ).text()
    )
  })
})
