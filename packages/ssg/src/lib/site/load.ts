/**
 * Finding and loading a site's config.
 *
 * The CLI runs as a remote module against whatever directory it was started in, so this is the one
 * bridge from "somewhere on JSR" to "this project" — and deliberately the only one. Everything else
 * is a directory convention, which is what keeps a site's own modules typed where they are written
 * rather than arriving here as `any`.
 */

import * as path from 'node:path'

import type { SiteDefinition } from './config.ts'

/** Config file names tried, in order. */
const CONFIG_NAMES = ['site.config.ts', 'site.config.tsx', 'site.config.js']

/**
 * Loads `site.config.ts` from a directory.
 *
 * @param rootDir Directory to look in, usually `Deno.cwd()`
 * @returns The definition and the root it was found in
 */
export async function loadSiteConfig(
  rootDir: string,
): Promise<{ definition: SiteDefinition; rootDir: string }> {
  let resolved = path.resolve(rootDir)

  for (let name of CONFIG_NAMES) {
    let filePath = path.join(resolved, name)
    try {
      await Deno.stat(filePath)
    } catch {
      continue
    }

    let url = new URL('file://')
    url.pathname = filePath.split('/').map(encodeURIComponent).join('/')
    let module = await import(url.href) as { default?: SiteDefinition }
    let definition = module.default

    if (
      definition === undefined ||
      (typeof definition !== 'function' && typeof definition !== 'object')
    ) {
      throw new Error(
        `"${filePath}" must default-export a site definition. ` +
          `Use defineSite(...) from @kuboon/remix-ssg/site.`,
      )
    }

    return { definition, rootDir: resolved }
  }

  throw new Error(`No site config in "${resolved}". Expected one of: ${CONFIG_NAMES.join(', ')}.`)
}
