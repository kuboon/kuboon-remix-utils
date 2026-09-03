import { describe, it } from '@std/testing/bdd'
import { expect } from '@std/expect'
import { createTour, resolveStepOptions } from './tour.ts'
import { memoryTourStore } from './store.ts'
import type { TourScenario } from './types.ts'

/**
 * These run without a DOM, so every step targets a fixed rectangle, has no target at all, or names
 * a selector that is expected to miss. The parts that need a browser — anchoring, the spotlight,
 * scroll-into-view — are the parts this file deliberately does not reach.
 */
function scenario(steps: TourScenario['steps'], extra: Partial<TourScenario> = {}): TourScenario {
  return { name: 'test-tour', keyboard: false, steps, ...extra }
}

const A = { x: 0, y: 0, width: 10, height: 10 }

describe('resolveStepOptions', () => {
  it('layers step over scenario defaults over built-in defaults', () => {
    let options = resolveStepOptions(
      scenario([], { defaults: { placement: 'right', offset: 4 } }),
      { placement: 'top', body: 'x' },
    )

    expect(options.placement).toBe('top')
    expect(options.offset).toBe(4)
    expect(options.spotlight).toBe(true)
    expect(options.spotlightPadding).toBe(6)
  })
})

describe('createTour', () => {
  it('starts on the first step and walks forward and back', async () => {
    let tour = createTour(
      scenario([{ id: 'one', target: A, body: '1' }, { id: 'two', target: A, body: '2' }]),
      { store: memoryTourStore() },
    )

    await tour.start()
    expect(tour.state.status).toBe('running')
    expect(tour.state.index).toBe(0)
    expect(tour.state.total).toBe(2)

    await tour.next()
    expect(tour.state.step?.id).toBe('two')

    await tour.back()
    expect(tour.state.step?.id).toBe('one')
  })

  it('back from the first step stays put', async () => {
    let tour = createTour(scenario([{ target: A, body: '1' }]), { store: memoryTourStore() })

    await tour.start()
    await tour.back()

    expect(tour.state.status).toBe('running')
    expect(tour.state.index).toBe(0)
  })

  it('completes when it runs off the end, and records the version', async () => {
    let store = memoryTourStore()
    let tour = createTour(scenario([{ target: A, body: '1' }], { version: 4 }), { store })

    await tour.start()
    await tour.next()

    expect(tour.state.status).toBe('completed')
    expect(tour.state.step).toBe(null)
    expect(await store.completed('test-tour')).toBe(4)
  })

  it('does not show a tour that is already completed at this version', async () => {
    let store = memoryTourStore()
    await store.complete('test-tour', 1)
    let tour = createTour(scenario([{ target: A, body: '1' }]), { store })

    await tour.start()

    expect(tour.state.status).toBe('completed')
    expect(tour.state.step).toBe(null)
  })

  it('shows it again after the scenario version is bumped', async () => {
    let store = memoryTourStore()
    await store.complete('test-tour', 1)
    let tour = createTour(scenario([{ target: A, body: '1' }], { version: 2 }), { store })

    await tour.start()

    expect(tour.state.status).toBe('running')
  })

  it('force shows a completed tour, and reset clears the record', async () => {
    let store = memoryTourStore()
    await store.complete('test-tour', 1)
    let tour = createTour(scenario([{ target: A, body: '1' }]), { store })

    await tour.start({ force: true })
    expect(tour.state.status).toBe('running')

    await tour.reset()
    expect(await store.completed('test-tour')).toBe(null)
  })

  it('skips a step whose target is missing', async () => {
    let tour = createTour(
      scenario([
        { id: 'gone', target: '#nowhere', body: 'x' },
        { id: 'here', target: A, body: 'y' },
      ]),
      { store: memoryTourStore() },
    )

    await tour.start()

    expect(tour.state.step?.id).toBe('here')
  })

  it('skips backwards too', async () => {
    let tour = createTour(
      scenario([
        { id: 'first', target: A, body: '1' },
        { id: 'gone', target: '#nowhere', body: 'x' },
        { id: 'last', target: A, body: '3' },
      ]),
      { store: memoryTourStore() },
    )

    await tour.start()
    await tour.next()
    expect(tour.state.step?.id).toBe('last')

    await tour.back()
    expect(tour.state.step?.id).toBe('first')
  })

  it('shows a whenMissing:center step with no target instead of skipping it', async () => {
    let tour = createTour(
      scenario([{ id: 'orphan', target: '#nowhere', body: 'x', whenMissing: 'center' }]),
      { store: memoryTourStore() },
    )

    await tour.start()

    expect(tour.state.step?.id).toBe('orphan')
    expect(tour.state.target).toBe(null)
  })

  it('reports waiting while a whenMissing:wait step looks for its target', async () => {
    let tour = createTour(
      scenario([{ target: '#nowhere', body: 'x', whenMissing: 'wait' }, { target: A, body: 'y' }]),
      { store: memoryTourStore(), waitTimeoutMs: 40 },
    )

    let seen: string[] = []
    tour.addEventListener('change', () => seen.push(tour.state.status))

    await tour.start()

    expect(seen).toContain('waiting')
    expect(tour.state.step?.body).toBe('y')
  })

  it('throws on a whenMissing:fail step', async () => {
    let tour = createTour(
      scenario([{ target: '#nowhere', body: 'x', whenMissing: 'fail' }]),
      { store: memoryTourStore() },
    )

    await expect(tour.start()).rejects.toThrow(/no target matching/)
    expect(tour.state.status).toBe('idle')
  })

  it('emits change on every transition', async () => {
    let tour = createTour(
      scenario([{ target: A, body: '1' }, { target: A, body: '2' }]),
      { store: memoryTourStore() },
    )

    let changes = 0
    tour.addEventListener('change', () => changes++)

    await tour.start()
    await tour.next()
    await tour.stop('skip')

    expect(changes).toBe(3)
  })

  it('skipping records completion, so the tour does not come back', async () => {
    let store = memoryTourStore()
    let tour = createTour(scenario([{ target: A, body: '1' }]), { store })

    await tour.start()
    await tour.stop('skip')

    expect(tour.state.status).toBe('skipped')
    expect(await store.completed('test-tour')).toBe(1)
  })

  it('goto jumps by step id', async () => {
    let tour = createTour(
      scenario([{ id: 'a', target: A, body: '1' }, { id: 'b', target: A, body: '2' }]),
      { store: memoryTourStore() },
    )

    await tour.goto('b')

    expect(tour.state.index).toBe(1)
    await expect(tour.goto('nope')).rejects.toThrow(/no step with id/)
  })

  it('dispose leaves the tour idle without recording completion', async () => {
    let store = memoryTourStore()
    let tour = createTour(scenario([{ target: A, body: '1' }]), { store })

    await tour.start()
    tour.dispose()

    expect(tour.state.status).toBe('idle')
    expect(await store.completed('test-tour')).toBe(null)
  })
})
