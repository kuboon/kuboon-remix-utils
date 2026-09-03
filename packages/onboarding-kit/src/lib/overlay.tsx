/**
 * The overlay: a dimmed backdrop, a spotlight cut-out, and an anchored tooltip.
 *
 * Positioning is imperative rather than expressed in the render function. `anchor()` and the
 * spotlight tracker both own inline styles on a live node and both return teardown functions, so
 * they are attached once per step from `sync()` and detached before the next one — trying to
 * express that as render output would fight the reconciler for the same style properties.
 */

import { attrs, css, on, ref } from '@remix-run/ui'
import type { Handle, RemixNode } from '@remix-run/ui'
import { anchor } from '@remix-run/ui/anchor'
import { isTourVisible, resolveStepOptions, type Tour } from './tour.ts'
import { trackRect } from './track.ts'

/** Props for {@link TourOverlay}. */
export type TourOverlayProps = {
  tour: Tour
}

const DEFAULT_LABELS = {
  next: 'Next',
  back: 'Back',
  skip: 'Skip',
  done: 'Done',
  progress: '{index} / {total}',
}

/**
 * Renders a tour.
 *
 * Mount it with {@link import('../ui.ts').mountTour}, which gives it a container of its own at the
 * end of `<body>` — the overlay must not live inside the tree it is pointing at.
 *
 * @param handle Component handle carrying the tour to render
 * @returns The overlay render function
 */
