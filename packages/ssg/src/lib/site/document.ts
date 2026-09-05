/**
 * A Remix node tree as a complete HTML document response.
 *
 * The doctype and the content type are `createHtmlResponse`'s job — it prepends `<!DOCTYPE html>`
 * lazily, reading only the first chunk to see whether one is already there, so a streamed document
 * stays streamed. What this adds is the choice of renderer, which is the part that is easy to get
 * wrong and does not fail loudly.
 *
 * `renderToString` is `renderToStream` with `stripFlushMarkers()` over the result, and the marker
 * it strips, `<!-- rmx:flush document -->`, is how the client runtime recognises a whole document
 * rather than a fragment. Serve pages without it and, on any page carrying an island, an internal
 * link changes the URL and leaves the page alone: no error, no console warning, and the fetch
 * returning 200 the whole time. So a page rendered for serving streams, always.
 */

import { createHtmlResponse } from '@remix-run/response/html'
import { renderToStream } from '@remix-run/ui/server'
import type { RemixNode } from '@remix-run/ui'
import type { RenderToStreamOptions } from '@remix-run/ui/server'

/** Options for {@link htmlDocument}. */
export interface HtmlDocumentOptions extends RenderToStreamOptions {
  /** Response init — status and headers. */
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

  return createHtmlResponse(
    renderToStream(node, {
      onError(error) {
        throw error
      },
      ...render,
    }),
    response,
  )
}
