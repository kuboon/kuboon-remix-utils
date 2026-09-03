/**
 * A product tour for Remix UI: a spotlight walkthrough whose scenario is JSON.
 *
 * This entry is the headless half — step order, target resolution, keyboard control and
 * completion — and renders nothing. Import `@kuboon/remix-onboarding-kit/ui` for the overlay.
 */

export { createTour, isTourVisible, resolveStepOptions } from './lib/tour.ts'
export type { Tour, TourEventMap, TourOptions } from './lib/tour.ts'
export { localStorageTourStore, memoryTourStore } from './lib/store.ts'
export type { TourStore } from './lib/store.ts'
export { readRect, trackRect } from './lib/track.ts'
export type {
  TourLabels,
  TourPlacement,
  TourPoint,
  TourScenario,
  TourState,
  TourStatus,
  TourStep,
  TourStepDefaults,
  TourStopReason,
  TourTarget,
  TourWhenMissing,
} from './lib/types.ts'
