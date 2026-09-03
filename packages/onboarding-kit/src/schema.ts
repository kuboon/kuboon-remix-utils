/**
 * The JSON Schema for a tour, and a validator that turns unknown JSON into a typed scenario.
 *
 * The schema is the published artifact: point a scenario's `$schema` at it and an editor will
 * autocomplete step fields and enum values, which is most of why the scenario is JSON at all.
 *
 * @example Point an editor at the schema
 * ```json
 * {
 *   "$schema": "https://jsr.io/@kuboon/remix-onboarding-kit/schema.json",
 *   "name": "main-tour",
 *   "steps": [{ "target": "[data-tour=nav]", "body": "Move between pages here." }]
 * }
 * ```
 */

import schema from '../schema.json' with { type: 'json' }
import type {
  TourLabels,
  TourPlacement,
  TourPoint,
  TourScenario,
  TourStep,
  TourStepDefaults,
  TourWhenMissing,
} from './lib/types.ts'

/** The JSON Schema (2020-12) describing a {@link TourScenario}. */
export const tourSchema: Record<string, unknown> = schema

/** Thrown when a scenario does not match the schema. `path` points at the offending field. */
export class TourScenarioError extends Error {
  readonly path: string

  constructor(path: string, message: string) {
    super(path === '' ? message : `${path}: ${message}`)
    this.name = 'TourScenarioError'
    this.path = path
  }
}

const PLACEMENTS: readonly TourPlacement[] = [
  'top',
  'top-start',
  'top-end',
  'bottom',
  'bottom-start',
  'bottom-end',
  'left',
  'left-start',
  'left-end',
  'right',
  'right-start',
  'right-end',
]

const WHEN_MISSING: readonly TourWhenMissing[] = ['skip', 'wait', 'center', 'fail']

/**
 * Checks unknown JSON against the schema and returns it as a {@link TourScenario}.
 *
 * Hand-written rather than schema-driven so the package keeps its zero dependencies and so the
 * errors name the exact step and field — `steps[2].placement`, not a JSON Pointer.
 *
 * @param value Parsed JSON, from a fetch, a `<script type="application/json">`, or a prop
 * @returns The same value, typed
 * @throws {TourScenarioError} When a field is missing or has the wrong shape
 */
export function parseScenario(value: unknown): TourScenario {
  let root = expectObject(value, '')

  let name = root.name
  if (typeof name !== 'string' || name === '') {
    throw new TourScenarioError('name', 'expected a non-empty string')
  }

  let steps = root.steps
  if (!Array.isArray(steps) || steps.length === 0) {
    throw new TourScenarioError('steps', 'expected a non-empty array')
  }

  let scenario: TourScenario = {
    name,
    steps: steps.map((step, index) => parseStep(step, `steps[${index}]`)),
  }

  if (root.version !== undefined) {
    if (!Number.isInteger(root.version) || (root.version as number) < 1) {
      throw new TourScenarioError('version', 'expected an integer >= 1')
    }
    scenario.version = root.version as number
  }
  if (root.autoStart !== undefined) scenario.autoStart = expectBoolean(root.autoStart, 'autoStart')
  if (root.keyboard !== undefined) scenario.keyboard = expectBoolean(root.keyboard, 'keyboard')
  if (root.labels !== undefined) scenario.labels = parseLabels(root.labels)
  if (root.defaults !== undefined) {
    scenario.defaults = parseStepDefaults(expectObject(root.defaults, 'defaults'), 'defaults')
  }

  return scenario
}

function parseLabels(value: unknown): TourLabels {
  let raw = expectObject(value, 'labels')
  let labels: TourLabels = {}
  for (let key of ['next', 'back', 'skip', 'done', 'progress'] as const) {
    if (raw[key] !== undefined) labels[key] = expectString(raw[key], `labels.${key}`)
  }
  return labels
}

function parseStepDefaults(raw: Record<string, unknown>, path: string): TourStepDefaults {
  let out: TourStepDefaults = {}
  if (raw.placement !== undefined) {
    out.placement = expectEnum(raw.placement, PLACEMENTS, `${path}.placement`)
  }
  if (raw.offset !== undefined) out.offset = expectNumber(raw.offset, `${path}.offset`)
  if (raw.spotlight !== undefined) out.spotlight = expectBoolean(raw.spotlight, `${path}.spotlight`)
  if (raw.spotlightPadding !== undefined) {
    out.spotlightPadding = expectNumber(raw.spotlightPadding, `${path}.spotlightPadding`)
  }
  if (raw.scrollIntoView !== undefined) {
    out.scrollIntoView = expectBoolean(raw.scrollIntoView, `${path}.scrollIntoView`)
  }
  if (raw.whenMissing !== undefined) {
    out.whenMissing = expectEnum(raw.whenMissing, WHEN_MISSING, `${path}.whenMissing`)
  }
  return out
}

function parseStep(value: unknown, path: string): TourStep {
  let raw = expectObject(value, path)
  let step: TourStep = parseStepDefaults(raw, path)

  if (raw.id !== undefined) step.id = expectString(raw.id, `${path}.id`)
  if (raw.title !== undefined) step.title = expectString(raw.title, `${path}.title`)
  if (raw.body !== undefined) step.body = expectString(raw.body, `${path}.body`)
  if (raw.target !== undefined) step.target = parseTarget(raw.target, `${path}.target`)

  if (step.title === undefined && step.body === undefined) {
    throw new TourScenarioError(path, 'expected at least one of "title" or "body"')
  }

  return step
}

function parseTarget(value: unknown, path: string): string | TourPoint {
  if (typeof value === 'string') {
    if (value === '') throw new TourScenarioError(path, 'expected a non-empty selector')
    return value
  }

  let raw = expectObject(value, path)
  let point: TourPoint = {
    x: expectNumber(raw.x, `${path}.x`),
    y: expectNumber(raw.y, `${path}.y`),
  }
  if (raw.width !== undefined) point.width = expectNumber(raw.width, `${path}.width`)
  if (raw.height !== undefined) point.height = expectNumber(raw.height, `${path}.height`)
  return point
}

function expectObject(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TourScenarioError(path, 'expected an object')
  }
  return value as Record<string, unknown>
}

function expectString(value: unknown, path: string): string {
  if (typeof value !== 'string') throw new TourScenarioError(path, 'expected a string')
  return value
}

function expectNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TourScenarioError(path, 'expected a number')
  }
  return value
}

function expectBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw new TourScenarioError(path, 'expected a boolean')
  return value
}

function expectEnum<value extends string>(
  raw: unknown,
  allowed: readonly value[],
  path: string,
): value {
  if (typeof raw !== 'string' || !allowed.includes(raw as value)) {
    throw new TourScenarioError(path, `expected one of ${allowed.join(', ')}`)
  }
  return raw as value
}
