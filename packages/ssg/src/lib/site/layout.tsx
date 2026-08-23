/**
 * The document shell every page is rendered into.
 *
 * It also carries the one piece of wiring the browser cannot work out for itself: the map from an
 * island's logical name to the chunk the bundler emitted, plus the `<script>` tags that load those
 * chunks. See `../../client.ts` for why the mapping lives here rather than in the island's id.
 */

import { renderToString } from 'remix/ui/server'
import { createHtmlResponse } from 'remix/response/html'
import type { Handle, RemixNode } from 'remix/ui'

import { ISLAND_MAP_ELEMENT_ID } from '../../client.ts'
import type { NavLink } from './config.ts'
import { hrefFor } from './paths.ts'

/** Everything the shell needs for one page. */
export interface DocumentProps {
  /** Page title, already combined with the site title. */
  title: string
  description?: string
  /** Deploy path prefix, or `''`. */
  base: string
  siteTitle: string
  nav: NavLink[]
  head?: RemixNode
  footer?: RemixNode
  /**
   * Island name -> public chunk URL, embedded for the runtime to resolve against.
   *
   * Empty on a page that opted out of hydration, which is then a page with no JavaScript at all.
   */
  islandUrls: Record<string, string>
  children: RemixNode
}

function Document(handle: Handle<DocumentProps>) {
  return () => {
    let { title, description, base, siteTitle, nav, head, footer, islandUrls, children } =
      handle.props
    let chunks = [...new Set(Object.values(islandUrls))]

    return (
      <html lang='en'>
        <head>
          <meta charset='utf-8' />
          <meta name='viewport' content='width=device-width, initial-scale=1' />
          <title>{title}</title>
          {description ? <meta name='description' content={description} /> : null}
          <link rel='icon' href={`${base}/static/favicon.svg`} />
          <link rel='stylesheet' href={`${base}/static/styles.css`} />
          {head}
        </head>
        <body>
          <header class='site-header'>
            <a class='brand' href={hrefFor(base, '/')}>{siteTitle}</a>
            <nav class='site-nav'>
              {nav.map((link) => <a key={link.href} href={hrefFor(base, link.href)}>{link.label}
              </a>)}
            </nav>
          </header>
          <main class='site-main'>{children}</main>
          <footer class='site-footer'>{footer}</footer>
          {chunks.length > 0
            ? (
              <>
                <script type='application/json' id={ISLAND_MAP_ELEMENT_ID}>
                  {JSON.stringify(islandUrls)}
                </script>
                {chunks.map((src) => <script key={src} type='module' src={src}></script>)}
              </>
            )
            : null}
        </body>
      </html>
    )
  }
}

/**
 * Renders a page body inside the shell and returns the HTML response.
 *
 * @param props The shell inputs plus the page body
 * @returns A complete `text/html` response
 */
export async function renderDocument(props: DocumentProps): Promise<Response> {
  let html = '<!DOCTYPE html>' + (await renderToString(<Document {...props} />))
  return createHtmlResponse(html)
}
