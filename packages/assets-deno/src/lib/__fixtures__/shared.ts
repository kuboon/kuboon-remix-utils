/** Stands in for a real cross-entry singleton such as a sign-in store. */
export class Counter {
  count = 0
  bump(): number {
    return ++this.count
  }
}

export const counter: Counter = new Counter()
