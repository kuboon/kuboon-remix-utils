/**
 * Assembling a site into a router.
 *
 * Everything a site would otherwise hand-write lives here: the deploy-prefix mount, static file
 * serving, the compiled client chunks and their route, pages discovered from `routes/`, and index
 * and entry pages for each content source.
 */

import * as path from 'node:path'
import { createRouter, type RouteBuilder, type Router } from 'remix/router'
import { createFileResponse } from 'remix/response/file'
import { openLazyFile } from 'remix/fs'
import { createAssetServer } from '@kuboon/remix-assets-deno'
import type { DenoAssetServer } from '@kuboon/remix-assets-deno'
import type { RemixNode } from 'remix/ui'

import type { ContentEntry, ContentSource, PageMeta, PageModule, SiteConfig } from './config.ts'
import { discoverIslands, discoverPages } from './discover.ts'
import { renderDocument } from './layout.tsx'
import { hrefFor } from './paths.ts'

/** How the router will be driven. */
export type SiteMode = 'static' | 'serve'

/** Options for {@link createSite}. */
export interface CreateSiteOptions {
  /** The site root — the directory holding `routes/`, `islands/`, and `static/`. */
  rootDir: string
  /**
   * `'static'` when the router is about to be crawled into files, `'serve'` when it will answer
   * live requests. A page marked `dynamic` answers `204 No Content` in `'static'`, so the crawl
   * writes nothing for it rather than freezing one request's answer into a file.
   */
  mode: SiteMode
  /** Deploy path prefix, without a trailing slash. Defaults to `BASE_URL`'s pathname, or `''`. */
  base?: string
  /** Minify the client chunks. Defaults to `true` in `'static'`, `false` in `'serve'`. */
  minify?: boolean
}

/** An assembled site. */
export interface Site {
  /** The router, ready to `fetch()` — crawled by the build, served by the dev server. */
  router: Router
  /** The compiled client chunks. */
  assets: DenoAssetServer
  /** Deploy path prefix. */
  base: string
  /** Every path the crawl should start from: the home page, content entries, and chunk URLs. */
  seeds: string[]
  /** Patterns skipped in `'static'` because they are marked `dynamic`. */
  skipped: string[]
}

/**
 * Builds a site's router from its config and its directories.
 *
 * @param config The site, from `site.config.ts`
 * @param options Where the site lives and how it will be driven
 * @returns The router, the compiled chunks, and what the build needs to know
 */
export async function createSite(
  config: SiteConfig,
  options: CreateSiteOptions,
): Promise<Site> {
  let rootDir = path.resolve(options.rootDir)
  let base = options.base ?? baseFromEnv()
  let staticDir = path.join(rootDir, 'static')

  let islands = await discoverIslands(path.join(rootDir, 'islands'))
  let assets = await createAssetServer({
    rootDir,
    entrypoints: islands.map((entry) => entry.filePath),
    basePath: `${base}/assets`,
    mode: 'bundle',
    bundle: {
      minify: options.minify ?? options.mode === 'static',
      // A static deploy would otherwise carry a `.map` per chunk for no one.
      sourcemap: options.mode === 'static' ? 'none' : 'linked',
    },
  })

  // Asked of the bundler rather than predicted: esbuild names outputs relative to the lowest
  // common ancestor of the entrypoints, which moves as islands are added.
  let islandUrls: Record<string, string> = {}
  for (let entry of islands) islandUrls[entry.name] = assets.entryUrl(entry.filePath)

  let pages = await discoverPages(path.join(rootDir, 'routes'))
  let loaded = await Promise.all(pages.map(async (page) => ({
    ...page,
    module: await loadPage(page.filePath),
  })))

  let skipped: string[] = []
  let seeds: string[] = [hrefFor(base, '/')]
  let router = createRouter()

  let render = (meta: PageMeta, children: RemixNode) =>
    renderDocument({
      title: meta.title === config.title ? meta.title : `${meta.title} — ${config.title}`,
      description: meta.description ?? config.description,
      base,
      siteTitle: config.title,
      nav: config.nav ?? [],
      head: config.head,
      footer: config.footer,
      islandUrls: meta.hydrate ? islandUrls : {},
      children,
    })

  router.mount(base || '/', (app: RouteBuilder) => {
    app.get(
      '/static/*path',
      ({ request, params }) =>
        serveStatic(request, staticDir, (params as Record<string, string | undefined>).path ?? ''),
    )

    app.get('/assets/*path', ({ request }) => assets.fetch(request))

    for (let page of loaded) {
      let meta = page.module.meta ?? { title: config.title }
      if (options.mode === 'static' && meta.dynamic === true) {
        skipped.push(page.pattern)
        app.get(page.pattern, () => new Response(null, { status: 204 }))
        continue
      }

      app.get(page.pattern, () => render(meta, page.module.default()))
    }

    let patterns = new Set(loaded.map((page) => page.pattern))
    for (let [mount, source] of Object.entries(config.content ?? {})) {
      installContent(app, mount, source, patterns, render, base)
    }
  })

  return { router, assets, base, seeds, skipped }
}

