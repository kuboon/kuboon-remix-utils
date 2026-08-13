import * as assert from '@remix-run/assert'
import { describe, it } from '@std/testing/bdd'

import {
  collectRequires,
  detectNamedExports,
  initCommonJsLexer,
  isCommonJs,
  wrapCommonJs,
} from './cjs.ts'

describe('isCommonJs', () => {
  it('detects module.exports', () => {
    assert.equal(isCommonJs('module.exports = 1', false), true)
  })

  it('detects exports.foo', () => {
    assert.equal(isCommonJs('exports.foo = 1', false), true)
  })

  it('detects require()', () => {
    assert.equal(isCommonJs('const a = require("b")', false), true)
  })

  it('treats a module with ESM syntax as ESM even when it mentions module.exports', () => {
    // A real ES module may still contain the string in a comment or a compat shim.
    assert.equal(isCommonJs('export const a = 1\n// module.exports = a', true), false)
  })

  it('does not mistake a property named exports for CommonJS', () => {
    assert.equal(isCommonJs('foo.module.exports = 1', false), false)
    assert.equal(isCommonJs('config.exports.foo = 1', false), false)
  })

  it('leaves a plain script alone', () => {
    assert.equal(isCommonJs('let a = 1; console.log(a)', false), false)
  })
})

describe('collectRequires', () => {
  it('collects literal specifiers and deduplicates them', () => {
    let code = `const a = require('./a')\nconst b = require("b")\nconst a2 = require('./a')`

    assert.deepEqual(collectRequires(code), ['./a', 'b'])
  })

  it('ignores a non-literal require', () => {
    assert.deepEqual(collectRequires('const m = require(name)'), [])
  })

  it('ignores a method call that merely ends in require', () => {
    assert.deepEqual(collectRequires('obj.require("x")'), [])
  })

  it('returns nothing for a module with no requires', () => {
    assert.deepEqual(collectRequires('module.exports = 1'), [])
  })
})

describe('detectNamedExports', () => {
  it('detects the names a CommonJS module assigns', async () => {
    await initCommonJsLexer()

    let names = detectNamedExports(`exports.foo = 1\nexports.bar = 2\nmodule.exports.baz = 3`)

    assert.deepEqual(names.sort(), ['bar', 'baz', 'foo'])
  })

  it('drops names that cannot become an export binding', async () => {
    await initCommonJsLexer()

    let names = detectNamedExports(
      `exports.__esModule = true\nexports.default = 1\nexports.class = 2\nexports.ok = 3`,
    )

    assert.deepEqual(names, ['ok'])
  })
})

describe('wrapCommonJs', () => {
  it('produces a module that evaluates the body and exports the result', async () => {
    let code = wrapCommonJs(`module.exports = { value: 42 }`, {
      imports: new Map(),
      namedExports: ['value'],
    })

    let mod = await import(`data:text/javascript,${encodeURIComponent(code)}`)

    assert.equal(mod.default.value, 42)
    assert.equal(mod.value, 42, 'the detected name is exported individually')
  })

  it('gives the body a working exports object', async () => {
    let code = wrapCommonJs(`exports.a = 1\nexports.b = 2`, {
      imports: new Map(),
      namedExports: ['a', 'b'],
    })

    let mod = await import(`data:text/javascript,${encodeURIComponent(code)}`)

    assert.deepEqual({ a: mod.a, b: mod.b }, { a: 1, b: 2 })
  })

  it('binds top-level this to module.exports, as CommonJS expects', async () => {
    // Under ESM, a bare top-level `this` would be undefined and this body would throw.
    let code = wrapCommonJs(`this.fromThis = 'ok'`, {
      imports: new Map(),
      namedExports: ['fromThis'],
    })

    let mod = await import(`data:text/javascript,${encodeURIComponent(code)}`)

    assert.equal(mod.default.fromThis, 'ok')
  })

  it('supplies __filename and __dirname', async () => {
    let code = wrapCommonJs(`module.exports = { f: __filename, d: __dirname }`, {
      imports: new Map(),
      namedExports: [],
      filename: '/pkg/index.js',
      dirname: '/pkg',
    })

    let mod = await import(`data:text/javascript,${encodeURIComponent(code)}`)

    assert.deepEqual(mod.default, { f: '/pkg/index.js', d: '/pkg' })
  })

  it('hoists each require to a real import', () => {
    let code = wrapCommonJs(`const dep = require('./dep')`, {
      imports: new Map([['./dep', '/assets/app/dep.js']]),
      namedExports: [],
    })

    assert.ok(
      /^import \S+ from "\/assets\/app\/dep\.js";/m.test(code),
      'emits a static import for the required module',
    )
  })

  it('throws a clear error for a require it could not resolve', async () => {
    let code = wrapCommonJs(`module.exports = () => require('missing')`, {
      imports: new Map(),
      namedExports: [],
    })

    let mod = await import(`data:text/javascript,${encodeURIComponent(code)}`)

    assert.throws(() => mod.default(), /Cannot require missing/)
  })

  it('unwraps the default of an ESM dependency reached through require', async () => {
    let dep = `data:text/javascript,${encodeURIComponent('export default { hi: 1 }')}`
    let code = wrapCommonJs(`module.exports = require('dep').hi`, {
      imports: new Map([['dep', dep]]),
      namedExports: [],
    })

    let mod = await import(`data:text/javascript,${encodeURIComponent(code)}`)

    assert.equal(mod.default, 1)
  })
})
