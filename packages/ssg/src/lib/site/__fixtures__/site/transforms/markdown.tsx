/**
 * The site's own "Markdown": first line is the title, the rest is the body.
 *
 * Deliberately not a real Markdown library — what this fixture exercises is the transform contract
 * and the fact that the framework never sees the format, not anyone's parser. Markdown is text, so
 * it places no islands and ships no JavaScript.
 */

import type { FileTransform } from '../../../file-tree.ts'
import { renderPage } from '../layout.tsx'

export function markdown(context: { base: string }): FileTransform {
  return {
    match: (relativePath) => relativePath.endsWith('.md'),

    path: (relativePath) => {
      let withoutExtension = relativePath.replace(/\.md$/, '').replace(/(^|\/)index$/, '')
      return `/${withoutExtension}`.replace(/\/$/, '') || '/'
    },

    async render(file) {
      let source = await Deno.readTextFile(file.url)
      let [title, ...rest] = source.split('\n')

      return {
        body: await renderPage({
          title,
          base: context.base,
          islandUrls: {},
          children: <p>{rest.join('\n').trim()}</p>,
        }),
        contentType: 'text/html; charset=utf-8',
      }
    },
  }
}
