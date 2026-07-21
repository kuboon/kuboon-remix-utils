import { parse } from './html-parser.ts'
import type { CrawlResult } from './crawl.ts'

const SCRIPT_FILE_EXT = /\.(?:tsx?|jsx|mts)$/
const SCRIPT_EXT_IN_PATH = /\.(?:tsx?|jsx|mts)(?=[?#]|$)/
const SCRIPT_EXT_IN_JS_IMPORT = /\.(?:tsx?|jsx|mts)(?=["'?#])/g

/**
 * A single file to write, produced from a {@link CrawlResult}.
 *
 * `path` is the output path relative to the site root; HTML pages map to `<pathname>/index.html`
 * and script sources have their extension rewritten to `.js`. `content` is the finished body,
 * ready to write verbatim: a string for HTML/script responses (extensions rewritten) or raw
 * `Uint8Array` bytes for everything else.
 */
export interface OutputFile {
  /** Output path relative to the site root (e.g. `about/index.html`, `entry.js`). */
  path: string
  /** The finished file body to write as-is. */
  content: string | Uint8Array
}

/**
 * Transforms one {@link CrawlResult} into the {@link OutputFile} to write — the pure, runtime-free
 * half of writing a static site (no filesystem access).
 *
 * HTML responses get their script/style references rewritten from TS/JSX source extensions to `.js`
 * for static hosting; script responses are returned as `.js` with their import specifiers rewritten;
 * everything else is returned as raw bytes. A `204 No Content` response yields `null`.
 * @param result The crawl result to transform.
 * @returns The file to write, or `null` when the response should be skipped.
 */
export async function toOutput(result: CrawlResult): Promise<OutputFile | null> {
  let { filepath, response } = result

  if (response.status === 204) {
    return null
  }

  let path = SCRIPT_FILE_EXT.test(filepath) ? filepath.replace(SCRIPT_FILE_EXT, '.js') : filepath

  let contentType = response.headers.get('Content-Type')

  if (contentType?.includes('text/html')) {
    let html = await response.text()
    // Update script references for static HTML hosting.
    return { path, content: rewriteExtensionsToJs(html) }
  }

  if (SCRIPT_FILE_EXT.test(filepath)) {
    let content = await response.text()
    // Rewrite import specifiers so the emitted `.js` files resolve one another.
    return { path, content: content.replace(SCRIPT_EXT_IN_JS_IMPORT, '.js') }
  }

  return { path, content: new Uint8Array(await response.arrayBuffer()) }
}

/**
 * Rewrites TS/JSX source extensions to `.js` in a rendered HTML document's `<script src>` /
 * `<link href>` attributes and inline `<script>` bodies (which carry hydration module URLs).
 *
 * Comments are preserved so Remix UI's hydration markers (`<!-- rmx:h:* -->`, `<!-- /rmx:h -->`,
 * `<!-- rmx:flush document -->`) survive the parse/serialize round-trip; without them, frame
 * navigation fails with a "Can't insert an element before a doctype" HierarchyRequestError. Only
 * asset attributes and inline script bodies are touched, so `<a href>` links to source files and
 * code shown inside `<pre>`/`<code>` are left intact.
 * @param html The rendered HTML document.
 * @returns The rewritten HTML (or the original string when nothing changed).
 */
export function rewriteExtensionsToJs(html: string): string {
  let dom = parse(html, { comment: true })
  let changed = false

  for (let el of dom.elements) {
    if (el.name === 'script') {
      let src = el.getAttribute('src')
      if (src) {
        let next = src.replace(SCRIPT_EXT_IN_PATH, '.js')
        if (next !== src) {
          el.setAttribute('src', next)
          changed = true
        }
        continue
      }

      let body = el.innerHTML
      let next = body.replace(SCRIPT_EXT_IN_JS_IMPORT, '.js')
      if (next !== body) {
        el.innerHTML = next
        changed = true
      }
      continue
    }

    if (el.name === 'link') {
      let href = el.getAttribute('href')
      if (!href) continue

      let next = href.replace(SCRIPT_EXT_IN_PATH, '.js')
      if (next === href) continue

      el.setAttribute('href', next)
      changed = true
    }
  }

  return changed ? dom.toString() : html
}
