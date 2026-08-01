import { counter } from './shared.ts'

export function b(): number {
  return counter.bump()
}
