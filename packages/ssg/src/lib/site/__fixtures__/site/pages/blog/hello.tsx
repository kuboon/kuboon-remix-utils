/**
 * A nested page that places one island, so a page ships only the chunks it actually uses.
 */

import type { RemixNode } from 'remix/ui'

import { Counter } from '../../islands/counter.tsx'

export const title = 'Hello'

export const islands: readonly string[] = ['counter']

export default function Hello(): RemixNode {
  return (
    <>
      <p>A nested page. It counts, but it does not total.</p>
      <Counter />
    </>
  )
}
