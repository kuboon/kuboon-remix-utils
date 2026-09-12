# @kuboon/remix-ui-pinch-pan

Two-finger pinch and pan as a [`@remix-run/ui`](https://www.npmjs.com/package/@remix-run/ui) mixin.

```sh
deno add jsr:@kuboon/remix-ui-pinch-pan
```

```tsx ignore
import { pinchPan } from '@kuboon/remix-ui-pinch-pan'
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

| Option                           | Default                            |                                                                                                              |
| -------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `content`                        | first element child, else the host | Selector or `(host) => Element` for the element that receives the transform                                  |
| `minScale` / `maxScale`          | `0` / `Infinity`                   | Scale bounds                                                                                                 |
| `initial`                        | identity                           | Where the view starts, and where `reset()` returns to                                                        |
| `apply`                          | `true`                             | Write `style.transform` on the content. Turn off to paint it yourself from `onChange`                        |
| `touchAction`                    | `true`                             | Set `touch-action: none` on the host. Without it the browser claims the gesture and no `pointermove` arrives |
| `pointerTypes`                   | `['touch', 'pen']`                 | Pointer types that take part                                                                                 |
| `onStart` / `onChange` / `onEnd` | —                                  | `(transform) => void`                                                                                        |
| `controls`                       | —                                  | `(controls, signal) => void`, called once the host is inserted                                               |

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

## Driving the view yourself

The gesture arithmetic is exported separately from the DOM wiring, so a component that already owns
its own painting — a canvas, a WebGL view, a transform it keeps in component state — can take the
part that decides where the content lands and none of the rest:

```ts ignore
import { advanceGesture, anchorGesture } from '@kuboon/remix-ui-pinch-pan'

let anchor = anchorGesture(pointers, transform)
// ... on each move, with the fingers in the content's coordinate space:
transform = advanceGesture(anchor, pointers, { minScale: 1, maxScale: 8 })
```

Points are in the content's own coordinate space: its untransformed box, origin at the top-left. The
mixin converts from client coordinates by measuring that corner once per gesture.

## Testing a touch gesture

The gesture is pointer arithmetic, and the arithmetic is tested here without a DOM. What a unit test
cannot tell you is whether the browser ever delivers the events — that depends on `touch-action`, on
pointer capture, and on the host actually being the element under the fingers. Exercise it on a real
touch device, or synthesize touches through CDP (`Input.dispatchTouchEvent`); DevTools' device
emulation gives you one finger, which is not a pinch.

## License

MIT
