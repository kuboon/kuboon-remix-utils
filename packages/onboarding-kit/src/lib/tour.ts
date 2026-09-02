/**
 * The tour state machine — everything except the pixels.
 *
 * This module owns step order, target resolution, keyboard control and completion. It renders
 * nothing, so an app that wants its own overlay can drive it directly; `@kuboon/remix-onboarding-kit/ui`
 * is one consumer of this API, not a layer beneath it.
 */

import { TypedEventTarget } from '@remix-run/ui'
import type {
  TourScenario,
  TourState,
  TourStatus,
  TourStep,
  TourStopReason,
  TourTarget,
} from './types.ts'
import { localStorageTourStore, type TourStore } from './store.ts'
import { isElement } from './dom.ts'

/** Events a tour dispatches. `change` fires on every state transition. */
export type TourEventMap = {
  change: Event
}

/** Options for {@link createTour}. */
export type TourOptions = {
  /** Where completion is remembered. Defaults to {@link localStorageTourStore}. */
  store?: TourStore
  /** How long a `whenMissing: "wait"` step waits before giving up. Defaults to 5000. */
  waitTimeoutMs?: number
  /** Document to resolve selectors against. Defaults to the global one. */
  document?: Document
}

/** A running (or not yet running) tour. */
export type Tour = TypedEventTarget<TourEventMap> & {
  readonly scenario: TourScenario
  /** A snapshot of the current state. Reading it never returns a live object. */
  readonly state: TourState
  /**
   * Shows the tour from the first resolvable step.
   *
   * Returns immediately without showing anything when the store says this tour — at this version —
   * is already done, unless `force` is set.
   */
  start(options?: { force?: boolean }): Promise<void>
  next(): Promise<void>
  back(): Promise<void>
  /** Jumps to a step by its `id`. */
  goto(id: string): Promise<void>
  stop(reason: TourStopReason): Promise<void>
  /** Forgets that this tour was ever completed, so the next `start()` shows it again. */
  reset(): Promise<void>
  /** Stops the tour without recording completion, and releases every listener. */
  dispose(): void
}

const DEFAULT_WAIT_TIMEOUT_MS = 5000
const WAIT_POLL_MS = 50

/** Merges a step with the scenario's `defaults`, so callers never handle both. */
export function resolveStepOptions(scenario: TourScenario, step: TourStep): Required<
  Pick<
    TourStep,
    'placement' | 'offset' | 'spotlight' | 'spotlightPadding' | 'scrollIntoView' | 'whenMissing'
  >
> {
  let defaults = scenario.defaults ?? {}
  return {
    placement: step.placement ?? defaults.placement ?? 'bottom',
    offset: step.offset ?? defaults.offset ?? 12,
    spotlight: step.spotlight ?? defaults.spotlight ?? true,
    spotlightPadding: step.spotlightPadding ?? defaults.spotlightPadding ?? 6,
    scrollIntoView: step.scrollIntoView ?? defaults.scrollIntoView ?? true,
    whenMissing: step.whenMissing ?? defaults.whenMissing ?? 'skip',
  }
}

/** True while the tour has a step to show. */
export function isTourVisible(status: TourStatus): boolean {
  return status === 'running' || status === 'waiting'
}

/**
 * Creates a tour from a scenario.
 *
 * @param scenario The tour definition, usually parsed from JSON
 * @param options Store, timeouts and the document to query
 * @returns A tour, not yet started
 */
export function createTour(scenario: TourScenario, options: TourOptions = {}): Tour {
  return new TourController(scenario, options)
}

class TourController extends TypedEventTarget<TourEventMap> implements Tour {
  readonly scenario: TourScenario

  #store: TourStore
  #waitTimeoutMs: number
  #document: Document
  #keys: AbortController | null = null
  /** Bumped by every navigation, so a slow `wait` cannot commit after a newer one started. */
  #generation = 0
  #state: TourState

