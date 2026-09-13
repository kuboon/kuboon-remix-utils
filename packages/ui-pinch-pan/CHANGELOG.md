# @kuboon/remix-ui-pinch-pan

## 0.1.1

- Moving to the `@remix-kbn` scope: this package continues as **`@remix-kbn/ui-pinch-pan`**, with the `remix-` prefix dropped because the scope now says it.

  ```diff
  - "@kuboon/remix-ui-pinch-pan": "jsr:@kuboon/remix-ui-pinch-pan@^0.1.0"
  + "@remix-kbn/ui-pinch-pan": "jsr:@remix-kbn/ui-pinch-pan"
  ```

  0.1.1 is the announcement and nothing more — its code is 0.1.0's, byte for byte. Nothing breaks if you stay: JSR cannot unpublish, so every version under this name keeps resolving exactly as it does today, and there is no deadline attached to moving.

## 0.1.0

Initial release.

- `pinchPan()` — a `@remix-run/ui` mixin for two-finger pinch and pan on touch and pen input. The
  host listens, its content is transformed, and the content point under the fingers' centroid stays
  under their centroid.
- The scale is clamped before the translation is solved, so reaching `minScale` / `maxScale` stops
  the zoom without sliding the content out from under the fingers.
- Adding or lifting a finger re-anchors against the transform the content already has, so the view
  does not jump mid-gesture.
- `controls` hands the rest of the component `set()` / `reset()` and the current transform.
- `anchorGesture()` / `advanceGesture()` are exported on their own for components that paint the
  view themselves.
