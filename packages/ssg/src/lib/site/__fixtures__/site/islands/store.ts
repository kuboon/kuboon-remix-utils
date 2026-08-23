/**
 * Module state two islands share.
 *
 * The counter writes and the total reads, and they are separate browser entrypoints — so the total
 * only tracks the button because code splitting emitted this module once, into a chunk both import.
 */
type Listener = () => void

class Clicks {
  /** A literal the build test counts: minifiers rename identifiers but keep strings. */
  readonly kind = 'fixture-click-store'
  #total = 0
  #listeners = new Set<Listener>()

  get total(): number {
    return this.#total
  }

  bump(): number {
    this.#total++
    for (let listener of this.#listeners) listener()
    return this.#total
  }

  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }
}

export const clicks: Clicks = new Clicks()
