import type { PageMeta } from '../../../config.ts'
import { Counter } from '../islands/counter.tsx'
import { Total } from '../islands/total.tsx'

export const meta: PageMeta = { title: 'Fixture', hydrate: true }

export default function Home() {
  return (
    <>
      <h1>Home</h1>
      <Counter />
      <Total />
    </>
  )
}
