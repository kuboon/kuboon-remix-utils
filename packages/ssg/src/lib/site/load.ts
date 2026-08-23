/**
 * Finding and loading a site's config.
 *
 * The CLI runs as a remote module against whatever directory it was started in, so this is the one
 * bridge from "somewhere on JSR" to "this project" — and deliberately the only one. Everything
 * else the framework needs about a site is either a directory convention or something the config
 * itself hands over, which is what keeps content sources typed at the point they are written.
 */

import * as path from 'node:path'

import type { SiteConfig } from './config.ts'

/** Config file names tried, in order. */
const CONFIG_NAMES = ['site.config.ts', 'site.config.tsx', 'site.config.js']

/**
 * Loads `site.config.ts` from a directory.
 *
 * @param rootDir Directory to look in, usually `Deno.cwd()`
 * @returns The config and the root it was found in
 */
export async function loadSiteConfig(
  rootDir: string,
): Promise<{ config: SiteConfig; rootDir: string }> {
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
    let module = await import(url.href) as { default?: SiteConfig }

    if (module.default === undefined || typeof module.default.title !== 'string') {
      throw new Error(
        `"${filePath}" must default-export a site config with a title. ` +
          `Use defineSite({ title: '…' }) from @kuboon/remix-ssg/site.`,
      )
    }

    return { config: module.default, rootDir: resolved }
  }

  throw new Error(
    `No site config in "${resolved}". Expected one of: ${CONFIG_NAMES.join(', ')}.`,
  )
}
