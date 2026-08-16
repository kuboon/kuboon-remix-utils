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
}
