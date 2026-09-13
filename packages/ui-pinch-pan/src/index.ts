/**
 * Two-finger pinch and pan as a [`@remix-run/ui`](https://www.npmjs.com/package/@remix-run/ui) mixin.
 *
 * {@link pinchPan} is the whole public surface for normal use. The gesture arithmetic is exported
 * too, so a component that paints the view itself — on a canvas, or through state it already owns —
 * can reuse the part that decides where the content lands without taking the DOM wiring.
 *
 * ## This package has moved
 *
 * It continues as **`@remix-kbn/ui-pinch-pan`**. The `remix-` prefix goes with the move, because the scope now
 * says it.
 *
 * ```diff
 * - "@kuboon/remix-ui-pinch-pan": "jsr:@kuboon/remix-ui-pinch-pan@^0.1.0"
 * + "@remix-kbn/ui-pinch-pan": "jsr:@remix-kbn/ui-pinch-pan"
 * ```
 *
 * 0.1.1 carries this notice and nothing else — its code is 0.1.0's. What comes after it
 * is published under the new name; if `@remix-kbn/ui-pinch-pan` is not on JSR yet as you read this, that is the
 * only thing left to happen.
 *
 * Nothing breaks if you stay. JSR cannot unpublish, so every version under this name keeps
 * resolving exactly as it does today, and there is no deadline attached to moving.
 *
 * @module
 */

export { pinchPan } from './pinch-pan.ts'
export type { PinchPanContent, PinchPanControls, PinchPanOptions } from './pinch-pan.ts'

export { advanceGesture, anchorGesture, anchorMatches, centroidOf, spreadOf } from './gesture.ts'
export type { GestureAnchor, GesturePointer, Point } from './gesture.ts'

export { clampScale, IDENTITY_TRANSFORM, transformsEqual, transformToCss } from './transform.ts'
export type { ScaleLimits, Transform } from './transform.ts'
