import { clampScale, type ScaleLimits, type Transform } from './transform.ts'

/** A point in the content's coordinate space — the untransformed box, origin at its top-left. */
export interface Point {
  readonly x: number
  readonly y: number
}

/** One finger, identified so the set can be compared between events. */
export interface GesturePointer extends Point {
  /** `PointerEvent.pointerId`. */
  readonly id: number
}

/**
 * What the gesture was anchored to when it started.
 *
 * Everything a move needs is captured here, which is what makes re-anchoring cheap: when the set of
 * fingers changes, anchor again against the transform the content already has and the content does
 * not jump.
 */
export interface GestureAnchor {
  /** The pointer ids this anchor was taken from, sorted. */
  readonly ids: readonly number[]
  /** Centroid of those pointers at anchor time. */
  readonly centroid: Point
  /** Mean distance from the centroid at anchor time. `0` for a single pointer. */
  readonly spread: number
  /** The transform the content had at anchor time. */
  readonly transform: Transform
}

/**
 * Averages a set of points.
 *
 * @param points Points to average
 * @returns Their centroid, or the origin when given none
 */
export function centroidOf(points: readonly Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 }
  let x = 0
  let y = 0
  for (let point of points) {
    x += point.x
    y += point.y
  }
  return { x: x / points.length, y: y / points.length }
}

/**
 * Measures how far apart a set of points is.
 *
 * The mean distance from the centroid, rather than the distance between two fingers, so that a
 * third finger joining a pinch changes the measure continuously instead of redefining it.
 *
 * @param points Points to measure
 * @returns Mean distance from the centroid; `0` for fewer than two points
 */
export function spreadOf(points: readonly Point[]): number {
  if (points.length < 2) return 0
  let center = centroidOf(points)
  let total = 0
  for (let point of points) {
    total += Math.hypot(point.x - center.x, point.y - center.y)
  }
  return total / points.length
}

/**
 * Captures the state a gesture is measured against.
 *
 * @param pointers Fingers currently down, in content coordinates
 * @param transform The transform the content has right now
 * @returns An anchor to pass to {@link advanceGesture}
 */
export function anchorGesture(
  pointers: readonly GesturePointer[],
  transform: Transform,
): GestureAnchor {
  return {
    ids: pointers.map((pointer) => pointer.id).sort((a, b) => a - b),
    centroid: centroidOf(pointers),
    spread: spreadOf(pointers),
    transform,
  }
}

/**
 * Whether a pointer set is still the one an anchor was taken from.
 *
 * @param anchor Anchor to check against
 * @param pointers Fingers currently down
 * @returns `true` when the same ids are down, in any order
 */
export function anchorMatches(
  anchor: GestureAnchor,
  pointers: readonly GesturePointer[],
): boolean {
  if (anchor.ids.length !== pointers.length) return false
  let ids = pointers.map((pointer) => pointer.id).sort((a, b) => a - b)
  return ids.every((id, index) => id === anchor.ids[index])
}

/**
 * Computes the transform a gesture has reached.
 *
 * The content point that sat under the fingers' centroid when the gesture started is put back under
 * their centroid now. That single rule produces pan and zoom at once: moving both fingers moves the
 * centroid, spreading them changes the scale, and doing both does both.
 *
 * Clamping is applied to the scale *before* the translation is solved, so a pinch that runs into
 * `maxScale` stops growing without the content sliding out from under the fingers.
 *
 * @param anchor What the gesture was anchored to
 * @param pointers Fingers currently down, in content coordinates
 * @param limits Scale bounds
 * @returns The transform to paint
 */
export function advanceGesture(
  anchor: GestureAnchor,
  pointers: readonly GesturePointer[],
  limits: ScaleLimits = {},
): Transform {
  let previousScale = anchor.transform.scale
  if (!(previousScale > 0)) previousScale = 1

  let factor = 1
  let spread = spreadOf(pointers)
  if (anchor.spread > 0 && spread > 0) factor = spread / anchor.spread

  let scale = clampScale(previousScale * factor, limits)

  // The content point under the anchor centroid, recovered by undoing the anchor transform.
  let contentX = (anchor.centroid.x - anchor.transform.x) / previousScale
  let contentY = (anchor.centroid.y - anchor.transform.y) / previousScale

  let centroid = centroidOf(pointers)
  return {
    x: centroid.x - contentX * scale,
    y: centroid.y - contentY * scale,
    scale,
  }
}
