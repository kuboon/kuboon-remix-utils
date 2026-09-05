/**
 * A Remix node tree as a complete HTML document response.
 *
 * This exists because two details are easy to get wrong and neither fails loudly.
 *
 * `@remix-run/ui` never emits a doctype — `renderToStream` does not add one and the runtime only
 * ever strips them off frame content it receives — so a document that does not carry one renders
 * in quirks mode.
 *
 * And the choice of renderer matters more than it looks. `renderToString` is `renderToStream` with
 * `stripFlushMarkers()` over the result, and the marker it strips,
 * `<!-- rmx:flush document -->`, is how the client runtime recognises a whole document rather than
 * a fragment. Serve pages without it and, on any page carrying an island, an internal link changes
 * the URL and leaves the page alone: no error, no console warning, and the fetch returning 200 the
 * whole time.
 *
 * So this streams, and prepends the doctype to the stream rather than buffering to add it.
 */

import { renderToStream } from '@remix-run/ui/server'
import type { RemixNode } from '@remix-run/ui'
import type { RenderToStreamOptions } from '@remix-run/ui/server'

const DOCTYPE = new TextEncoder().encode('<!DOCTYPE html>')

/** Options for {@link htmlDocument}. */
export interface HtmlDocumentOptions extends RenderToStreamOptions {
  /** Response init. `content-type` defaults to `text/html; charset=utf-8`. */
  response?: ResponseInit
}

/**
 * Renders a node tree as an HTML document response.
 *
 * @param node The document — an `<html>` element and everything under it
 * @param options Render options, plus `response` for status and headers
 * @returns The response, streaming, with a doctype and an HTML content type
 *
 * @example
 * ```tsx
 * return htmlDocument(
 *   <html lang='en'>
 *     <head><title>Hello</title></head>
 *     <body>…</body>
 *   </html>,
 * )
 * ```
 */
export function htmlDocument(node: RemixNode, options?: HtmlDocumentOptions): Response {
  let { response, ...render } = options ?? {}

  let headers = new Headers(response?.headers)
  if (!headers.has('content-type')) headers.set('content-type', 'text/html; charset=utf-8')

  let stream = renderToStream(node, {
    onError(error) {
      throw error
    },
    ...render,
  })

  return new Response(withDoctype(stream), { ...response, headers })
}

/** Puts the doctype in front of the rendered stream without waiting for it. */
function withDoctype(html: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  return ReadableStream.from((async function* () {
    yield DOCTYPE
    yield* html
  })())
}
