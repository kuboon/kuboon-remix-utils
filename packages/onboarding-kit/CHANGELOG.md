# @kuboon/remix-onboarding-kit

## 0.1.0

Initial release.

- `createTour()` — a headless tour state machine: step order, target resolution, keyboard control
  (`→`/`Enter`, `←`, `Esc`) and completion, with no rendering
- `startTour()` / `mountTour()` — a spotlight overlay built on `@remix-run/ui/anchor`, mounted at the
  end of `<body>` and styled through the `css` mixin, so there is no stylesheet to import
- `createTourEntry()` — a factory for a hydratable `clientEntry` that takes a scenario as a prop
- Scenarios are JSON, with a published JSON Schema and a dependency-free `parseScenario()` validator
  whose errors name the exact field
- Completion is remembered per tour name and scenario version in `localStorage`, behind a `TourStore`
  interface a server-side store can replace
