/**
 * A page that uses islands, written the way you would write one: import the component and place it.
 */

import type { RemixNode } from '@remix-run/ui'

import { Counter } from '../islands/counter.tsx'
import { Total } from '../islands/total.tsx'

export const title = 'Home'

/** The islands this page places, so the layout loads only the chunks it needs. */
export const islands: readonly string[] = ['counter', 'total']

export default function Home(): RemixNode {
  return (
    <>
      <p>The home page.</p>
      <Counter />
      <Total />
    </>
  )
}
