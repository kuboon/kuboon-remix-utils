import * as assert from '@remix-run/assert'
import { describe, it } from '@std/testing/bdd'

import { candidatePathFor, PathRegistry, toJsExtension } from './paths.ts'

describe('candidatePathFor', () => {
  it('maps a project file to an app/ path with a .js extension', () => {
    assert.equal(
      candidatePathFor('file:///project/client/session.ts', { rootDir: '/project' }),
      'app/client/session.js',
    )
  })

  it('maps a JSR module to a jsr/ path that keeps scope, name, and version', () => {
    assert.equal(
      candidatePathFor('https://jsr.io/@kuboon/dpop/0.1.2/client/mod.ts'),
      'jsr/@kuboon/dpop/0.1.2/client/mod.js',
    )
  })

  it('maps an npm specifier to an npm/ path', () => {
    assert.equal(
      candidatePathFor('npm:/@remix-run/ui@0.4.0/jsx-runtime'),
      'npm/@remix-run/ui@0.4.0/jsx-runtime',
    )
  })

  it('maps a file inside an npm package root to that package', () => {
    let npmRoots = new Map([['/project/node_modules/.deno/ui@1.0.0/node_modules/ui', 'ui@1.0.0']])

    assert.equal(
      candidatePathFor(
        'file:///project/node_modules/.deno/ui@1.0.0/node_modules/ui/dist/index.js',
        { rootDir: '/project', npmRoots },
      ),
      'npm/ui@1.0.0/dist/index.js',
    )
  })

  it('prefers the longest npm root so a nested copy stays distinct', () => {
    let npmRoots = new Map([
      ['/p/node_modules/a', 'a@1.0.0'],
      ['/p/node_modules/a/node_modules/b', 'b@2.0.0'],
    ])

    assert.equal(
      candidatePathFor('file:///p/node_modules/a/node_modules/b/index.js', { npmRoots }),
      'npm/b@2.0.0/index.js',
    )
  })

  it('keeps a file outside rootDir servable under fs/', () => {
    let candidate = candidatePathFor('file:///elsewhere/x.ts', { rootDir: '/project' })

    assert.equal(candidate, 'fs/elsewhere/x.js')
  })

  it('strips path traversal and query characters', () => {
    let candidate = candidatePathFor('https://example.com/a/../b.js?v=1')

    assert.ok(!candidate.includes('..'), 'drops traversal segments')
    assert.ok(!candidate.includes('?'), 'drops the query separator')
  })
})

describe('toJsExtension', () => {
  it('rewrites compiled source extensions', () => {
    assert.equal(toJsExtension('a/b.tsx'), 'a/b.js')
    assert.equal(toJsExtension('a/b.mts'), 'a/b.js')
  })

  it('leaves other extensions alone', () => {
    assert.equal(toJsExtension('a/b.css'), 'a/b.css')
    assert.equal(toJsExtension('a/b.js'), 'a/b.js')
  })
})

describe('PathRegistry', () => {
  it('returns one stable path per key', () => {
    let registry = new PathRegistry('/assets')

    let first = registry.register('file:///p/a.ts', 'app/a.js')
    let second = registry.register('file:///p/a.ts', 'app/a.js')

    assert.equal(first, '/assets/app/a.js')
    assert.equal(second, first)
  })

  it('round-trips a path back to its key', () => {
    let registry = new PathRegistry('/assets')
    registry.register('file:///p/a.ts', 'app/a.js')

    assert.equal(registry.keyFor('/assets/app/a.js'), 'file:///p/a.ts')
  })

  it('never lets two keys share a path', () => {
    let registry = new PathRegistry('/assets')

    let first = registry.register('file:///p/a.ts', 'app/a.js')
    let second = registry.register('https://example.com/a.ts', 'app/a.js')

    assert.notEqual(second, first)
    assert.equal(registry.keyFor(first), 'file:///p/a.ts')
    assert.equal(registry.keyFor(second), 'https://example.com/a.ts')
  })

  it('assigns the same disambiguated path on every run', () => {
    let build = () => {
      let registry = new PathRegistry('/assets')
      registry.register('file:///p/a.ts', 'app/a.js')
      return registry.register('https://example.com/a.ts', 'app/a.js')
    }

    assert.equal(build(), build())
  })

  it('normalizes a base path with a trailing slash', () => {
    let registry = new PathRegistry('/assets/')

    assert.equal(registry.basePath, '/assets')
    assert.equal(registry.register('k', 'app/a.js'), '/assets/app/a.js')
  })
})