  constructor(scenario: TourScenario, options: TourOptions) {
    super()
    this.scenario = scenario
    this.#store = options.store ?? localStorageTourStore()
    this.#waitTimeoutMs = options.waitTimeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS
    this.#document = options.document ?? globalThis.document
    this.#state = {
      status: 'idle',
      index: -1,
      total: scenario.steps.length,
      step: null,
      target: null,
    }
  }

  get state(): TourState {
    return { ...this.#state }
  }

  async start(options: { force?: boolean } = {}): Promise<void> {
    if (!options.force) {
      let done = await this.#store.completed(this.scenario.name)
      if (done !== null && done >= (this.scenario.version ?? 1)) {
        this.#patch({ status: 'completed' })
        return
      }
    }
    this.#bindKeys()
    await this.#travel(0, 1)
  }

  async next(): Promise<void> {
    if (!isTourVisible(this.#state.status)) return
    await this.#travel(this.#state.index + 1, 1)
  }

  async back(): Promise<void> {
    if (!isTourVisible(this.#state.status)) return
    await this.#travel(this.#state.index - 1, -1)
  }

  async goto(id: string): Promise<void> {
    let index = this.scenario.steps.findIndex((step) => step.id === id)
    if (index === -1) throw new Error(`Tour "${this.scenario.name}" has no step with id "${id}"`)
    this.#bindKeys()
    await this.#travel(index, 1)
  }

  async stop(reason: TourStopReason): Promise<void> {
    this.#generation++
    this.#unbindKeys()
    this.#patch({
      status: reason === 'complete' ? 'completed' : 'skipped',
      index: -1,
      step: null,
      target: null,
    })
    await this.#store.complete(this.scenario.name, this.scenario.version ?? 1)
  }

  async reset(): Promise<void> {
    await this.#store.clear(this.scenario.name)
  }

  dispose(): void {
    this.#generation++
    this.#unbindKeys()
    this.#patch({ status: 'idle', index: -1, step: null, target: null })
  }

  /**
   * Walks from `index` in `direction` until a step resolves, honoring each step's `whenMissing`.
   *
   * Walking off the end finishes the tour; walking off the front leaves the current step alone,
   * because "back" from the first resolvable step should do nothing rather than close the tour.
   */
  async #travel(from: number, direction: 1 | -1): Promise<void> {
    let generation = ++this.#generation
    let steps = this.scenario.steps
    let index = from

    while (index >= 0 && index < steps.length) {
      let step = steps[index]
      let resolved = await this.#resolve(step, generation)
      if (generation !== this.#generation) return

      if (resolved !== 'missing') {
        this.#commit(index, step, resolved)
        return
      }

      let { whenMissing } = resolveStepOptions(this.scenario, step)
      if (whenMissing === 'fail') {
        this.#unbindKeys()
        this.#patch({ status: 'idle', index: -1, step: null, target: null })
        throw new Error(
          `Tour "${this.scenario.name}" step ${index} has no target matching ` +
            `${JSON.stringify(step.target)}`,
        )
      }
      index += direction
    }

    if (direction === 1) await this.stop('complete')
  }

  /**
   * Finds a step's target.
   *
   * @returns The target, `null` for a step that is shown centered, or `"missing"` when the caller
   * should move on
   */
  async #resolve(step: TourStep, generation: number): Promise<TourTarget | null | 'missing'> {
    if (step.target === undefined) return null
    if (typeof step.target !== 'string') return step.target

    let selector = step.target
    let found = this.#query(selector)
    let { whenMissing } = resolveStepOptions(this.scenario, step)

    if (found === null && whenMissing === 'wait') {
      this.#patch({ status: 'waiting', step, target: null })
      let deadline = Date.now() + this.#waitTimeoutMs
      while (found === null && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, WAIT_POLL_MS))
        if (generation !== this.#generation) return 'missing'
        found = this.#query(selector)
      }
    }

    if (found !== null) return found
    return whenMissing === 'center' ? null : 'missing'
  }

  #query(selector: string): HTMLElement | null {
    if (this.#document === undefined) return null
    try {
      let found = this.#document.querySelector(selector)
      return isElement(found) ? found : null
    } catch {
      // An invalid selector is an authoring bug in the JSON, not a reason to throw at the visitor.
      return null
    }
  }

  #commit(index: number, step: TourStep, target: TourTarget | null): void {
    let { scrollIntoView } = resolveStepOptions(this.scenario, step)
    if (scrollIntoView && isElement(target) && !isFullyVisible(target)) {
      target.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' })
    }
    this.#patch({ status: 'running', index, step, target })
  }

  #patch(next: Partial<TourState>): void {
    this.#state = { ...this.#state, ...next }
    this.dispatchEvent(new Event('change'))
  }

  #bindKeys(): void {
    if (this.scenario.keyboard === false || this.#keys !== null) return
    let target = this.#document?.defaultView ?? globalThis
    if (typeof target?.addEventListener !== 'function') return

    this.#keys = new AbortController()
    target.addEventListener('keydown', (event: Event) => {
      if (!(event instanceof KeyboardEvent)) return
      if (!isTourVisible(this.#state.status)) return

      if (event.key === 'ArrowRight' || event.key === 'Enter') {
        event.preventDefault()
        void this.next()
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        void this.back()
      } else if (event.key === 'Escape') {
        event.preventDefault()
        void this.stop('skip')
      }
    }, { signal: this.#keys.signal })
  }

  #unbindKeys(): void {
    this.#keys?.abort()
    this.#keys = null
  }
}

/** True when the whole element is already inside the viewport, so there is nothing to scroll. */
function isFullyVisible(element: HTMLElement): boolean {
  let rect = element.getBoundingClientRect()
  return rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= (globalThis.innerHeight || 0) &&
    rect.right <= (globalThis.innerWidth || 0)
}
