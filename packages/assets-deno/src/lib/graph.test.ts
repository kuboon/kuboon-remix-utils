import * as assert from '@remix-run/assert'
import { describe, it } from '@std/testing/bdd'

import { graphFromInfo } from './graph.ts'

/** A trimmed `deno info --json` payload with the shapes this package depends on. */
let payload = {
  roots: ['file:///p/entry.ts'],
  redirects: {
    'jsr:@kuboon/dpop@^0.1.2': 'https://jsr.io/@kuboon/dpop/0.1.2/client/mod.ts',
    'npm:@remix-run/ui@^0.4.0': 'npm:/@remix-run/ui@0.4.0',
  },
  npmPackages: {
    '@remix-run/ui@0.4.0': {
      name: '@remix-run/ui',
      version: '0.4.0',
      localPath: '/p/node_modules/.deno/@remix-run+ui@0.4.0/node_modules/@remix-run/ui',
    },
  },
  modules: [
    {
      kind: 'esm',
      specifier: 'file:///p/entry.ts',
      local: '/p/entry.ts',
      mediaType: 'TypeScript',
      dependencies: [
        {
          specifier: '@kuboon/dpop',
          code: { specifier: 'jsr:@kuboon/dpop@^0.1.2' },
        },
        {
          specifier: '@remix-run/ui',
          code: { specifier: 'npm:@remix-run/ui@^0.4.0' },
        },
        {
          specifier: './shared.ts',
          code: { specifier: 'file:///p/shared.ts' },
        },
        {
          // Types-only reference: no `code`, so nothing for the browser to fetch.
          specifier: './types.ts',
          type: { specifier: 'file:///p/types.ts' },
        },
      ],
    },
    {
      kind: 'esm',
      specifier: 'file:///p/shared.ts',
      local: '/p/shared.ts',
      mediaType: 'TypeScript',
      dependencies: [],
    },
    {
      kind: 'npm',
      specifier: 'npm:/@remix-run/ui@0.4.0',
      npmPackage: '@remix-run/ui@0.4.0',
    },
  ],
}

describe('graphFromInfo', () => {
  it('indexes modules by resolved specifier', () => {
    let graph = graphFromInfo([payload])

    assert.equal(graph.modules.size, 3)
    assert.equal(graph.modules.get('file:///p/shared.ts')?.local, '/p/shared.ts')
    assert.deepEqual(graph.roots, ['file:///p/entry.ts'])
  })

  it('follows a jsr: redirect to the concrete https module', () => {
    let graph = graphFromInfo([payload])

    assert.equal(
      graph.resolve('jsr:@kuboon/dpop@^0.1.2'),
      'https://jsr.io/@kuboon/dpop/0.1.2/client/mod.ts',
    )
  })

  it('follows an npm redirect from a range to a locked version', () => {
    let graph = graphFromInfo([payload])

    assert.equal(graph.resolve('npm:@remix-run/ui@^0.4.0'), 'npm:/@remix-run/ui@0.4.0')
  })

  it('leaves a specifier with no redirect unchanged', () => {
    let graph = graphFromInfo([payload])

    assert.equal(graph.resolve('file:///p/shared.ts'), 'file:///p/shared.ts')
  })

  it('pairs each authored specifier with what Deno resolved it to', () => {
    let graph = graphFromInfo([payload])
    let entry = graph.modules.get('file:///p/entry.ts')

    let byAuthored = new Map(entry?.dependencies.map((d) => [d.specifier, d.resolved]))
    assert.equal(byAuthored.get('./shared.ts'), 'file:///p/shared.ts')
    assert.equal(byAuthored.get('@kuboon/dpop'), 'jsr:@kuboon/dpop@^0.1.2')
  })

  it('resolves a types-only dependency to null', () => {
    let graph = graphFromInfo([payload])
    let entry = graph.modules.get('file:///p/entry.ts')

    let typesOnly = entry?.dependencies.find((d) => d.specifier === './types.ts')
    assert.equal(typesOnly?.resolved, null)
  })

  it('records npm packages with their disk location', () => {
    let graph = graphFromInfo([payload])

    assert.equal(graph.npmPackages.get('@remix-run/ui@0.4.0')?.name, '@remix-run/ui')
    assert.ok(graph.npmPackages.get('@remix-run/ui@0.4.0')?.localPath?.includes('node_modules'))
  })

  it('merges payloads from several entrypoints, sharing common modules', () => {
    let second = {
      roots: ['file:///p/other.ts'],
      modules: [
        {
          kind: 'esm',
          specifier: 'file:///p/other.ts',
          local: '/p/other.ts',
          dependencies: [{ specifier: './shared.ts', code: { specifier: 'file:///p/shared.ts' } }],
        },
        // The same shared module, reached from a second entrypoint.
        { kind: 'esm', specifier: 'file:///p/shared.ts', local: '/p/shared.ts', dependencies: [] },
      ],
    }

    let graph = graphFromInfo([payload, second])

    assert.equal(graph.modules.size, 4, 'shared.ts is not duplicated')
    assert.deepEqual(graph.roots, ['file:///p/entry.ts', 'file:///p/other.ts'])
  })

  it('survives a malformed payload rather than throwing', () => {
    let graph = graphFromInfo([{ modules: 'nope', redirects: 5 }])

    assert.equal(graph.modules.size, 0)
    assert.equal(graph.resolve('x'), 'x')
  })

  it('terminates on a cyclic redirect table', () => {
    let graph = graphFromInfo([{ redirects: { a: 'b', b: 'a' } }])

    assert.ok(['a', 'b'].includes(graph.resolve('a')), 'returns rather than looping')
  })
})
