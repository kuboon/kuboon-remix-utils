/**
 * Keeps the spotlight sitting exactly on top of its target.
 *
 * `anchor()` from `@remix-run/ui/anchor` places a floating element *beside* a target and already
 * tracks it, which is everything the tooltip needs. The spotlight is the one piece it cannot do:
 * it has to *cover* the target, and `anchor()`'s `inset` option positions inside an edge without
 * sizing the floating element. So this is the small amount of rect-following the kit owns.
 */

import type { TourTarget } from './types.ts'
import { isElement } from './dom.ts'

/** Reads a target's current viewport rectangle. */
export function readRect(target: TourTarget): DOMRect {
  if (isElement(target)) return target.getBoundingClientRect()
  return new DOMRect(target.x, target.y, target.width ?? 0, target.height ?? 0)
}

function sameRect(a: DOMRect | null, b: DOMRect): boolean {
  return a !== null &&
    a.x === b.x &&
    a.y === b.y &&
    a.width === b.width &&
    a.height === b.height
}

/**
 * Calls `onRect` whenever the target's viewport rectangle changes.
 *
 * Polls on `requestAnimationFrame` and listens for scroll and resize — the same strategy `anchor()`
 * uses, which is what keeps the spotlight and the tooltip from drifting apart by a frame.
 *
 * @param target Element or fixed rectangle to follow
 * @param onRect Called immediately, then on every change
 * @returns A function that stops tracking
 */
export function trackRect(target: TourTarget, onRect: (rect: DOMRect) => void): () => void {
  let last: DOMRect | null = null
  let frame = 0

  function emit(): void {
    let rect = readRect(target)
    if (sameRect(last, rect)) return
    last = rect
    onRect(rect)
  }

  function poll(): void {
    emit()
    frame = requestAnimationFrame(poll)
  }

  function force(): void {
    last = null
    emit()
  }

  emit()
  frame = requestAnimationFrame(poll)
  globalThis.addEventListener('scroll', force, { passive: true, capture: true })
  globalThis.addEventListener('resize', force, { passive: true })

  return () => {
    cancelAnimationFrame(frame)
    globalThis.removeEventListener('scroll', force, { capture: true })
    globalThis.removeEventListener('resize', force)
  }
}