/** Mounts one content source: an index at its path, and an entry page under it. */
function installContent(
  app: RouteBuilder,
  mount: string,
  source: ContentSource,
  pagePatterns: Set<string>,
  render: (meta: PageMeta, children: RemixNode) => Promise<Response>,
  base: string,
): void {
  // A page file at the same path wins, so a site can write its own index without losing the rest.
  if (!pagePatterns.has(mount)) {
    app.get(mount, async () => {
      let entries = sortEntries(await source.list())
      return render({ title: titleOf(mount) }, contentIndex(base, mount, entries))
    })
  }

  app.get(`${mount}/:slug`, async ({ params }) => {
    let slug = (params as Record<string, string | undefined>).slug ?? ''
    let entry = await source.get(slug)
    if (entry === null) return new Response('Not found', { status: 404 })

    return render(
      { title: entry.title, description: entry.summary },
      <article class='entry'>
        <h1>{entry.title}</h1>
        {entry.date ? <time datetime={entry.date}>{entry.date}</time> : null}
        {entry.body}
        <p>
          <a href={`${base}${mount}`}>← {titleOf(mount)}</a>
        </p>
      </article>,
    )
  })
}

/** The default listing for a content mount, used when the site did not write its own index page. */
function contentIndex(base: string, mount: string, entries: ContentEntry[]): RemixNode {
  return (
    <>
      <h1>{titleOf(mount)}</h1>
      <ul class='entry-list'>
        {entries.map((entry) => (
          <li>
            <a href={`${base}${mount}/${entry.slug}`}>{entry.title}</a>
            {entry.date ? <time datetime={entry.date}>{entry.date}</time> : null}
            {entry.summary ? <p>{entry.summary}</p> : null}
          </li>
        ))}
      </ul>
    </>
  )
}

/** Newest first when dated, then by title, so a build is reproducible. */
function sortEntries(entries: ContentEntry[]): ContentEntry[] {
  return [...entries].sort((a, b) => {
    if (a.date && b.date && a.date !== b.date) return a.date < b.date ? 1 : -1
    if (a.date && !b.date) return -1
    if (!a.date && b.date) return 1
    return a.title.localeCompare(b.title)
  })
}

/** `/blog` -> `Blog`. Only used when a site did not write its own index page. */
function titleOf(mount: string): string {
  let name = mount.replace(/^\/+/, '').split('/').pop() ?? ''
  return name.charAt(0).toUpperCase() + name.slice(1)
}

/** Loads a page module and checks it looks like one, so a typo fails at startup. */
async function loadPage(filePath: string): Promise<PageModule> {
  let module = await import(toFileUrl(filePath)) as Partial<PageModule>

  if (typeof module.default !== 'function') {
    throw new Error(`Page "${filePath}" has no default export. Export the component as default.`)
  }
  if (module.meta !== undefined && typeof module.meta.title !== 'string') {
    throw new Error(`Page "${filePath}" exports a meta without a string title.`)
  }

  return module as PageModule
}

/**
 * Serves one file from `static/`, with the Content-Type, ETag, and conditional handling
 * `createFileResponse` supplies.
 */
async function serveStatic(request: Request, staticDir: string, rel: string): Promise<Response> {
  if (rel === '' || rel.includes('..')) return new Response('Forbidden', { status: 403 })

  let filePath = path.join(staticDir, rel)
  let info: Deno.FileInfo
  try {
    info = await Deno.stat(filePath)
  } catch {
    return new Response('Not found', { status: 404 })
  }
  if (!info.isFile) return new Response('Not found', { status: 404 })

  return await createFileResponse(openLazyFile(filePath), request, {
    cacheControl: 'public, max-age=3600',
  })
}

/** A `file:` URL for a dynamic import, with each segment escaped. */
function toFileUrl(filePath: string): string {
  let url = new URL('file://')
  url.pathname = filePath.split('/').map(encodeURIComponent).join('/')
  return url.href
}

/** The deploy prefix, from `BASE_URL`'s pathname. */
function baseFromEnv(): string {
  let url = Deno.env.get('BASE_URL') ?? ''
  return url ? new URL(url).pathname.replace(/\/+$/, '') : ''
}
