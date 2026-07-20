import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { parse } from './html-parser.ts'
import type { CrawlResult } from './crawl.ts'

const SCRIPT_FILE_EXT = /\.(?:tsx?|jsx|mts)$/
const SCRIPT_EXT_IN_PATH = /\.(?:tsx?|jsx|mts)(?=[?#]|$)/
const SCRIPT_EXT_IN_JS_IMPORT = /\.(?:tsx?|jsx|mts)(?=["'?#])/g

/**
 * Writes one {@link CrawlResult} to disk under `outputDir`.
 *
 * HTML responses are written with script/style references rewritten from TS/JSX source extensions to
 * `.js` for static hosting; script responses are written as `.js` with their import specifiers
 * rewritten; everything else is written as raw bytes. A `204 No Content` response is skipped.
 * @param outputDir Directory to write into.
 * @param result The crawl result to write.
 * @returns The absolute output path written, or `null` when the response was skipped.
 */
export async function writeResult(outputDir: string, result: CrawlResult): Promise<string | null> {
  let { filepath, response } = result

  if (response.status === 204) {
    return null
  }

  let outputFilepath = SCRIPT_FILE_EXT.test(filepath)
    ? filepath.replace(SCRIPT_FILE_EXT, '.js')
    : filepath
  let outputPath = path.join(outputDir, outputFilepath)
  await fs.mkdir(path.dirname(outputPath), { recursive: true })

  let contentType = response.headers.get('Content-Type')

  if (contentType?.includes('text/html')) {
    let html = await response.text()
    // Update script references for static HTML hosting.
    let updated = rewriteExtensionsToJs(html)
    await fs.writeFile(outputPath, updated, 'utf-8')
  } else if (SCRIPT_FILE_EXT.test(filepath)) {
    let content = await response.text()
    // Write all script files to disk as JS files
    await fs.writeFile(outputPath, content.replace(SCRIPT_EXT_IN_JS_IMPORT, '.js'), 'utf-8')
  } else {
    await fs.writeFile(outputPath, new Uint8Array(await response.arrayBuffer()))
  }

  return outputPath
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
