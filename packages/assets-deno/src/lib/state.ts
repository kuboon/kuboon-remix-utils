/**
 * What the server holds between requests.
 *
 * Both compile modes — one URL per module, or code-split chunks — reduce to the same three things,
 * so `fetch` never needs to know which mode produced them.
 */

import type { PathRegistry } from './paths.ts'

/** One compiled artifact, ready to send. */
export interface ServedModule {
  /** The body to send. */
  code: string
  /** Strong validator for conditional requests. */
  etag: string
  /** Response `Content-Type`. Defaults to JavaScript when absent. */
  contentType?: string
}

/** Everything a compile produced. */
export interface ServerState {
  /** Key -> public path, and back. */
  registry: PathRegistry
  /** Key -> the artifact served at its public path. */
  modules: Map<string, ServedModule>
  /** Entrypoint, exactly as configured, -> its public URL. */
  entryUrls: Map<string, string>
  /**
   * Absolute file path of each entrypoint -> its public URL.
   *
   * The same entries as {@link ServerState.entryUrls}, keyed by what they resolve to rather than by
   * how they were written — which is what lets a caller ask for one by `import.meta.url`.
   */
  entryFiles: Map<string, string>
  /**
   * Public path -> the public paths it imports directly, in source order.
   *
   * What a browser needs *after* the entry, so it can be told about all of it at once instead of
   * discovering it one round trip at a time.
   */
  imports: Map<string, string[]>
}
