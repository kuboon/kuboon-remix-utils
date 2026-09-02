/**
 * The shape of a tour, and of the state a running tour exposes.
 *
 * Every scenario type here is a `type` alias rather than an `interface` on purpose: TypeScript only
 * gives object *type aliases* an implicit index signature, and that is what makes a `TourScenario`
 * assignable to Remix UI's `SerializableValue`. Without it the scenario could not be passed to a
 * `clientEntry()` as a prop, which is the main reason the scenario is JSON in the first place.
 */

/**
 * Where the tooltip sits relative to the step's target.
 *
 * These are the twelve values `@remix-run/ui/anchor` accepts. Note that `anchor()` only ever flips
 * to the *opposite* placement when a tooltip would overflow — it does not cascade through the other
 * sides — so treat this as a preference that is honored or mirrored, and set it explicitly on steps
 * that must appear beside their target rather than above or below it.
 */
export type TourPlacement =
  | 'top'
  | 'top-start'
  | 'top-end'
  | 'bottom'
  | 'bottom-start'
  | 'bottom-end'
  | 'left'
  | 'left-start'
  | 'left-end'
  | 'right'
  | 'right-start'
  | 'right-end'

/**
 * A fixed rectangle to point at, in **viewport** coordinates.
 *
 * Use this for steps whose subject is not a single element — a region of a canvas, a chart area, the
 * space where something will appear.
 */
export type TourPoint = {
  x: number
  y: number
  width?: number
  height?: number
}

/**
 * What to do when a step's target selector matches nothing.
 *
 * A selector written in JSON is decoupled from the component tree, which is the point — but it also
 * means a step can name an element that is not on this page, is inside a collapsed section, or has
 * not hydrated yet. Every step therefore has a policy, and the default is to move on rather than
 * dead-end the tour.
 *
 * - `skip` — advance past the step in the direction of travel (default)
 * - `wait` — poll until the element appears or `waitTimeoutMs` elapses, then fall back to `skip`
 * - `center` — show the tooltip in the middle of the viewport with no spotlight
 * - `fail` — stop the tour and reject
 */
export type TourWhenMissing = 'skip' | 'wait' | 'center' | 'fail'

/** Step options that a scenario can set once under `defaults` instead of on every step. */
export type TourStepDefaults = {
  placement?: TourPlacement
  /** Gap in pixels between the target and the tooltip. Defaults to 12. */
  offset?: number
  /** Cut the target out of the dimmed backdrop. Defaults to true. */
  spotlight?: boolean
  /** Pixels of breathing room around the spotlight cut-out. Defaults to 6. */
  spotlightPadding?: number
  /** Scroll a target that is off-screen into view before showing the step. Defaults to true. */
  scrollIntoView?: boolean
  whenMissing?: TourWhenMissing
}

/** One step of a tour. */
export type TourStep = {
  /** Stable id, for {@link Tour.goto} and for analytics. */
  id?: string
  /**
   * A CSS selector, or a fixed viewport rectangle. Omit for a step with no subject — a welcome or
   * wrap-up card, shown centered with no spotlight.
   *
   * Prefer a `[data-tour="…"]` attribute you control over an `id`, which is a page-unique resource
   * that may not be yours to spend.
   */
  target?: string | TourPoint
  title?: string
  body?: string
  placement?: TourPlacement
  offset?: number
  spotlight?: boolean
  spotlightPadding?: number
  scrollIntoView?: boolean
  whenMissing?: TourWhenMissing
}

/** Button and progress text, so the scenario carries its own language. */
export type TourLabels = {
  next?: string
  back?: string
  skip?: string
  /** Label of the button on the last step. */
  done?: string
  /** Progress template. `{index}` (1-based) and `{total}` are substituted. */
  progress?: string
}

/** A whole tour, as it appears in JSON. */
export type TourScenario = {
  /** Identifies the tour in the {@link TourStore}. Required. */
  name: string
  /**
   * Bump this after editing a tour to show it again to people who already finished the old one.
   * Defaults to 1.
   */
  version?: number
  /** Reserved for the host app's own "show this on first visit" logic. Defaults to true. */
  autoStart?: boolean
  /** Bind arrow keys, Enter and Escape while the tour runs. Defaults to true. */
  keyboard?: boolean
  labels?: TourLabels
  defaults?: TourStepDefaults
  steps: TourStep[]
}

/**
 * Lifecycle of a tour.
 *
 * `waiting` is a first-class state rather than an internal stall so the overlay can say it is
 * looking for something instead of appearing frozen.
 */
export type TourStatus = 'idle' | 'running' | 'waiting' | 'completed' | 'skipped'

/** A resolved target: a live element, or a fixed viewport rectangle. */
export type TourTarget = HTMLElement | TourPoint

/** Snapshot of a tour, as read from {@link Tour.state}. */
export type TourState = {
  status: TourStatus
  /** Index of the current step, or -1 when the tour is not on one. */
  index: number
  total: number
  step: TourStep | null
  /** The resolved target, or null for a centered step. */
  target: TourTarget | null
}

/** Why a tour stopped. Both reasons mark it done in the {@link TourStore}. */
export type TourStopReason = 'complete' | 'skip'
