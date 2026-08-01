import * as assert from '@remix-run/assert'
import { describe, it } from '@std/testing/bdd'

import { rewriteImports } from './rewrite.ts'

describe('rewriteImports', () => {
  it('rewrites a static import', async () => {
    let code = await rewriteImports(
      `import { counter } from "./shared.ts"\n`,
      (specifier) => (specifier === './shared.ts' ? '/assets/app/shared.js' : null),
    )

    assert.equal(code, `import { counter } from "/assets/app/shared.js"\n`)
  })

  it('rewrites a re-export', async () => {
    let code = await rewriteImports(
      `export { counter } from './shared.ts'\n`,
      () => '/assets/app/shared.js',
    )

    assert.equal(code, `export { counter } from '/assets/app/shared.js'\n`)
  })

  it('rewrites a bare specifier', async () => {
    let code = await rewriteImports(
      `import { init } from "@kuboon/dpop"\n`,
      () => '/assets/jsr/@kuboon/dpop/0.1.2/client/mod.js',
    )

    assert.ok(code.includes('"/assets/jsr/@kuboon/dpop/0.1.2/client/mod.js"'))
    assert.ok(!code.includes('"@kuboon/dpop"'))
  })

  it('rewrites a dynamic import with a literal argument, keeping it valid', async () => {
    let code = await rewriteImports(
      `let mod = await import("./lazy.ts")\n`,
      () => '/assets/app/lazy.js',
    )

    assert.equal(code, `let mod = await import("/assets/app/lazy.js")\n`)
  })

  it('leaves a non-literal dynamic import alone', async () => {
    let source = `let mod = await import(name)\n`

    assert.equal(await rewriteImports(source, () => '/assets/x.js'), source)
  })

  it('leaves a specifier the resolver declines', async () => {
    let source = `import "node:fs"\nimport "./a.ts"\n`

    let code = await rewriteImports(
      source,
      (specifier) => (specifier === './a.ts' ? '/assets/app/a.js' : null),
    )

    assert.ok(code.includes('"node:fs"'), 'keeps the declined specifier')
    assert.ok(code.includes('"/assets/app/a.js"'), 'rewrites the resolved one')
  })

  it('rewrites every specifier in a module with several imports', async () => {
    let code = await rewriteImports(
      `import a from "./a.ts"\nimport b from "./b.ts"\nexport * from "./c.ts"\n`,
      (specifier) => `/assets/app/${specifier.slice(2, -3)}.js`,
    )

    assert.ok(code.includes('"/assets/app/a.js"'))
    assert.ok(code.includes('"/assets/app/b.js"'))
    assert.ok(code.includes('"/assets/app/c.js"'))
  })

  it('returns unparseable input unchanged', async () => {
    let source = `this ( is not ) valid { js`

    assert.equal(await rewriteImports(source, () => '/assets/x.js'), source)
  })

  it('leaves a module with no imports untouched', async () => {
    let source = `export const x = 1\n`

    assert.equal(await rewriteImports(source, () => '/assets/x.js'), source)
  })
})
