import * as assert from '@remix-run/assert'
import { describe, it } from '@std/testing/bdd'

import { clampScale, transformsEqual, transformToCss } from './transform.ts'

describe('clampScale', () => {
  it('passes a scale inside the limits through', () => {
    assert.equal(clampScale(2, { minScale: 1, maxScale: 4 }), 2)
  })

  it('clamps to each bound', () => {
    assert.equal(clampScale(0.25, { minScale: 1, maxScale: 4 }), 1)
    assert.equal(clampScale(9, { minScale: 1, maxScale: 4 }), 4)
  })

  it('is unbounded when no limits are given', () => {
    assert.equal(clampScale(1000), 1000)
    assert.equal(clampScale(0.001), 0.001)
  })

  it('lets max win when the limits are inverted', () => {
    assert.equal(clampScale(3, { minScale: 8, maxScale: 2 }), 2)
  })

  it('falls back to 1 for a scale CSS would drop', () => {
    assert.equal(clampScale(Number.NaN), 1)
    assert.equal(clampScale(Number.POSITIVE_INFINITY), 1)
    assert.equal(clampScale(0), 1)
    assert.equal(clampScale(-2), 1)
  })
})

describe('transformToCss', () => {
  it('translates before it scales', () => {
    assert.equal(
      transformToCss({ x: 10, y: -4, scale: 1.5 }),
      'translate(10px, -4px) scale(1.5)',
    )
  })
})

describe('transformsEqual', () => {
  it('ignores differences too small to paint', () => {
    assert.ok(transformsEqual({ x: 0, y: 0, scale: 1 }, { x: 1e-6, y: 0, scale: 1 }))
  })

  it('separates transforms that differ visibly', () => {
    assert.ok(!transformsEqual({ x: 0, y: 0, scale: 1 }, { x: 0.5, y: 0, scale: 1 }))
    assert.ok(!transformsEqual({ x: 0, y: 0, scale: 1 }, { x: 0, y: 0, scale: 1.01 }))
  })
})
