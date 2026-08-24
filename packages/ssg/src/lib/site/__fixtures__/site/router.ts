/**
 * The site, wired by hand — which is the point: nothing here is a framework convention.
 *
 * `deno serve router.ts` serves this; the build crawls it. A real site writes `rootDir: 'pages'`
 * and lets it resolve against the directory it is run from; this one is a fixture inside a package,
 * so it says where it lives.
 */

import {
  compose,
  createFileTree,
  createIslands,
  githubPages,
  normalizeBase,
  serveAsHost,
} from '../../../../site.ts'
import type { FileServerBehavior } from '../../../../site.ts'
import { markdown } from './transforms/markdown.tsx'
import { page } from './transforms/page.tsx'

let here = import.meta.dirname!

export const base: string = normalizeBase(Deno.env.get('BASE_URL'))

/** `/orphan` is linked from nowhere, so it is only built because it is named here. */
export const entryPoints: readonly string[] = ['/', '/orphan']

/** Where this site deploys. The build writes what this rule would serve. */
export const fileServer: FileServerBehavior = githubPages()

let islands = await createIslands({
  rootDir: `${here}/islands`,
  basePath: `${base}/assets`,
  bundle: { minify: false },
})

export default serveAsHost(
  compose(
    await createFileTree({
      rootDir: `${here}/pages`,
      basePath: base,
      transforms: [markdown({ base }), page({ base, islandUrls: islands.urls })],
    }),
    await createFileTree({ rootDir: `${here}/static`, basePath: `${base}/static` }),
    islands,
  ),
  { behavior: fileServer, base },
)
