/**
 * The site's own "Markdown": first line is the title, the rest is the body.
 *
 * Deliberately not a real Markdown library — what this fixture exercises is the transform contract
 * and the fact that the framework never sees the format, not anyone's parser.
 */

import type { FileTransform } from '../../../file-tree.ts'
import { Counter } from '../islands/counter.tsx'
import { Total } from '../islands/total.tsx'
import { renderPage } from '../layout.tsx'

export function markdown(
  context: { base: string; islandUrls: Record<string, string> },
): FileTransform {
  return {
    match: (relativePath) => relativePath.endsWith('.md'),

    path: (relativePath) => {
      let withoutExtension = relativePath.replace(/\.md$/, '').replace(/(^|\/)index$/, '')
      return `/${withoutExtension}`.replace(/\/$/, '') || '/'
    },

    async render(absolutePath) {
      let source = await Deno.readTextFile(absolutePath)
      let [title, ...rest] = source.split('\n')
      let body = rest.join('\n').trim()
      // A page opts into hydration by saying so, so a page without islands ships no JavaScript.
      let hydrate = body.includes('{{islands}}')

      return {
        body: await renderPage({
          title,
          base: context.base,
          islandUrls: context.islandUrls,
          hydrate,
          children: hydrate
            ? (
              <>
                <p>{body.replace('{{islands}}', '')}</p>
                <Counter />
                <Total />
              </>
            )
            : <p>{body}</p>,
        }),
        contentType: 'text/html; charset=utf-8',
      }
    },
  }
}
