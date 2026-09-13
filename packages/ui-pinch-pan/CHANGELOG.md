# @remix-kbn/ui-pinch-pan

## 0.2.0

- Moved to the `@remix-kbn` scope: this package is **`@remix-kbn/ui-pinch-pan`** from 0.2.0 on, and was `@kuboon/remix-ui-pinch-pan` up to 0.1.0. The `remix-` prefix goes with the move, since the scope already says it.

  ```diff
  - "@kuboon/remix-ui-pinch-pan": "jsr:@kuboon/remix-ui-pinch-pan@^0.1.0"
  + "@remix-kbn/ui-pinch-pan": "jsr:@remix-kbn/ui-pinch-pan@^0.2.0"
  ```

  No code changed with the rename. The minor bump is so that no version number exists under both names — 0.2.0 is only ever the new one — rather than because anything behaves differently.

  JSR cannot unpublish, so everything under the old name stays where it is; entries below 0.1.0 describe releases made there.
  0.1.1 and the 0.2.0 work below were never published under the old name; 0.1.0 is where `@kuboon/remix-ui-pinch-pan` stops.

## 0.2.0

- `touchAction` takes a CSS value, not just a boolean. The first real use of this package was a board that shows its zoom by resizing an SVG and pans by the scroll container's own scrolling — which is what the mouse wheel and a trackpad are doing. `touch-action: none` takes one-finger scrolling away from a design like that, so there is now a way to keep it:

  ```ts
  pinchPan({ apply: false, touchAction: 'pan-x pan-y', onChange: (next) => resize(next) })
  ```

  `pan-x pan-y` lets the browser pan but excludes its own pinch-zoom, so the two-finger gesture arrives uninterrupted. Verified in Chromium against an `overflow: auto` container with an oversized SVG: one finger and the wheel scroll natively (the mixin sees a `pointercancel` and no `onChange`), and the pinch runs `onStart` → `onChange` → `onEnd` with no cancel and no scroll movement. Leaving `touch-action` alone works mostly, but the browser can claim the two-finger gesture part-way and cancel the pointers mid-pinch.

- The docs took that use case seriously. `apply: false` — keep the mixin's pointer handling, paint the view yourself — was one line in the options table, so the same report reached for `anchorGesture` / `advanceGesture` and rebuilt the pointer bookkeeping that was already here. "Painting the view yourself", "Using it with a scroll container" and "Taking only the arithmetic" are now three separate rungs, in that order, in both the README and the module doc.

## 0.1.1

- The entry point is `src/mod.ts` rather than `src/index.ts`, which is the Deno convention. Nothing changes for a consumer — the package's `exports` maps `.` either way — but JSR shows the file, and the file should read as Deno rather than as npm.
- The `@module` doc is the package's front page on JSR, and it was three sentences. It now carries what the README does: the one rule the gesture follows, where to put the mixin and why the host cannot be the content, the two things it sets for you (`touch-action: none` and `transform-origin: 0 0`), the two mistakes a hand-rolled version makes, and worked examples for placing it, for driving it through `controls`, and for taking the arithmetic alone.
- The arithmetic example is plain TypeScript and runs: `deno task test` is `deno test --doc`, so the snippet is compiled and executed, and a unit test pins the numbers its comments claim. The JSX examples are marked `ignore` — they are fragments meant for reading, and compiling them would only mean inventing a component around them.

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
