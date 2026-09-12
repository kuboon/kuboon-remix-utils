# @kuboon/remix-ui-pinch-pan

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
