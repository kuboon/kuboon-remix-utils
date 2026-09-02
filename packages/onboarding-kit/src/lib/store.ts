/**
 * Where "this person has already seen this tour" is remembered.
 */

/**
 * Records which tours are finished.
 *
 * Methods may return synchronously or a promise; the tour awaits either. That is what keeps the
 * door open for a per-user server-side store — a tour that follows someone to a second device is a
 * real requirement, and an interface fixed to `localStorage`'s synchronous shape could not grow
 * into one.
 */
export type TourStore = {
  /** The scenario version the tour was completed at, or null if it never was. */
  completed(name: string): number | null | Promise<number | null>
  complete(name: string, version: number): void | Promise<void>
  clear(name: string): void | Promise<void>
}

/**
 * Remembers completion in `localStorage`, keyed by tour name.
 *
 * Every access is guarded: `localStorage` throws outright in some privacy modes, and a tour that
 * cannot record its own completion should still run.
 *
 * @param prefix Key prefix, so several apps on one origin do not collide
 * @returns A store backed by `localStorage`
 */
export function localStorageTourStore(prefix: string = 'rmx-tour:'): TourStore {
  function read(name: string): number | null {
    try {
      let raw = globalThis.localStorage?.getItem(prefix + name)
      if (raw === null || raw === undefined) return null
      let version = Number.parseInt(raw, 10)
      return Number.isFinite(version) ? version : null
    } catch {
      return null
    }
  }

  return {
    completed: read,
    complete(name, version) {
      try {
        globalThis.localStorage?.setItem(prefix + name, String(version))
      } catch {
        // Storage unavailable — the tour still ran, it just will not be remembered.
      }
    },
    clear(name) {
      try {
        globalThis.localStorage?.removeItem(prefix + name)
      } catch {
        // Nothing to do: there was nothing readable to clear either.
      }
    },
  }
}

/** A store that remembers nothing, for tests and for previewing a tour repeatedly. */
export function memoryTourStore(): TourStore {
  let versions = new Map<string, number>()
  return {
    completed: (name) => versions.get(name) ?? null,
    complete: (name, version) => void versions.set(name, version),
    clear: (name) => void versions.delete(name),
  }
}
