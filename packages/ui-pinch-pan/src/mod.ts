/**
 * Two-finger pinch and pan as a `@remix-run/ui` mixin.
 *
 * {@link pinchPan} is the whole public surface for normal use. The gesture arithmetic is exported
 * too, so a component that paints the view itself — on a canvas, or through state it already owns —
 * can reuse the part that decides where the content lands without taking the DOM wiring.
 *
 * @module
 */

export { pinchPan } from './pinch-pan.ts'
export type { PinchPanContent, PinchPanControls, PinchPanOptions } from './pinch-pan.ts'

export { advanceGesture, anchorGesture, anchorMatches, centroidOf, spreadOf } from './gesture.ts'
export type { GestureAnchor, GesturePointer, Point } from './gesture.ts'

export { clampScale, IDENTITY_TRANSFORM, transformsEqual, transformToCss } from './transform.ts'
export type { ScaleLimits, Transform } from './transform.ts'
