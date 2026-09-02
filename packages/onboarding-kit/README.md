# remix-onboarding-kit

A product tour for [Remix UI](https://github.com/remix-run/remix/tree/main/packages/ui): a dimmed
page, a spotlight on one thing at a time, and a tooltip anchored to it. The tour itself is **JSON**,
not markup.

It is the [`reactjs-onboarding`](https://www.npmjs.com/package/reactjs-onboarding) idea rebuilt on
`@remix-run/ui`, with the scenario lifted out of the component tree.

## Why JSON

`reactjs-onboarding` and its relatives describe a tour as JSX children, which ties every step to the
component that renders it. Describing it as data instead buys four things:

- a scenario is exactly the shape of Remix UI's `SerializableValue`, so **the whole tour passes to a
  `clientEntry()` as a prop** — no extra plumbing between server and hydration
- a step can point at anything on the page, not just at what its parent component rendered
- tours can be stored, versioned, fetched, and edited by people who do not touch the app
- with `$schema` set, an editor autocompletes step fields and enum values

The cost is that a selector can miss. That is handled explicitly rather than swept up — see
`whenMissing` below.

## Installation

This package is published to [JSR](https://jsr.io/@kuboon/remix-onboarding-kit):

```sh
deno add jsr:@kuboon/remix-onboarding-kit
npx jsr add @kuboon/remix-onboarding-kit
```

## Usage

```ts
import { startTour } from '@kuboon/remix-onboarding-kit/ui'
import { parseScenario } from '@kuboon/remix-onboarding-kit/schema'

let response = await fetch('/tours/main.json')
startTour(parseScenario(await response.json()))
```

`startTour` creates the tour, mounts its overlay at the end of `<body>`, and starts it — unless the
visitor has already finished this tour at this version, in which case it does nothing.

### From a server-rendered page

`clientEntry()`'s first argument is the URL your app serves the module from, which a library cannot
know, so the entry is built by a factory in your own client module:

```tsx
// app/client/tour.ts
import { createTourEntry } from '@kuboon/remix-onboarding-kit/ui'

export const Tour = createTourEntry('/tour.js#Tour')
```

```tsx
// in a route
import scenario from './tours/main.json' with { type: 'json' }

<Tour scenario={scenario} />
```

The component renders an empty placeholder; the overlay is mounted at the end of `<body>` either
way, so it does not matter where you put it.

### Replaying a tour

```ts
import { getTour } from '@kuboon/remix-onboarding-kit/ui'

let tour = getTour('main-tour')
await tour?.reset()
await tour?.start({ force: true })
```

## The scenario

```jsonc
{
  "$schema": "https://jsr.io/@kuboon/remix-onboarding-kit/schema.json",
  "name": "main-tour",
  "version": 1,
  "labels": { "next": "次へ", "back": "戻る", "skip": "スキップ", "done": "完了" },
  "defaults": { "placement": "bottom" },
  "steps": [
    { "id": "welcome", "body": "ようこそ。3 ステップで案内します。" },
    {
      "id": "nav",
      "target": "[data-tour=nav]",
      "title": "ナビ",
      "body": "ここから移動します。",
      "placement": "bottom-start"
    },
    {
      "id": "push",
      "target": "[data-tour=push-card]",
      "body": "通知はここで。",
      "placement": "right",
      "whenMissing": "wait"
    },
    {
      "id": "hero",
      "target": { "x": 24, "y": 120, "width": 320, "height": 180 },
      "body": "この領域が本文です。",
      "spotlight": false
    }
  ]
}
```

### Scenario fields

| Field      | Type         | Default | Notes                                                            |
| ---------- | ------------ | ------- | ---------------------------------------------------------------- |
| `name`     | `string`     | —       | Required. Identifies the tour where completion is stored         |
| `version`  | `integer`    | `1`     | Bump to show an edited tour again to people who finished the old |
| `keyboard` | `boolean`    | `true`  | `→`/`Enter` next, `←` back, `Esc` skip                           |
| `labels`   | object       | English | `next`, `back`, `skip`, `done`, `progress`                       |
| `defaults` | step options | —       | Applied to every step that does not override them                |
| `steps`    | array        | —       | Required, non-empty                                              |

### Step fields

| Field              | Type                  | Default  | Notes                                        |
| ------------------ | --------------------- | -------- | -------------------------------------------- |
| `id`               | `string`              | —        | For `goto()` and analytics                   |
| `target`           | selector or `{x,y,…}` | —        | Omit for a centered card with no subject     |
| `title`, `body`    | `string`              | —        | At least one is required                     |
| `placement`        | 12 anchor placements  | `bottom` | A preference; see below                      |
| `offset`           | `number`              | `12`     | Gap between target and tooltip, in pixels    |
| `spotlight`        | `boolean`             | `true`   | Cut the target out of the dim                |
| `spotlightPadding` | `number`              | `6`      | Breathing room around the cut-out            |
| `scrollIntoView`   | `boolean`             | `true`   | Scroll an off-screen target into view        |
| `whenMissing`      | see below             | `skip`   | What to do when the selector matches nothing |

`target` is a **CSS selector** — strictly more expressive than the element id `reactjs-onboarding`
takes, and writable by someone who cannot edit the component. Prefer a `[data-tour="…"]` attribute
you control over an `id`, which is a page-unique resource that may not be yours to spend. A
`{x, y, width, height}` object points at a fixed rectangle in **viewport** coordinates instead.

### `whenMissing`

A selector written in JSON is decoupled from the component tree — the point of the exercise — but
that also means a step can name something that is not on this page, is inside a collapsed section,
or has not hydrated yet. Every step therefore states what should happen:

| Value    | Behavior                                                                        |
| -------- | ------------------------------------------------------------------------------- |
| `skip`   | Move past the step in the direction of travel (default)                         |
| `wait`   | Poll until it appears or `waitTimeoutMs` (5s) elapses, then fall back to `skip` |
| `center` | Show the tooltip centered, with no spotlight                                    |
| `fail`   | Stop the tour and reject                                                        |

`wait` surfaces as a real `waiting` status on the tour, so an overlay can say it is looking for
something rather than appear frozen.

## What this package does not implement

Positioning. `@remix-run/ui/anchor` already does element **and** coordinate anchoring, viewport
clamping, `max-width`/`max-height` fitting, `data-anchor-placement` for arrow styling, and live rect
tracking with a proper teardown. The kit calls it and gets out of the way.

One honest caveat: `anchor()` flips to the **opposite** placement when a tooltip would overflow — it
does not cascade bottom → top → right → left the way `reactjs-onboarding` does. So `placement` is a
preference that is either honored or mirrored; set it explicitly on steps that must sit beside their
target rather than above or below it.

The spotlight is the one thing `anchor()` cannot do, because it has to _cover_ the target rather
than sit next to it, so the kit tracks that rect itself.

## Headless use

The default entry renders nothing. It is the state machine — step order, target resolution, keyboard
control, completion — so you can build your own overlay on it:

```ts
import { createTour, isTourVisible } from '@kuboon/remix-onboarding-kit'

let tour = createTour(scenario)
tour.addEventListener('change', () => {
  let { status, step, target, index, total } = tour.state
  if (isTourVisible(status)) draw(step, target, index, total)
})
await tour.start()
```

## Persistence

Completion is remembered in `localStorage`, keyed by the tour's `name`, storing the `version` it was
finished at. Every access is guarded — `localStorage` throws outright in some privacy modes, and a
tour that cannot record itself should still run.

The store is an interface, so a per-user server-side store can replace it without touching anything
else:

```ts
createTour(scenario, {
  store: {
    completed: (name) => fetch(`/api/tours/${name}`).then((r) => r.json()),
    complete: (name, version) => fetch(`/api/tours/${name}`, { method: 'PUT', body: `${version}` }),
    clear: (name) => fetch(`/api/tours/${name}`, { method: 'DELETE' }),
  },
})
```

## Styling

The overlay ships its own styles through Remix UI's `css` mixin, so there is no stylesheet to import
and no design system to adopt. It respects `prefers-color-scheme`. For a different look, render
`TourOverlay`'s job yourself against the headless API above.

## Scope

Single-page tours only. Steps that advance when the visitor clicks the target, and tours that
navigate between frames mid-run, are deliberately not implemented.

## License

MIT
