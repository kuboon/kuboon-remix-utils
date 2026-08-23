/**
 * A directory, served — with transforms for the files that are not served verbatim.
 *
 * This is the counterpart to the asset server: same contract, different input. Where that one
 * compiles entrypoints into chunks, this one walks a directory and answers for what it finds. A
 * transform claims the files it knows how to render — Markdown, say — and everything else is served
 * as it sits.
 *
 * What this deliberately does not know is *how* to render anything. A transform arrives from the
 * site, which is what keeps a content format and its dependencies out of this package.
 */

import * as path from 'node:path'

import type { SiteMiddleware } from './middleware.ts'

/** Renders the files it claims. */
export interface FileTransform {
  /**
   * Whether this transform handles a file.
   *
   * @param relativePath Path under the tree's root, with `/` separators
   */
  match(relativePath: string): boolean
  /**
   * The URL path the file is served at, relative to the mount point.
   *
   * Derived from the path alone, and cheaply: the tree needs every route before anything is
   * rendered, so this may not read the file.
   *
   * @param relativePath Path under the tree's root
   * @returns A path starting with `/`
   */
  path(relativePath: string): string
  /**
   * Renders one file.
   *
   * @param absolutePath The file on disk
   * @param relativePath Its path under the tree's root
   * @returns The body and its media type
   */
  render(
    absolutePath: string,
    relativePath: string,
  ): Promise<{ body: string | Uint8Array; contentType: string }>
}

/** Options for {@link createFileTree}. */
export interface FileTreeOptions {
  /** Directory to serve. */
  rootDir: string
  /** Public mount point, without a trailing slash. Defaults to `''`. */
  basePath?: string
  /** Transforms, in priority order. Files no transform claims are served verbatim. */
  transforms?: readonly FileTransform[]
  /** `Cache-Control` for served files. Defaults to `'no-cache'`. */
  cacheControl?: string
}

interface Entry {
  absolutePath: string
  relativePath: string
  transform?: FileTransform
}

/**
 * Serves a directory as part of a site.
 *
 * @param options Where the directory is, where it mounts, and how to render it
 * @returns A middleware, ready to {@link compose}
 *
 * @example
 * ```ts
 * compose(
 *   createFileTree({ rootDir: 'pages', basePath: base, transforms: [markdown] }),
 *   createFileTree({ rootDir: 'static', basePath: `${base}/static` }),
 *   islands,
 * )
 * ```
 */
export async function createFileTree(options: FileTreeOptions): Promise<SiteMiddleware> {
  let rootDir = path.resolve(options.rootDir)
  let basePath = normalizeBasePath(options.basePath ?? '')
  let cacheControl = options.cacheControl ?? 'no-cache'
  let transforms = options.transforms ?? []

  let entries = new Map<string, Entry>()
  let rendered = new Map<string, { body: string | Uint8Array; contentType: string; etag: string }>()

  async function scan(): Promise<void> {
    entries.clear()
    rendered.clear()

    for (let relativePath of await walk(rootDir, rootDir)) {
      let transform = transforms.find((candidate) => candidate.match(relativePath))
      let servedAt = transform
        ? joinBase(basePath, transform.path(relativePath))
        : joinBase(basePath, `/${relativePath}`)

      let existing = entries.get(servedAt)
      if (existing !== undefined) {
        throw new Error(
          `Two files in "${rootDir}" are served at "${servedAt}": ` +
            `"${existing.relativePath}" and "${relativePath}".`,
        )
      }

      entries.set(servedAt, {
        absolutePath: path.join(rootDir, relativePath),
        relativePath,
        transform,
      })
    }
  }

  await scan()

  return {
    basePath,

    async fetch(request: Request): Promise<Response> {
      let pathname = decodeURIComponent(new URL(request.url).pathname)
      let entry = entries.get(pathname) ?? entries.get(pathname.replace(/\/$/, ''))
      if (entry === undefined) return notFound()

      let cached = rendered.get(pathname)
      if (cached === undefined) {
        let produced = entry.transform
          ? await entry.transform.render(entry.absolutePath, entry.relativePath)
          : {
            body: await Deno.readFile(entry.absolutePath) as string | Uint8Array,
            contentType: contentTypeFor(entry.relativePath),
          }
        cached = { ...produced, etag: await etagFor(produced.body) }
        rendered.set(pathname, cached)
      }

      if (request.headers.get('if-none-match') === cached.etag) {
        return new Response(null, {
          status: 304,
          headers: { etag: cached.etag, 'cache-control': cacheControl },
        })
      }

      return new Response(request.method === 'HEAD' ? null : cached.body as BodyInit, {
        headers: {
          'content-type': cached.contentType,
          etag: cached.etag,
          'cache-control': cacheControl,
        },
      })
    },

    paths(): Iterable<string> {
      return entries.keys()
    },

    reload: scan,
  }
}

function notFound(): Response {
  return new Response('Not Found', {
    status: 404,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  })
}

/** Every file under a directory, as paths relative to it. Dotfiles are skipped. */
async function walk(directory: string, root: string): Promise<string[]> {
  let found: string[] = []

  let entries: Deno.DirEntry[]
  try {
    entries = await Array.fromAsync(Deno.readDir(directory))
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return []
    throw error
  }

  for (let entry of entries) {
    if (entry.name.startsWith('.')) continue

    let entryPath = path.join(directory, entry.name)
    if (entry.isDirectory) found.push(...await walk(entryPath, root))
    else found.push(path.relative(root, entryPath))
  }

  return found.sort()
}

function normalizeBasePath(basePath: string): string {
  let trimmed = basePath.trim().replace(/\/+$/, '')
  if (trimmed === '') return ''
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

/**
 * Joins the mount point and a path.
 *
 * The root is the case that bites: mounted at `/repo`, the tree's `/` is `/repo`, not `/repo/` —
 * the latter matches nothing.
 */
function joinBase(basePath: string, servedPath: string): string {
  if (servedPath === '/' || servedPath === '') return basePath === '' ? '/' : basePath
  return `${basePath}${servedPath.startsWith('/') ? '' : '/'}${servedPath}`
}

const CONTENT_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml; charset=utf-8',
}

function contentTypeFor(relativePath: string): string {
  return CONTENT_TYPES[path.extname(relativePath).toLowerCase()] ?? 'application/octet-stream'
}

async function etagFor(body: string | Uint8Array): Promise<string> {
  let bytes = typeof body === 'string' ? new TextEncoder().encode(body) : body
  let digest = await crypto.subtle.digest('SHA-1', bytes as BufferSource)
  let hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return `"${hex}"`
}
