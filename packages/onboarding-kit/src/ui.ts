/**
 * The browser half: mounting a tour's overlay, and declaring one from server-rendered markup.
 *
 * The overlay always renders into a container of its own at the end of `<body>`, never inside the
 * tree it points at. Two reasons: a `position: fixed` root breaks if any ancestor has a transform
 * or a filter, and an overlay nested in page content would be torn down by the very navigation a
 * tour is meant to survive.
 */

import { createElement, createRoot } from '@remix-run/ui'
import { clientEntry } from '@remix-run/ui'
import type { EntryComponent, Handle, RemixNode } from '@remix-run/ui'
import { createTour, type Tour, type TourOptions } from './lib/tour.ts'
import type { TourScenario } from './lib/types.ts'
import { TourOverlay } from './lib/overlay.tsx'

/**
 * Live tours on this page, by scenario name.
 *
 * A tour is a page-level singleton — there is one top layer and one backdrop — so anything that
 * wants to replay or inspect a running tour looks it up here rather than being handed the object.
 */
const tours = new Map<string, Tour>()

/** Returns the mounted tour with this name, if one is running on this page. */
export function getTour(name: string): Tour | undefined {
  return tours.get(name)
}

/** Options for {@link mountTour}. */
export type MountTourOptions = {
  /** Where the overlay renders. Defaults to a fresh `<div>` appended to `<body>`. */
  container?: HTMLElement
}

/**
 * Renders a tour's overlay.
 *
 * @param tour The tour to render
 * @param options Overlay container
 * @returns A function that removes the overlay
 */
export function mountTour(tour: Tour, options: MountTourOptions = {}): () => void {
  let owned = options.container === undefined
  let container = options.container ?? document.createElement('div')
  if (owned) {
    container.setAttribute('data-rmx-tour-root', tour.scenario.name)
    document.body.appendChild(container)
  }

  let root = createRoot(container)
  root.render(createElement(TourOverlay, { tour }))
  tours.set(tour.scenario.name, tour)

  return () => {
    root.dispose()
    if (owned) container.remove()
    if (tours.get(tour.scenario.name) === tour) tours.delete(tour.scenario.name)
  }
}

/** Options for {@link startTour}. */
export type StartTourOptions = TourOptions & MountTourOptions & {
  /** Show the tour even when the store says it is already finished. */
  force?: boolean
}

/**
 * Creates a tour, mounts its overlay, and starts it.
 *
 * Starting is fire-and-forget: a tour whose first step is still `whenMissing: "wait"`-ing should
 * not hold up whatever called this. Await {@link Tour.start} yourself if you need to know.
 *
 * @param scenario The tour definition
 * @param options Store, timeouts, container and `force`
 * @returns The tour. Its `dispose()` also removes the overlay.
 */
export function startTour(scenario: TourScenario, options: StartTourOptions = {}): Tour {
  let existing = tours.get(scenario.name)
  if (existing !== undefined) return existing

  let tour = createTour(scenario, options)
  let unmount = mountTour(tour, options)
  let disposeTour = tour.dispose.bind(tour)
  tour.dispose = () => {
    disposeTour()
    unmount()
  }

  void tour.start({ force: options.force })
  return tour
}

/** Props of the component {@link createTourEntry} builds. */
export type TourEntryProps = {
  scenario: TourScenario
}

/**
 * Builds a client entry that starts a tour from a server-rendered page.
 *
 * It is a factory rather than a component because `clientEntry()`'s first argument is the URL the
 * app serves this module from, and a library cannot know that. Declare it once in your own client
 * module and render it wherever the tour should begin:
 *
 * @example
 * ```tsx
 * // app/client/tour.ts
 * export const Tour = createTourEntry('/tour.js#Tour')
 *
 * // in a route
 * <Tour scenario={scenario} />
 * ```
 *
 * The component renders an empty placeholder — the overlay itself is mounted at the end of
 * `<body>`, so it does not matter where in the page this is placed.
 *
 * @param entryId Module URL and export name, as `clientEntry()` takes them
 * @returns A hydratable component taking a `scenario` prop
 */
export function createTourEntry(entryId: string): EntryComponent<TourEntryProps> {
  return clientEntry<TourEntryProps>(entryId, function Tour(handle: Handle<TourEntryProps>) {
    if (typeof document !== 'undefined') {
      let scenario = handle.props.scenario
      let tour = startTour(scenario, { force: false })
      handle.signal.addEventListener('abort', () => tour.dispose())
    }
    return (): RemixNode => createElement('div', { hidden: true, 'data-rmx-tour': true })
  })
}

export { TourOverlay } from './lib/overlay.tsx'
export type { TourOverlayProps } from './lib/overlay.tsx'
