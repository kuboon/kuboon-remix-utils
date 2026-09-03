import { describe, it } from '@std/testing/bdd'
import { expect } from '@std/expect'
import { parseScenario, TourScenarioError, tourSchema } from './schema.ts'

describe('tourSchema', () => {
  it('is published with the $id an editor resolves', () => {
    expect(tourSchema.$id).toBe('https://jsr.io/@kuboon/remix-onboarding-kit/schema.json')
  })
})

describe('parseScenario', () => {
  it('accepts a minimal scenario', () => {
    let scenario = parseScenario({ name: 'tour', steps: [{ body: 'hi' }] })
    expect(scenario.name).toBe('tour')
    expect(scenario.steps).toHaveLength(1)
  })

  it('keeps every optional field it recognizes', () => {
    let scenario = parseScenario({
      name: 'tour',
      version: 3,
      autoStart: false,
      keyboard: false,
      labels: { next: '次へ', progress: '{index}/{total}' },
      defaults: { placement: 'right', whenMissing: 'wait' },
      steps: [
        { id: 'a', target: '[data-tour=a]', title: 'A', body: 'a', placement: 'left-start' },
        { target: { x: 10, y: 20, width: 30, height: 40 }, body: 'b', spotlight: false },
      ],
    })

    expect(scenario.version).toBe(3)
    expect(scenario.keyboard).toBe(false)
    expect(scenario.labels?.next).toBe('次へ')
    expect(scenario.defaults?.whenMissing).toBe('wait')
    expect(scenario.steps[0].placement).toBe('left-start')
    expect(scenario.steps[1].target).toEqual({ x: 10, y: 20, width: 30, height: 40 })
  })

  it('names the offending field', () => {
    let error: unknown
    try {
      parseScenario({ name: 'tour', steps: [{ body: 'ok' }, { body: 'x', placement: 'sideways' }] })
    } catch (thrown) {
      error = thrown
    }

    expect(error).toBeInstanceOf(TourScenarioError)
    expect((error as TourScenarioError).path).toBe('steps[1].placement')
  })

  it('rejects a scenario with no name or no steps', () => {
    expect(() => parseScenario({ steps: [{ body: 'x' }] })).toThrow(TourScenarioError)
    expect(() => parseScenario({ name: 'tour', steps: [] })).toThrow(TourScenarioError)
  })

  it('rejects a step with nothing to say', () => {
    expect(() => parseScenario({ name: 'tour', steps: [{ target: '#a' }] })).toThrow(
      TourScenarioError,
    )
  })

  it('rejects a point target with no coordinates', () => {
    expect(() => parseScenario({ name: 't', steps: [{ body: 'x', target: { x: 1 } }] })).toThrow(
      /target\.y/,
    )
  })
})
