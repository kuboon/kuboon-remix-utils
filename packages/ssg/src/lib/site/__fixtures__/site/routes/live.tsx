import type { PageMeta } from '../../../config.ts'

/** Marked dynamic, so the static build skips it instead of freezing one request's answer. */
export const meta: PageMeta = { title: 'Live', dynamic: true }

export default function Live() {
  return <h1>Live</h1>
}