export function TourOverlay(handle: Handle<TourOverlayProps>): () => RemixNode {
  let tour = handle.props.tour

  let tooltipEl: HTMLElement | null = null
  let spotlightEl: HTMLElement | null = null
  let detachAnchor: (() => void) | null = null
  let detachTrack: (() => void) | null = null

  function clearPositioning(): void {
    detachAnchor?.()
    detachAnchor = null
    detachTrack?.()
    detachTrack = null
  }

  /** Re-attaches `anchor()` and the spotlight tracker for whatever step is current. */
  function sync(): void {
    clearPositioning()
    if (tooltipEl === null) return

    let { status, step, target } = tour.state
    if (!isTourVisible(status) || step === null) {
      hidePopover(tooltipEl)
      return
    }

    showPopover(tooltipEl)
    let options = resolveStepOptions(tour.scenario, step)

    if (target === null) {
      centerFloating(tooltipEl)
      return
    }

    tooltipEl.style.transform = ''
    detachAnchor = anchor(tooltipEl, target, {
      placement: options.placement,
      offset: options.offset,
    })

    if (options.spotlight && spotlightEl !== null) {
      let element = spotlightEl
      let pad = options.spotlightPadding
      detachTrack = trackRect(target, (rect) => {
        element.style.top = `${rect.top - pad}px`
        element.style.left = `${rect.left - pad}px`
        element.style.width = `${rect.width + pad * 2}px`
        element.style.height = `${rect.height + pad * 2}px`
      })
    }
  }

  tour.addEventListener('change', () => {
    void handle.update().then(sync)
  }, { signal: handle.signal })

  handle.signal.addEventListener('abort', clearPositioning)

  return () => {
    let { status, step, index, total, target } = tour.state
    let visible = isTourVisible(status) && step !== null
    let options = step === null ? null : resolveStepOptions(tour.scenario, step)
    // Either the spotlight's ring-shaped shadow dims the page, or — when there is nothing to cut
    // out — the backdrop does it itself. Never both, or the overlap reads as two different greys.
    let spotlit = visible && options !== null && options.spotlight && target !== null
    let labels = { ...DEFAULT_LABELS, ...tour.scenario.labels }
    let isLast = index >= total - 1

    return (
      <div
        mix={[
          css(styles.root),
          attrs({ 'data-tour': tour.scenario.name, 'data-tour-status': status }),
        ]}
        hidden={!visible}
      >
        <div mix={[css(spotlit ? styles.backdrop : styles.backdropDim)]} />
        <div
          mix={[
            css(styles.spotlight),
            ref((node) => {
              spotlightEl = node as HTMLElement
              sync()
            }),
          ]}
          hidden={!spotlit}
        />
        <div
          mix={[
            css(styles.tooltip),
            attrs({ popover: 'manual', role: 'dialog', 'aria-live': 'polite' }),
            ref((node) => {
              tooltipEl = node as HTMLElement
              sync()
            }),
          ]}
        >
          {step?.title ? <p mix={[css(styles.title)]}>{step.title}</p> : null}
          {step?.body ? <p mix={[css(styles.body)]}>{step.body}</p> : null}
          <div mix={[css(styles.footer)]}>
            <span mix={[css(styles.progress)]}>
              {labels.progress
                .replace('{index}', String(index + 1))
                .replace('{total}', String(total))}
            </span>
            <div mix={[css(styles.actions)]}>
              <button
                type='button'
                mix={[css(styles.ghost), on('click', () => void tour.stop('skip'))]}
              >
                {labels.skip}
              </button>
              <button
                type='button'
                disabled={index <= 0}
                mix={[css(styles.ghost), on('click', () => void tour.back())]}
              >
                {labels.back}
              </button>
              <button
                type='button'
                mix={[
                  css(styles.primary),
                  on('click', () => void (isLast ? tour.stop('complete') : tour.next())),
                ]}
              >
                {isLast ? labels.done : labels.next}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }
}

/**
 * Puts a floating element in the middle of the viewport.
 *
 * Undoes what `anchor()` left behind: it writes `top`/`left`/`max-width`/`max-height` inline and
 * never clears them, so a centered step following an anchored one would inherit the last step's
 * position.
 */
function centerFloating(element: HTMLElement): void {
  element.style.position = 'fixed'
  element.style.inset = 'auto'
  element.style.maxWidth = ''
  element.style.maxHeight = ''
  element.style.top = '50%'
  element.style.left = '50%'
  element.style.transform = 'translate(-50%, -50%)'
  element.removeAttribute('data-anchor-placement')
}

/**
 * Opens the tooltip in the top layer.
 *
 * The `popover` attribute earns its keep twice: it lifts the tooltip above the backdrop without a
 * z-index race, and `anchor()` reads it to decide the floating element is `position: fixed` — which
 * it must be, since its containing block is the fixed overlay root rather than the document.
 */
function showPopover(element: HTMLElement): void {
  if (typeof element.showPopover !== 'function') return
  try {
    if (!element.matches(':popover-open')) element.showPopover()
  } catch {
    // Not connected yet, or already open: the next sync() will settle it.
  }
}

function hidePopover(element: HTMLElement): void {
  if (typeof element.hidePopover !== 'function') return
  try {
    if (element.matches(':popover-open')) element.hidePopover()
  } catch {
    // Already closed.
  }
}

/**
 * The style-object shape the `css` mixin accepts.
 *
 * `@remix-run/ui` does not re-export `CSSProps` from its root, and there is no `./style` subpath,
 * so it is read back off the mixin itself rather than duplicated here and left to drift.
 */
type CSSProps = Parameters<typeof css>[0]

const DIM = 'rgb(0 0 0 / 0.55)'

const styles: Record<string, CSSProps> = {
  root: {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483000',
    pointerEvents: 'none',
  },
  backdrop: {
    position: 'fixed',
    inset: '0',
    // Transparent, but still clickable: this is what stops the page being used mid-tour. The
    // spotlight cannot do it — a box-shadow does not receive pointer events.
    pointerEvents: 'auto',
  },
  backdropDim: {
    position: 'fixed',
    inset: '0',
    pointerEvents: 'auto',
    background: DIM,
  },
  spotlight: {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '0',
    height: '0',
    borderRadius: '6px',
    // One element for both the cut-out and the dim: an enormous spread shadow covers the viewport
    // while the element's own box stays clear.
    boxShadow: `0 0 0 9999px ${DIM}`,
    outline: '2px solid rgb(255 255 255 / 0.9)',
    outlineOffset: '0',
    pointerEvents: 'none',
    transition: 'top 120ms ease, left 120ms ease, width 120ms ease, height 120ms ease',
  },
  tooltip: {
    position: 'fixed',
    margin: '0',
    width: 'max-content',
    maxWidth: 'min(320px, calc(100vw - 32px))',
    padding: '16px',
    border: '1px solid rgb(0 0 0 / 0.1)',
    borderRadius: '10px',
    background: '#fff',
    color: '#111',
    boxShadow: '0 12px 32px rgb(0 0 0 / 0.24)',
    font: '14px/1.5 system-ui, sans-serif',
    pointerEvents: 'auto',
    '@media (prefers-color-scheme: dark)': {
      background: '#1c1c1e',
      color: '#f2f2f2',
      borderColor: 'rgb(255 255 255 / 0.14)',
    },
  },
  title: {
    margin: '0 0 6px',
    fontSize: '15px',
    fontWeight: '600',
  },
  body: {
    margin: '0',
    opacity: '0.85',
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    marginTop: '14px',
  },
  progress: {
    fontSize: '12px',
    opacity: '0.6',
    fontVariantNumeric: 'tabular-nums',
  },
  actions: {
    display: 'flex',
    gap: '6px',
  },
  ghost: {
    padding: '5px 10px',
    border: '0',
    borderRadius: '6px',
    background: 'transparent',
    color: 'inherit',
    font: 'inherit',
    cursor: 'pointer',
    '&:hover:not(:disabled)': { background: 'rgb(127 127 127 / 0.16)' },
    '&:disabled': { opacity: '0.4', cursor: 'default' },
  },
  primary: {
    padding: '5px 12px',
    border: '0',
    borderRadius: '6px',
    background: '#111',
    color: '#fff',
    font: 'inherit',
    fontWeight: '600',
    cursor: 'pointer',
    '&:hover': { opacity: '0.85' },
    '@media (prefers-color-scheme: dark)': { background: '#f2f2f2', color: '#111' },
  },
}
