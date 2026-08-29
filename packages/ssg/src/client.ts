/**
 * The browser half of the site framework.
 *
 * This module is bundled into every island chunk, which is what lets it do two things no per-site
 * file has to do any more: start the runtime, and resolve an island's logical id to the URL the
 * bundler actually emitted.
 *
 * ## Why island ids are not URLs
 *
 * `clientEntry()` wants `"<moduleUrl>#<exportName>"`, and the obvious move is to put the chunk's
 * public URL there. But that expression is evaluated in the browser as well as on the server, so
 * the browser would have to know the deploy base path *and* predict the bundler's output naming —
 * which shifts with the set of entrypoints, because esbuild names outputs relative to the lowest
 * common ancestor of all of them.
 *
 * So an island's id is a stable logical name (`island:counter#Counter`), and the server embeds the
 * name -> URL map it got from the bundler. Nothing in the browser predicts anything.
 */

import { clientEntry, run } from '@remix-run/ui'
import type {
  EntryComponent,
  Handle,
  LoadModule,
  RemixNode,
  SerializableProps,
} from '@remix-run/ui'

/** Scheme for logical island ids, so a real URL can never be mistaken for one. */
const ISLAND_SCHEME = 'island:'

/** Element id of the JSON script the server writes the island URL map into. */
export const ISLAND_MAP_ELEMENT_ID = 'rmx-ssg-islands'

/**
 * Declares a hydrated island.
 *
 * @param name The island's name — its path under `islands/`, without the extension
 * @param exportName The name this island is exported under, which the runtime imports
 * @param component The component, in the Remix UI runtime shape
 * @returns The component, tagged for hydration
 *
 * @example
 * ```tsx
 * export const Counter = island('counter', 'Counter', function Counter(handle) {
 *   return () => <button>{handle.props.label}</button>
 * })
 * ```
 */
export function island<props extends SerializableProps = Record<never, never>>(
  name: string,
  exportName: string,
  component: (handle: Handle<props>) => () => RemixNode,
): EntryComponent<props> {
  return clientEntry<props>(`${ISLAND_SCHEME}${name}#${exportName}`, component)
}

/** Reads the name -> chunk URL map the server embedded in the document. */
function islandUrls(): Record<string, string> {
  let element = document.getElementById(ISLAND_MAP_ELEMENT_ID)
  if (element === null) return {}

  try {
    return JSON.parse(element.textContent ?? '{}')
  } catch {
    return {}
  }
}

/**
 * Resolves what a `clientEntry()` id named into a module, then picks the export.
 *
 * A logical `island:` id goes through the embedded map; anything else is treated as a URL, so a
 * hand-written `clientEntry('/js/x.js#X', …)` keeps working.
 */
let loadModule: LoadModule = async (moduleUrl, exportName) => {
  let url = moduleUrl
  if (moduleUrl.startsWith(ISLAND_SCHEME)) {
    let mapped = islandUrls()[moduleUrl.slice(ISLAND_SCHEME.length)]
    if (mapped === undefined) {
      throw new Error(
        `No chunk URL for island "${moduleUrl.slice(ISLAND_SCHEME.length)}". ` +
          `The document is missing it from #${ISLAND_MAP_ELEMENT_ID}.`,
      )
    }
    url = mapped
  }

  let module = await import(url) as Record<string, unknown>
  let picked = module[exportName]
  if (typeof picked !== 'function') {
    throw new Error(`Module "${url}" has no function export named "${exportName}".`)
  }

  return picked
}

/**
 * Starts the client runtime, once per document.
 *
 * Every island chunk imports this module, and code splitting puts it in a chunk they share — so
 * this runs exactly once no matter how many islands a page loads, and there is no separate runtime
 * entrypoint for a site to declare.
 */
let started = false
function start(): void {
  if (started || typeof document === 'undefined') return
  started = true
  run({ loadModule })
}

start()
