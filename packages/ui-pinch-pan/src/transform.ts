/**
 * The view transform and its limits.
 *
 * Nothing here touches the DOM, so the arithmetic that decides where the content lands is testable
 * on its own.
 */

/**
 * A 2-D view transform: scale about the content's top-left corner, then translate.
 *
 * The pairing with `transform-origin: 0 0` is not incidental — {@link transformToCss} assumes it,
 * and so does the algebra in `gesture.ts`, which recovers the content point under a touch by
 * undoing the scale before the translation.
 */
export interface Transform {
  /** Horizontal translation in CSS pixels. */
  readonly x: number
  /** Vertical translation in CSS pixels. */
  readonly y: number
  /** Uniform scale factor. `1` is the content's natural size. */
  readonly scale: number
}

/** Untranslated, unscaled. */
export const IDENTITY_TRANSFORM: Transform = { x: 0, y: 0, scale: 1 }

/** How far the content may be scaled. */
export interface ScaleLimits {
  /** Smallest allowed scale. Defaults to `0`, i.e. unbounded. */
  readonly minScale?: number
  /** Largest allowed scale. Defaults to `Infinity`, i.e. unbounded. */
  readonly maxScale?: number
}

/**
 * Constrains a scale to its limits.
 *
 * A `min` above `max` is not an error the caller can usefully recover from mid-gesture, so `max`
 * wins and the result is `max`. A non-finite input falls back to `1` rather than poisoning the
 * transform with `NaN`, which CSS would drop silently.
 *
 * @param scale Desired scale
 * @param limits Bounds to apply
 * @returns The scale, clamped
 */
export function clampScale(scale: number, limits: ScaleLimits = {}): number {
  let min = limits.minScale ?? 0
  let max = limits.maxScale ?? Number.POSITIVE_INFINITY
  if (!Number.isFinite(scale) || scale <= 0) scale = 1
  if (!(min >= 0)) min = 0
  if (!(max > 0)) max = Number.POSITIVE_INFINITY
  if (min > max) return max
  return Math.min(Math.max(scale, min), max)
}

/**
 * Renders a transform as a CSS `transform` value.
 *
 * @param transform Transform to render
 * @returns A value for the `transform` property, to be used with `transform-origin: 0 0`
 */
export function transformToCss(transform: Transform): string {
  return `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`
}

/**
 * Whether two transforms are equal within a pixel-ish tolerance.
 *
 * Used to skip work when a pointer moves by an amount that cannot change what is painted.
 *
 * @param a First transform
 * @param b Second transform
 * @param epsilon Tolerance
 * @returns `true` when the two would paint the same
 */
export function transformsEqual(a: Transform, b: Transform, epsilon = 1e-4): boolean {
  return (
    Math.abs(a.x - b.x) <= epsilon &&
    Math.abs(a.y - b.y) <= epsilon &&
    Math.abs(a.scale - b.scale) <= epsilon
  )
}
