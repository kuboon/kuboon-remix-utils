# @remix-kbn/ui-pinch-pan

Two-finger pinch and pan as a [`@remix-run/ui`](https://www.npmjs.com/package/@remix-run/ui) mixin.

```sh
deno add jsr:@remix-kbn/ui-pinch-pan
```

```tsx ignore
import { pinchPan } from '@remix-kbn/ui-pinch-pan'
<div class='viewport' mix={[pinchPan({ maxScale: 6 })]}>
  <img src='/map.png' alt='' />
</div>
```

The host element listens; its content is transformed. Nothing else is required — the mixin sets
`touch-action: none` on the host and `transform-origin: 0 0` on the content itself, because both are
load-bearing and both are easy to forget.

## How the gesture behaves

A gesture runs while two or more accepted pointers are down. One rule produces all of it: **the
content point under the fingers' centroid stays under their centroid.** Moving both fingers pans,
spreading them zooms about the point between them, and doing both does both.

Two consequences are worth knowing, because they are what a hand-rolled version usually gets wrong:

- **Reaching a scale limit does not slide the content.** The scale is clamped before the translation
  is solved, so a pinch that hits `maxScale` simply stops growing. Clamping the finished transform
  instead lets the content drift out from under the fingers at the limit.
- **Changing fingers mid-gesture does not jump.** Adding or lifting a finger re-anchors against the
  transform the content already has, rather than continuing to measure against a set that is no
  longer down.

Mouse input is ignored by default. One mouse pointer cannot pinch, and claiming its drags would take
them away from text selection and from the page; pass `pointerTypes` if the host has no other use
for them.

## Options

All optional.

| Option                           | Default                            |                                                                                                                                                          |
| -------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `content`                        | first element child, else the host | Selector or `(host) => Element` for the element that receives the transform                                                                              |
| `minScale` / `maxScale`          | `0` / `Infinity`                   | Scale bounds                                                                                                                                             |
| `initial`                        | identity                           | Where the view starts, and where `reset()` returns to                                                                                                    |
| `apply`                          | `true`                             | Write `style.transform` on the content. Turn off to paint it yourself from `onChange`                                                                    |
| `touchAction`                    | `true`                             | What to set `touch-action` to on the host; `true` means `none`. A CSS value (`'pan-x pan-y'`) keeps a scroll container's scrolling; `false` sets nothing |
| `pointerTypes`                   | `['touch', 'pen']`                 | Pointer types that take part                                                                                                                             |
| `onStart` / `onChange` / `onEnd` | —                                  | `(transform) => void`                                                                                                                                    |
| `controls`                       | —                                  | `(controls, signal) => void`, called once the host is inserted                                                                                           |

`controls` is how the rest of the component drives the view — a reset button, a zoom control, a
"fit" action:

```tsx ignore
let view: PinchPanControls | null = null
<div mix={[pinchPan({ maxScale: 8, controls: (api) => (view = api) })]}>
  <img src='/map.png' alt='' />
</div>
<button mix={[on('click', () => view?.reset())]}>Reset</button>
```

`signal` is aborted when the host leaves the document, so anything you hang off `controls` can be
torn down with it.

## Painting the view yourself

A CSS transform is not the only way to show a zoom. Set `apply: false` and the mixin stops writing
`style.transform`, but keeps everything else it does — pointer capture, re-anchoring when a finger
joins or leaves, converting client coordinates into the content's space — and hands you each
transform through `onChange`:

```ts ignore
pinchPan({ maxScale: 8, apply: false, onChange: (next) => redraw(next) })
```

That is the rung to take when the view is a canvas, a WebGL scene, or a board whose own width and
height carry the zoom. Only drop to the arithmetic below it when you own the pointer handling too.

## Using it with a scroll container

A board that resizes itself rather than transforming usually pans by **native scrolling** — which is
also what the mouse wheel and a trackpad are doing. `touch-action: none` would take one-finger
scrolling away from it, so pass the value that keeps it instead:

```ts ignore
pinchPan({
  maxScale: 8,
  apply: false,
  touchAction: 'pan-x pan-y',
  onChange: (next) => resize(next),
})
```

`pan-x pan-y` lets the browser pan but excludes its own pinch-zoom, so the two-finger gesture arrives
here uninterrupted. Verified in Chromium against a `overflow: auto` container with an oversized SVG:

|                     | one finger                     | wheel   | two fingers                               |
| ------------------- | ------------------------------ | ------- | ----------------------------------------- |
| native scrolling    | scrolls                        | scrolls | —                                         |
| what the mixin sees | `pointercancel`, no `onChange` | nothing | `onStart`, `onChange`, `onEnd`, no cancel |

Leaving `touch-action` alone (`touchAction: false`) mostly works too, but the browser may claim the
two-finger gesture part-way and cancel the pointers mid-pinch; `pan-x pan-y` is the setting that
stops it trying.

## Taking only the arithmetic

The gesture arithmetic is exported separately from the DOM wiring, so a component that already owns
its own event handling can take the part that decides where the content lands and none of the rest:

```ts ignore
import { advanceGesture, anchorGesture } from '@remix-kbn/ui-pinch-pan'

let anchor = anchorGesture(pointers, transform)
// ... on each move, with the fingers in the content's coordinate space:
transform = advanceGesture(anchor, pointers, { minScale: 1, maxScale: 8 })
```

Points are in the content's own coordinate space: its untransformed box, origin at the top-left. The
mixin converts from client coordinates by measuring that corner once per gesture; doing it yourself
means measuring it yourself, and re-anchoring yourself when the set of fingers changes.

## Testing a touch gesture

The gesture is pointer arithmetic, and the arithmetic is tested here without a DOM. What a unit test
cannot tell you is whether the browser ever delivers the events — that depends on `touch-action`, on
pointer capture, and on the host actually being the element under the fingers. Exercise it on a real
touch device, or synthesize touches through CDP (`Input.dispatchTouchEvent`); DevTools' device
emulation gives you one finger, which is not a pinch.

## License

MIT
