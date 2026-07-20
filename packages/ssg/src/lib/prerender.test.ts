import * as assert from '@remix-run/assert'
import { describe, it } from '@std/testing/bdd'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import type { RouterLike } from './crawl.ts'
import { prerender } from './prerender.ts'

function makeRouter(pages: Record<string, { body: string; type?: string }>): RouterLike {
  return {
    fetch(request: Request) {
      let { pathname } = new URL(request.url)
      let page = pages[pathname]
      if (!page) {
        return new Response('not found', { status: 404 })
      }
      return new Response(page.body, {
        headers: { 'Content-Type': page.type ?? 'text/html; charset=utf-8' },
      })
    },
  }
}

function tempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'ssg-'))
}

describe('prerender', () => {
  it('writes crawled pages and assets, rewriting extensions and preserving hydration comments', async () => {
    let outDir = await tempDir()
    try {
      let router = makeRouter({
        '/': {
          body: '<!doctype html><html><head>' +
            '<script type="module" src="/entry.tsx"></script>' +
            '<script type="application/json" id="rmx-data">{"moduleUrl":"/assets/app.tsx"}</script>' +
            '</head><body><!-- rmx:h:1 --><a href="/about">about</a><!-- /rmx:h --></body></html>',
        },
        '/about': { body: '<html><body>about page</body></html>' },
        '/entry.tsx': {
          body: "import x from './x.tsx'\nexport default x\n",
          type: 'text/javascript',
        },
      })

      let stats = await prerender({ router, outDir, paths: ['/'] })

      let home = await fs.readFile(path.join(outDir, 'index.html'), 'utf-8')
      assert.ok(home.includes('<!-- rmx:h:1 -->'), 'preserves hydration comment')
      assert.ok(home.includes('src="/entry.js"'), 'rewrites script src .tsx -> .js')
      assert.ok(home.includes('"moduleUrl":"/assets/app.js"'), 'rewrites inline module URL')

      let about = await fs.readFile(path.join(outDir, 'about', 'index.html'), 'utf-8')
      assert.ok(about.includes('about page'), 'writes crawled linked page to <path>/index.html')

      let entry = await fs.readFile(path.join(outDir, 'entry.js'), 'utf-8')
      assert.ok(entry.includes("'./x.js'"), 'writes script asset as .js with rewritten imports')

      assert.equal(stats.pages, 2)
      assert.ok(stats.assets >= 1)
      assert.equal(stats.files.length, stats.pages + stats.assets)
    } finally {
      await fs.rm(outDir, { recursive: true, force: true })
    }
  })

  it('copies publicDir into outDir before crawling', async () => {
    let outDir = await tempDir()
    let publicDir = await tempDir()
    try {
      await fs.writeFile(path.join(publicDir, 'favicon.ico'), 'icon-bytes')
      let router = makeRouter({
        '/': { body: '<html><body>home</body></html>' },
      })

      await prerender({ router, outDir, paths: ['/'], publicDir })

      let icon = await fs.readFile(path.join(outDir, 'favicon.ico'), 'utf-8')
      assert.equal(icon, 'icon-bytes')
      let home = await fs.readFile(path.join(outDir, 'index.html'), 'utf-8')
      assert.ok(home.includes('home'))
    } finally {
      await fs.rm(outDir, { recursive: true, force: true })
      await fs.rm(publicDir, { recursive: true, force: true })
    }
  })
})
