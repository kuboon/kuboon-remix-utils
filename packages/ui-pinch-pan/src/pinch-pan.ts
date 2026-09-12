import { createMixin, type ElementProps, type MixinFactory } from '@remix-run/ui'

import {
  advanceGesture,
  anchorGesture,
  anchorMatches,
  type GestureAnchor,
  type GesturePointer,
  type Point,
} from './gesture.ts'
import {
  clampScale,
  IDENTITY_TRANSFORM,
  type ScaleLimits,
  type Transform,
  transformsEqual,
  transformToCss,
} from './transform.ts'

/** Programmatic access to the view, handed to {@link PinchPanOptions.controls}. */
export interface PinchPanControls {
  /** The transform the content currently has. */
  readonly transform: Transform
  /**
   * Moves the view. Omitted fields keep their current value and the scale is clamped.
   *
   * @param next Fields to change
   */
  set(next: Partial<Transform>): void
  /** Returns the view to the transform the mixin started from. */
  reset(): void
}

/** How to resolve the element that receives the transform. */
export type PinchPanContent = string | ((host: Element) => Element | null)

/** Options for {@link pinchPan}. */
export interface PinchPanOptions extends ScaleLimits {
  /**
   * The element to transform, as a selector resolved within the host or a function of the host.
   *
   * Defaults to the host's first element child, or the host itself when it has none — so
   * `<div mix={[pinchPan()]}><img /></div>` moves the image inside a fixed frame, and
   * `<img mix={[pinchPan()]} />` moves the image itself.
   */
  readonly content?: PinchPanContent
  /** Where the view starts, and where {@link PinchPanControls.reset} returns to. */
  readonly initial?: Partial<Transform>
  /**
   * Write `style.transform` on the content element. Default `true`.
   *
   * Turn it off to paint the view yourself from {@link PinchPanOptions.onChange} — on a canvas, or
   * through whatever the rest of the component already owns.
   */
  readonly apply?: boolean
  /**
   * What to set `touch-action` to on the host. `true` (the default) means `none`.
   *
   * Some value is needed: left alone, the browser claims the gesture first and scrolls or zooms the
   * page instead, and no `pointermove` arrives. `none` is right when the host owns every gesture.
   *
   * Pass a CSS value instead when the host is a **scroll container** and you want to keep its
   * scrolling: `'pan-x pan-y'` lets the browser pan with one finger and with the wheel, while still
   * excluding its own pinch-zoom, so a two-finger gesture reaches this mixin uninterrupted. `false`
   * sets nothing, for when your own CSS already says it.
   */
  readonly touchAction?: boolean | string
  /** Pointer types that take part. Default `['touch', 'pen']`. */
  readonly pointerTypes?: readonly string[]
  /** Called when a gesture starts. */
  readonly onStart?: (transform: Transform) => void
  /** Called whenever the view changes, by gesture or by {@link PinchPanControls}. */
  readonly onChange?: (transform: Transform) => void
  /** Called when the last finger lifts. */
  readonly onEnd?: (transform: Transform) => void
  /**
   * Receives the controls once the host is inserted, with a signal aborted when it is removed.
   *
   * @param controls Programmatic access to the view
   * @param signal Aborted when the host leaves the document
   */
  readonly controls?: (controls: PinchPanControls, signal: AbortSignal) => void
}

const DEFAULT_POINTER_TYPES: readonly string[] = ['touch', 'pen']

/**
 * Two-finger pinch and pan for touch and pen input.
 *
 * The host element listens; its content is transformed. A gesture runs while two or more accepted
 * pointers are down: the content point under their centroid is held under their centroid, so
 * spreading the fingers zooms about the point between them and moving both pans. Changing the set
 * of fingers mid-gesture re-anchors against the transform the content already has, so lifting one
 * of three fingers does not make the view jump.
 *
 * The content is scaled about its top-left (`transform-origin: 0 0`, which the mixin sets), because
 * the arithmetic that keeps a point under the fingers has to agree with the origin CSS scales
 * about.
 *
 * Mouse input is ignored by default: one mouse pointer cannot pinch, and claiming its drags would
 * take them away from selection and from the page. Add `'mouse'` to `pointerTypes` if the host has
 * no other use for them.
 *
 * @example
 * ```tsx ignore
 * <div class="viewport" mix={[pinchPan({ maxScale: 6 })]}>
 *   <img src="/map.png" alt="" />
 * </div>
 * ```
 */
