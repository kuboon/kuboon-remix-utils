import { init, parse as parseModule } from 'es-module-lexer'

import { parse } from './html-parser.ts'
import type { HTMLElement } from './html-parser.ts'

const BASE_URL = 'http://localhost'

/**
 * The minimal surface the crawler needs from a router.
 *
 * A `remix/fetch-router` `Router` satisfies this structurally, but so does any object with a
 * web-`fetch`-shaped method, which keeps this package free of framework dependencies.
 */
export interface RouterLike {
  fetch(request: Request): Response | Promise<Response>
}

/**
 * A single crawled response, ready to be written to disk.
 */
export interface CrawlResult {
  /** The request pathname that produced this response. */
  pathname: string
  /** The relative output path (HTML pages map to `<pathname>/index.html`). */
  filepath: string
  /** The response returned by the router. */
  response: Response
}

/**
 * A page that responded non-OK during the crawl.
 */
export interface CrawlFailure {
  /** The request pathname that failed. */
  pathname: string
  /** The HTTP status code of the response. */
  status: number
  /** The HTTP status text of the response (may be empty). */
  statusText: string
  /** The page whose HTML linked to `pathname`, or `undefined` for a seed path. */
  referrer?: string
}

/**
 * How the crawler should react to a page that responds non-OK:
 * - `'throw'` — abort the crawl, throwing a {@link CrawlError} (the default).
 * - `'skip'` — drop the page and keep crawling.
 * - a function — called per failure; return `'throw'` or `'skip'` to decide. Use
 *   the function form to observe/collect broken links (e.g. to log them and fail
 *   the build yourself afterwards).
 */
export type CrawlErrorHandler =
  | 'throw'
  | 'skip'
  | ((failure: CrawlFailure) => 'throw' | 'skip')

/**
 * Thrown by {@link crawl} when a page responds non-OK and the error is not
 * skipped. Carries the structured {@link CrawlFailure}s so callers can inspect
 * the status, pathname, and referring page instead of parsing a message string.
 */
export class CrawlError extends Error {
  readonly failures: CrawlFailure[]
  constructor(failures: CrawlFailure[]) {
    super(CrawlError.format(failures))
    this.name = 'CrawlError'
    this.failures = failures
  }
  private static format(failures: CrawlFailure[]): string {
    return failures
      .map((f) => {
        let from = f.referrer ? ` — linked from ${f.referrer}` : ''
        return `Crawl failed: ${f.status} ${f.statusText} (${f.pathname})${from}`
      })
      .join('\n')
  }
}

/**
 * Options controlling {@link crawl}.
 */
export interface CrawlOptions {
  /** Seed pathnames to start from. Defaults to `['/']`. */
  paths?: string[]
  /** Follow links discovered in rendered HTML. Defaults to `true`. */
  spider?: boolean
  /** Number of concurrent in-flight requests. Defaults to `1`. */
  concurrency?: number
  /** Return `true` to crawl a page's links even when it is marked `nofollow`. */
  ignorePageNofollow?: (pathname: string) => boolean
  /**
   * How to handle a page that responds non-OK. Defaults to `'throw'`, which
   * aborts the crawl with a {@link CrawlError}. Pass `'skip'` or a function to
   * keep crawling past broken links. See {@link CrawlErrorHandler}.
   */
  onError?: CrawlErrorHandler
  /**
   * Where a response is written, as a path relative to the site root.
   *
   * Defaults to `<pathname>/index.html` for HTML and the pathname itself for everything else. A
   * static host decides this — `about.html` and `about/index.html` are not interchangeable — so a
   * build for a particular host passes its rule here. See `@kuboon/remix-ssg/site`'s `githubPages`.
   *
   * @param pathname The request path that produced the response
   * @param response The response, for deciding by content type
   */
  outputPath?: (pathname: string, response: Response) => string
}

/**
 * Drives `router.fetch()` starting from the seed paths, spidering links and asset references found
 * in rendered HTML, and yields each response as a {@link CrawlResult}.
 *
 * Rendering happens inside the router; this function never renders directly.
 * @param router A router (or any `fetch`-shaped object) to drive.
 * @param options Crawl options.
 */
export async function* crawl(
  router: RouterLike,
  options: CrawlOptions = {},
): AsyncIterableIterator<CrawlResult> {
  let {
    paths = ['/'],
    spider = true,
    concurrency = 1,
    ignorePageNofollow,
    onError = 'throw',
    outputPath = defaultOutputPath,
  } = options

  interface QueueItem {
    pathname: string
    referrer?: string
  }

  let queue: QueueItem[] = []
  let visited = new Set<string>()
  let results: CrawlResult[] = []
  let active = 0
  let error: unknown

  let notify: () => void = () => {}
  let gate = new Promise<void>((r) => (notify = r))
  function bump() {
    let n = notify
    gate = new Promise<void>((r) => (notify = r))
    n()
  }

  enqueue(paths)

  while (true) {
    while (active < concurrency && queue.length > 0) {
      fetchOne(queue.shift()!)
    }

    if (error) throw error
    if (results.length > 0) {
      yield results.shift()!
      continue
    }
    if (active === 0 && queue.length === 0) break

    await gate
  }

  function enqueue(pathnames: string[], referrer?: string) {
    pathnames.forEach((p) => {
      if (!visited.has(p)) {
        visited.add(p)
        queue.push({ pathname: p, referrer })
      }
    })
  }

  async function fetchOne({ pathname, referrer }: QueueItem) {
    active++
    try {
      let response = await router.fetch(new Request(`${BASE_URL}${pathname}`))

      if (!response.ok) {
        let failure: CrawlFailure = {
          pathname,
          status: response.status,
          statusText: response.statusText,
          referrer,
        }
        let decision = typeof onError === 'function' ? onError(failure) : onError
        if (decision === 'skip') return
        throw new CrawlError([failure])
      }

      let isHtml = response.headers.get('Content-Type')?.includes('text/html')

      if (isHtml) {
        let cloned = response.clone()
        results.push({ pathname, filepath: outputPath(pathname, response), response })

        let dom = parse(await cloned.text())

        enqueue(extractAssetPaths(dom.elements, pathname), pathname)

        if (spider && (ignorePageNofollow?.(pathname) || shouldCrawlLinks(dom.elements))) {
          enqueue(extractLinkPaths(dom.elements, pathname), pathname)
        }
      } else if (isScript(response)) {
        let cloned = response.clone()
        results.push({ pathname, filepath: outputPath(pathname, response), response })
        enqueue(await extractImportPaths(await cloned.text(), pathname), pathname)
      } else {
        results.push({ pathname, filepath: outputPath(pathname, response), response })
      }
    } catch (e) {
      error = e
    } finally {
      active--
      bump()
    }
  }
}

