/**
 * How the *host* turns a URL into a file.
 *
 * A static host is the last piece of routing in the stack and the one this package does not
 * control: GitHub Pages serves `/about` from `about.html`, falls back to `about/index.html` with a
 * redirect, and 404s `/about/` when only the former exists. Vercel, Netlify and S3 each answer
 * differently. Two things depend on getting it right — where the build writes each page, and
 * whether the dev server behaves like the deploy — so the rule is one swappable object rather than
 * a convention buried in either.
 *
 * The shape follows [`@kuboon/file-server-behavior`](https://jsr.io/@kuboon/file-server-behavior),
 * which derives these rules from
 * [trailing-slash-guide](https://github.com/slorber/trailing-slash-guide). It is small enough to
 * state here rather than depend on, and a structural match, so that package's implementations can
 * be passed in directly.
 */

import { joinBase, normalizeBase, stripBase } from './base.ts'
import type { SiteMiddleware } from './middleware.ts'

/** A redirect the host would issue, conditional on `path` existing when it is given. */
export interface Redirect {
  /** URL path to redirect to, as it sits in the deployed artifact. */
  target: string
  /** File whose existence the redirect depends on. Unconditional when omitted. */
  path?: string
}

/** A host's URL-to-file rule. */
export interface FileServerBehavior {
  /**
   * The files that could answer a URL, in the order the host tries them.
   *
   * @param urlPath The request path within the deployed artifact, starting with `/`
   * @returns Candidates: a string is a file to serve if it exists, a {@link Redirect} is a redirect
   *   to issue if its `path` exists
   */
  toLocalPaths(urlPath: string): (string | Redirect)[]
}

function hasExtension(urlPath: string): boolean {
  return urlPath.slice(urlPath.lastIndexOf('/') + 1).includes('.')
}

/**
 * GitHub Pages' rule, and this package's default.
 *
 * - `/dir/` serves `/dir/index.html`
 * - `/file.html`, or anything with an extension, is served as it is
 * - `/file` serves `/file.html`, or redirects to `/file/` when `/file/index.html` exists instead
 *
 * The last line is why the build writes `about.html` rather than `about/index.html`: a site whose
 * links say `/about` then costs no redirect.
 *
 * @returns The behavior
 */
export function githubPages(): FileServerBehavior {
  return {
    toLocalPaths(urlPath: string): (string | Redirect)[] {
      if (urlPath.endsWith('/')) return [`${urlPath}index.html`]
      if (hasExtension(urlPath)) return [urlPath]
      return [`${urlPath}.html`, { target: `${urlPath}/`, path: `${urlPath}/index.html` }]
    },
  }
}

/**
 * The file a URL is written to: the first candidate the host would actually serve.
 *
 * @param behavior The host's rule
 * @param urlPath The path within the artifact, starting with `/`
 * @returns The file path, starting with `/`
 */
export function outputPathFor(behavior: FileServerBehavior, urlPath: string): string {
  for (let candidate of behavior.toLocalPaths(urlPath)) {
    if (typeof candidate === 'string') return candidate
  }

  return urlPath
}

/** Options for {@link serveAsHost}. */
export interface HostOptions {
  /** The host's rule. Defaults to {@link githubPages}. */
  behavior?: FileServerBehavior
  /** Deploy path prefix, so the rule sees paths as they sit in the artifact. */
  base?: string
}

/**
 * Answers requests the way the host will, given what the site can serve.
 *
 * The site knows its URLs; the build turns each into a file; the host turns a request back into
 * one of those files. Running all three from the same rule is what makes `deno serve router.ts`
 * worth trusting — without it the dev server is quietly more forgiving than the deploy, and a
 * trailing slash that 404s in production works locally.
 *
 * Note that this is one wrapper around the whole site, not a setting on each part: which file a URL
 * resolves to is a property of where the site is deployed, and every part of it has to agree.
 *
 * @param site The composed site
 * @param options The host's rule and the deploy prefix
 * @returns A middleware answering as the host would
 *
 * @example
 * ```ts
 * export default serveAsHost(compose(pages, assets, islands), { base })
 * ```
 */
export function serveAsHost(site: SiteMiddleware, options: HostOptions = {}): SiteMiddleware {
  let behavior = options.behavior ?? githubPages()
  let base = normalizeBase(options.base)

  /** File in the artifact -> the URL the site answers it from. */
  let byFile = new Map<string, string>()

  function index(): void {
    byFile.clear()
    for (let url of site.paths()) byFile.set(outputPathFor(behavior, inArtifact(url)), url)
  }

  function inArtifact(urlPath: string): string {
    return `/${stripBase(urlPath, base)}`
  }

  function within(urlPath: string): boolean {
    return base === '' || urlPath === base || urlPath.startsWith(`${base}/`)
  }

  index()

  return {
    basePath: site.basePath,

    async fetch(request: Request): Promise<Response> {
      let url = new URL(request.url)
      let pathname = decodeURIComponent(url.pathname)
      // Outside the prefix is not this site's artifact at all — on the real host it is somebody
      // else's. Answering it here would make the dev server kinder than the deploy again.
      if (!within(pathname)) return notFound()

      let requested = inArtifact(pathname)

      for (let candidate of behavior.toLocalPaths(requested)) {
        if (typeof candidate === 'string') {
          let served = byFile.get(candidate)
          if (served !== undefined) {
            return await site.fetch(new Request(new URL(served + url.search, url), request))
          }
        } else if (candidate.path === undefined || byFile.has(candidate.path)) {
          return Response.redirect(new URL(joinBase(base, candidate.target), url), 301)
        }
      }

      return notFound()
    },

    paths: () => site.paths(),

    async reload(): Promise<void> {
      await site.reload()
      index()
    },
  }
}

function notFound(): Response {
  return new Response('Not Found', {
    status: 404,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  })
}