export const pinchPan: MixinFactory<Element, [options?: PinchPanOptions], ElementProps> =
  createMixin<Element, [options?: PinchPanOptions], ElementProps>((handle) => {
    let options: PinchPanOptions = {}
    let host: Element | null = null
    let content: Element | null = null
    let controller: AbortController | undefined

    let transform: Transform = IDENTITY_TRANSFORM
    let pointers = new Map<number, GesturePointer>()
    let anchor: GestureAnchor | null = null
    /** Client-space position of the content's untransformed top-left, taken when anchoring. */
    let origin: Point = { x: 0, y: 0 }

    let limits = (): ScaleLimits => ({
      minScale: options.minScale,
      maxScale: options.maxScale,
    })

    let initialTransform = (): Transform => {
      let initial = options.initial ?? {}
      return {
        x: initial.x ?? IDENTITY_TRANSFORM.x,
        y: initial.y ?? IDENTITY_TRANSFORM.y,
        scale: clampScale(initial.scale ?? IDENTITY_TRANSFORM.scale, limits()),
      }
    }

    let resolveContent = (node: Element): Element => {
      let { content: selector } = options
      if (typeof selector === 'function') return selector(node) ?? node
      if (typeof selector === 'string') return node.querySelector(selector) ?? node
      return node.firstElementChild ?? node
    }

    let paint = () => {
      if (options.apply === false) return
      let style = (content as HTMLElement | null)?.style
      if (!style) return
      style.transformOrigin = '0 0'
      style.transform = transformToCss(transform)
    }

    let commit = (next: Transform) => {
      if (transformsEqual(next, transform)) return
      transform = next
      paint()
      options.onChange?.(transform)
    }

    // The content's untransformed top-left in client coordinates. `transform-origin: 0 0` means the
    // painted box starts at that corner plus the translation, so subtracting the translation back
    // out recovers it without depending on layout details we do not control.
    let measureOrigin = (): Point => {
      if (!content) return { x: 0, y: 0 }
      let rect = content.getBoundingClientRect()
      return { x: rect.left - transform.x, y: rect.top - transform.y }
    }

    let toContentSpace = (event: PointerEvent): GesturePointer => ({
      id: event.pointerId,
      x: event.clientX - origin.x,
      y: event.clientY - origin.y,
    })

    let accepts = (event: PointerEvent): boolean =>
      (options.pointerTypes ?? DEFAULT_POINTER_TYPES).includes(event.pointerType)

    let reanchor = () => {
      let active = [...pointers.values()]
      anchor = active.length >= 2 ? anchorGesture(active, transform) : null
    }

    let onPointerDown = (event: PointerEvent) => {
      if (!accepts(event)) return
      let wasIdle = pointers.size === 0
      if (wasIdle) origin = measureOrigin()
      pointers.set(event.pointerId, toContentSpace(event))
      // Capture so the gesture survives a finger sliding off the host, which it will as soon as the
      // content moves out from under it.
      if (host && 'setPointerCapture' in host) {
        try {
          host.setPointerCapture(event.pointerId)
        } catch {
          // A pointer that ended between the event and here; the up/cancel handler cleans up.
        }
      }
      if (pointers.size === 2) options.onStart?.(transform)
      reanchor()
    }

    let onPointerMove = (event: PointerEvent) => {
      if (!pointers.has(event.pointerId)) return
      pointers.set(event.pointerId, toContentSpace(event))
      let active = [...pointers.values()]
      if (!anchor || !anchorMatches(anchor, active)) return
      event.preventDefault()
      commit(advanceGesture(anchor, active, limits()))
    }

    let endPointer = (event: PointerEvent) => {
      if (!pointers.delete(event.pointerId)) return
      if (host && 'releasePointerCapture' in host) {
        try {
          host.releasePointerCapture(event.pointerId)
        } catch {
          // Capture was already released with the pointer; nothing to undo.
        }
      }
      // Anchor again against where the content is now, so the fingers that remain carry on from
      // here instead of from where the gesture began.
      reanchor()
      if (pointers.size === 0) options.onEnd?.(transform)
    }

    let controls: PinchPanControls = {
      get transform() {
        return transform
      },
      set(next) {
        commit({
          x: next.x ?? transform.x,
          y: next.y ?? transform.y,
          scale: clampScale(next.scale ?? transform.scale, limits()),
        })
      },
      reset() {
        commit(initialTransform())
      },
    }

    handle.addEventListener('insert', (event) => {
      host = event.node
      content = resolveContent(event.node)
      controller = new AbortController()
      let signal = controller.signal

      const touchAction = options.touchAction ?? true
      if (touchAction !== false) {
        ;(host as HTMLElement).style?.setProperty(
          'touch-action',
          touchAction === true ? 'none' : touchAction,
        )
      }

      transform = initialTransform()
      paint()

      host.addEventListener('pointerdown', onPointerDown as EventListener, { signal })
      host.addEventListener('pointermove', onPointerMove as EventListener, {
        signal,
        passive: false,
      })
      host.addEventListener('pointerup', endPointer as EventListener, { signal })
      host.addEventListener('pointercancel', endPointer as EventListener, { signal })

      options.controls?.(controls, signal)
    })

    handle.addEventListener('remove', () => {
      controller?.abort(new DOMException('', 'AbortError'))
      controller = undefined
      pointers.clear()
      anchor = null
      host = null
      content = null
    })

    return (nextOptions = {}) => {
      options = nextOptions
      return handle.element
    }
  })
