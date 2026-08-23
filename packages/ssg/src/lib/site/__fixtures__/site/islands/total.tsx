import { island } from '../../../../../client.ts'
import { clicks } from './store.ts'

export const Total = island('total', 'Total', function Total(handle) {
  clicks.subscribe(() => handle.update())
  return () => <output class='total'>{`total:${clicks.total}`}</output>
})