/** The rule when a caller names none: a directory index for pages, the path itself for the rest. */
function defaultOutputPath(pathname: string, response: Response): string {
  return response.headers.get('Content-Type')?.includes('text/html')
    ? pathname.replace(/\/?$/, '/index.html')
    : pathname
}

/** Whether a response is JavaScript, and so worth reading for imports. */
function isScript(response: Response): boolean {
  let contentType = response.headers.get('Content-Type') ?? ''
  return contentType.includes('javascript') || contentType.includes('ecmascript')
}

/**
 * The paths a JavaScript module imports.
 *
 * A code-split bundle reaches its shared chunks only through `import` — no HTML mentions them — so
 * a crawler that reads markup alone stops at the entry chunk and leaves the rest unwritten.
 * Following imports keeps one rule for the whole site: what is reachable is what gets generated.
 *
 * Only static specifiers and dynamic `import()` with a literal argument are followed; there is
 * nothing to resolve in `import(someVariable)`.
 */
async function extractImportPaths(code: string, baseUrl: string): Promise<string[]> {
  await init

  let imports
  try {
    ;[imports] = parseModule(code)
  } catch {
    // Not parseable as a module — nothing to follow, and not this function's job to complain.
    return []
  }

  return imports
    .map((entry) => entry.n)
    .filter((specifier): specifier is string => specifier !== undefined)
    // Explicitly relative or root-absolute only. A bare specifier is a package name, and
    // resolving one against the page would invent a path the site never had.
    .filter((specifier) => /^\.{0,2}\//.test(specifier))
    .map((specifier) => resolveHref(specifier, baseUrl))
    .filter((href): href is string => href !== null)
}

function extractAssetPaths(elements: HTMLElement[], baseUrl: string): string[] {
  let linkAttrs = elements
    .filter((el) => {
      if (el.name !== 'link') return false
      let rels = rel(el)
      return !rels.includes('nofollow')
    })
    .map((el) => el.getAttribute('href'))

  let srcAttrs = elements
    .filter((el) => (el.name === 'script' || el.name === 'img') && el.getAttribute('src'))
    .map((el) => el.getAttribute('src'))

  return [...linkAttrs, ...srcAttrs]
    .filter((href): href is string => href != null)
    .filter((href) => !isNonNavigable(href))
    .filter(isRelativeUrl)
    .map((href) => resolveHref(href, baseUrl))
    .filter((href): href is string => href != null)
}

function extractLinkPaths(elements: HTMLElement[], baseUrl: string): string[] {
  return elements
    .filter(
      (el) =>
        !rel(el).includes('nofollow') &&
        (el.name === 'a' || (el.name === 'link' && rel(el).includes('alternate'))),
    )
    .map((el) => el.getAttribute('href'))
    .filter((href): href is string => href != null)
    .filter((href) => !isNonNavigable(href))
    .filter(isRelativeUrl)
    .map((href) => resolveHref(href, baseUrl))
    .filter((href): href is string => href != null)
}

function shouldCrawlLinks(elements: HTMLElement[]): boolean {
  let hasPageNoFollowDirective = elements.some((el) => {
    if (el.name !== 'meta') return false
    let name = el.getAttribute('name')?.toLowerCase()
    if (name !== 'robots' && name !== 'googlebot') return false
    let content = el.getAttribute('content')?.toLowerCase() ?? ''
    return content.split(/[\s,]+/).includes('nofollow')
  })
  return !hasPageNoFollowDirective
}

function rel(el: HTMLElement) {
  return el.getAttribute('rel')?.split(/\s+/) || []
}

function isNonNavigable(href: string): boolean {
  return (
    href.startsWith('#') ||
    href.startsWith('mailto:') ||
    href.startsWith('tel:') ||
    href.startsWith('javascript:') ||
    href.startsWith('data:')
  )
}

function isRelativeUrl(href: string): boolean {
  return !href.startsWith('http://') && !href.startsWith('https://') && !href.startsWith('//')
}

function resolveHref(href: string, baseUrl: string): string | null {
  if (/^https?:\/\//.test(href) || href.startsWith('//')) {
    try {
      return new URL(href).pathname
    } catch {
      return null
    }
  }

  if (href.startsWith('/')) return href

  try {
    return new URL(href, `${BASE_URL}${baseUrl}`).pathname
  } catch {
    return null
  }
}
