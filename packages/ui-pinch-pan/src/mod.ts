/**
 * Two-finger pinch and pan for touch and pen input, as a
 * [`@remix-run/ui`](https://www.npmjs.com/package/@remix-run/ui) mixin.
 *
 * The host element listens; its content is transformed. One rule produces the whole gesture: **the
 * content point under the fingers' centroid stays under their centroid.** Moving both fingers pans,
 * spreading them zooms about the point between them, and doing both does both.
 *
 * ```tsx ignore
 * import { pinchPan } from '@remix-kbn/ui-pinch-pan'
 *
 * <div class='viewport' mix={[pinchPan({ maxScale: 8 })]}>
 *   <div class='map'>…</div>
 * </div>
 * ```
 *
 * Put it on the element that should stay still — a viewport with `overflow: hidden` — not on the
 * content. The content moves out from under the fingers as soon as the gesture starts, so it cannot
 * be the thing listening. By default the element transformed is the host's first element child, or
 * the host itself when it has none.
 *
 * Nothing else is required. The mixin sets `touch-action: none` on the host, without which the
 * browser claims the gesture and no `pointermove` ever arrives, and `transform-origin: 0 0` on the
 * content, which the arithmetic that recovers the point under the fingers assumes. Both are
 * load-bearing and both are easy to forget, which is most of why this is a package.
 *
 * Mouse input is ignored by default: one mouse pointer cannot pinch, and claiming its drags would
 * take them away from text selection and from the page. Pass `pointerTypes` if the host has no
 * other use for them.
 *
 * ## What a hand-rolled version gets wrong
 *
 * Neither of these fails loudly, which is why they are worth stating.
 *
 * **Reaching a scale limit does not slide the content.** The scale is clamped *before* the
 * translation is solved, so a pinch that hits `maxScale` simply stops growing. Clamping the
 * finished transform instead keeps zooming in the arithmetic while the painted scale stands still,
 * and the content drifts out from under the fingers.
 *
 * **Changing fingers mid-gesture does not jump.** Adding or lifting a finger re-anchors against the
 * transform the content already has, rather than continuing to measure against a set that is no
 * longer down.
 *
 * ## Driving the view from the rest of the component
 *
 * {@link PinchPanOptions.controls} hands over the current transform plus `set()` and `reset()` once
 * the host is inserted, with a signal aborted when it leaves the document. That is how a reset
 * button, a zoom control or a "fit" action reaches the same view the fingers move — and, since a
 * two-finger gesture cannot be performed with a mouse, how the feature stays usable on a desktop.
 *
 * ```tsx ignore
 * import { on } from '@remix-run/ui'
 * import { pinchPan, type PinchPanControls } from '@remix-kbn/ui-pinch-pan'
 *
 * let view: PinchPanControls | null = null
 *
 * <div mix={[pinchPan({ maxScale: 8, controls: (api) => (view = api) })]}>
 *   <div class='map'>…</div>
 * </div>
 * <button mix={[on('click', () => view?.reset())]}>Reset</button>
 * ```
 *
 * Pair it with {@link PinchPanOptions.onChange} to show the live transform, and note that
 * `set({ scale })` scales about the content's top-left: to zoom about the middle of the viewport,
 * solve the translation the same way the gesture does, with the viewport's midpoint standing in for
 * the centroid.
 *
 * ## Painting the view yourself
 *
 * A CSS transform is not the only way to show a zoom. {@link PinchPanOptions.apply} `: false` stops
 * the mixin writing `style.transform` while it keeps everything else it does — pointer capture,
 * re-anchoring when a finger joins or leaves, converting client coordinates into the content's
 * space — and hands you each transform through {@link PinchPanOptions.onChange}:
 *
 * ```ts ignore
 * pinchPan({ maxScale: 8, apply: false, onChange: (next) => redraw(next) })
 * ```
 *
 * That is the rung to take when the view is a canvas, a WebGL scene, or a board whose own width and
 * height carry the zoom.
 *
 * ## Using it with a scroll container
 *
 * A board that resizes itself rather than transforming usually pans by **native scrolling** — which
 * is also what the mouse wheel and a trackpad are doing. `touch-action: none` would take one-finger
 * scrolling away from it, so pass the value that keeps it instead:
 *
 * ```ts ignore
 * pinchPan({
 *   maxScale: 8,
 *   apply: false,
 *   touchAction: 'pan-x pan-y',
 *   onChange: (next) => resize(next),
 * })
 * ```
 *
 * `pan-x pan-y` lets the browser pan but excludes its own pinch-zoom, so one finger and the wheel
 * scroll the container while the two-finger gesture arrives here uninterrupted.
 *
 * ## Taking only the arithmetic
 *
 * The gesture arithmetic is exported separately from the DOM wiring, so a component that already
 * owns its event handling too can take the part that decides where the content lands and none of
 * the rest. It is also why the arithmetic is testable without a DOM.
 *
 * ```ts
 * import {
 *   advanceGesture,
 *   anchorGesture,
 *   IDENTITY_TRANSFORM,
 * } from '@remix-kbn/ui-pinch-pan'
 *
 * // Two fingers 100px apart, either side of (150, 150).
 * let down = [{ id: 1, x: 100, y: 150 }, { id: 2, x: 200, y: 150 }]
 * let anchor = anchorGesture(down, IDENTITY_TRANSFORM)
 *
 * // They spread to 200px apart without moving their midpoint: a 2x zoom about it.
 * let moved = [{ id: 1, x: 50, y: 150 }, { id: 2, x: 250, y: 150 }]
 * let next = advanceGesture(anchor, moved, { minScale: 1, maxScale: 8 })
 *
 * next.scale // 2
 * next.x // -150
 * next.y // -150
 * ```
 *
 * Points are in the content's own coordinate space: its untransformed box, origin at the top-left.
 * The mixin converts from client coordinates by measuring that corner once per gesture; doing it
 * yourself means measuring it yourself, and re-anchoring yourself when the set of fingers changes.
 *
 * @module
 */

export { pinchPan } from './pinch-pan.ts'
export type { PinchPanContent, PinchPanControls, PinchPanOptions } from './pinch-pan.ts'

export { advanceGesture, anchorGesture, anchorMatches, centroidOf, spreadOf } from './gesture.ts'
export type { GestureAnchor, GesturePointer, Point } from './gesture.ts'

export { clampScale, IDENTITY_TRANSFORM, transformsEqual, transformToCss } from './transform.ts'
export type { ScaleLimits, Transform } from './transform.ts'
