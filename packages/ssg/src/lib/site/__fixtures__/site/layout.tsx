/**
 * The document shell — a site's own, not the framework's.
 *
 * It also carries the one thing the browser cannot work out: the map from an island's logical name
 * to the chunk the bundler emitted, plus the scripts that load them.
 */

import { renderToString } from 'remix/ui/server'
import type { RemixNode } from 'remix/ui'

import { ISLAND_MAP_ELEMENT_ID } from '../../../../client.ts'

export interface LayoutProps {
  title: string
  base: string
  /** Name -> chunk URL for the islands this page places. Empty on a page with none. */
  islandUrls: Record<string, string>
  children: RemixNode
}

export function renderPage(props: LayoutProps): Promise<string> {
  let chunks = [...new Set(Object.values(props.islandUrls))]
  let home = props.base === '' ? '/' : props.base

  return renderToString(
    <html lang='en'>
      <head>
        <meta charset='utf-8' />
        <title>{props.title}</title>
        <link rel='icon' href={`${props.base}/static/favicon.svg`} />
        <link rel='stylesheet' href={`${props.base}/static/styles.css`} />
      </head>
      <body>
        <nav>
          <a href={home}>Home</a>
          <a href={`${props.base}/about`}>About</a>
          <a href={`${props.base}/blog/hello`}>Hello</a>
        </nav>
        <main>{props.children}</main>
        {chunks.length > 0
          ? (
            <>
              <script type='application/json' id={ISLAND_MAP_ELEMENT_ID}>
                {JSON.stringify(props.islandUrls)}
              </script>
              {chunks.map((src) => <script key={src} type='module' src={src}></script>)}
            </>
          )
          : null}
      </body>
    </html>,
  ).then((html) => `<!DOCTYPE html>${html}`)
}
