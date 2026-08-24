import { on } from 'remix/ui'
import { island } from '../../../../../client.ts'
import { clicks } from './store.ts'

export const Counter = island('counter', 'Counter', function Counter(handle) {
  return () => (
    <button
      type='button'
      class='counter'
      mix={[on('click', () => {
        clicks.bump()
        handle.update()
      })]}
    >
      {`clicks:${clicks.total}`}
    </button>
  )
})
