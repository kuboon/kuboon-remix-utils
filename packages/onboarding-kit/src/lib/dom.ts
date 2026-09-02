/**
 * The one place the kit touches a DOM constructor directly.
 *
 * The headless entry has to be importable where there is no DOM — a test runner, a server render —
 * so `instanceof HTMLElement` is never written bare: the constructor itself is absent there, and a
 * bare check would throw a ReferenceError rather than return false.
 */

/** True when the value is a live element rather than a fixed rectangle or nothing at all. */
export function isElement(value: unknown): value is HTMLElement {
  return typeof HTMLElement !== 'undefined' && value instanceof HTMLElement
}
