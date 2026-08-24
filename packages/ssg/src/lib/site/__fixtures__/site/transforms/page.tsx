/**
 * The site's `.tsx` pages: a module exporting a component, rendered into the layout.
 *
 * This is the whole story for interactivity — a page that wants an island imports it and places it.
 * Markdown stays text.
 */

import type { RemixNode } from 'remix/ui'

import type { FileTransform } from '../../../file-tree.ts'
import { renderPage } from '../layout.tsx'

interface PageModule {
  default: () => RemixNode
  title?: string
  islands?: readonly string[]
}

export function page(
  context: { base: string; islandUrls: Record<string, string> },
): FileTransform {
  return {
    match: (relativePath) => relativePath.endsWith('.tsx'),

    path: (relativePath) => {
      let withoutExtension = relativePath.replace(/\.tsx$/, '').replace(/(^|\/)index$/, '')
      return `/${withoutExtension}`.replace(/\/$/, '') || '/'
    },

    async render(absolutePath, relativePath) {
      // Cached for the life of the process; `deno serve --watch` restarts when a page changes.
      let url = new URL('file://')
      url.pathname = absolutePath.split('/').map(encodeURIComponent).join('/')
      let module = await import(url.href) as PageModule

      let urls: Record<string, string> = {}
      for (let name of module.islands ?? []) {
        let chunk = context.islandUrls[name]
        if (chunk === undefined) throw new Error(`"${relativePath}" names no island "${name}".`)
        urls[name] = chunk
      }

      return {
        body: await renderPage({
          title: module.title ?? relativePath,
          base: context.base,
          islandUrls: urls,
          children: module.default(),
        }),
        contentType: 'text/html; charset=utf-8',
      }
    },
  }
}
