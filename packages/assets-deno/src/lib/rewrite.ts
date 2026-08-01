/**
 * Import specifier rewriting.
 *
 * Emitted modules still carry the specifiers the author wrote (`'./session.ts'`, `'@kuboon/dpop'`).
 * The browser cannot resolve either, so every one is replaced with the public URL the server
 * assigned. Rewriting — rather than bundling — is what preserves module identity: two entries that
 * both import `./session.ts` end up importing the same URL, so the module is evaluated once.
 */

import { init, parse } from 'es-module-lexer'

/**
 * Resolves an authored specifier to the URL to emit.
 *
 * @param specifier The specifier as authored
 * @returns The replacement URL, or `null` to leave the specifier untouched
 */
export type SpecifierResolver = (specifier: string) => string | null

let ready: Promise<void> | undefined

/** Initializes the lexer's WebAssembly module once, and shares the initialization. */
function initLexer(): Promise<void> {
  return (ready ??= init as unknown as Promise<void>)
}

/**
 * Replaces every statically analyzable import specifier in a module.
 *
 * Covers `import`, `export … from`, and `import()` whose argument is a plain string literal. A
 * dynamic `import(someVariable)` is left as written — there is nothing to resolve at build time —
 * so a module that needs one should import a statically named wrapper instead.
 *
 * @param code The emitted JavaScript
 * @param resolve Maps an authored specifier to its public URL
 * @returns The rewritten JavaScript
 */
export async function rewriteImports(code: string, resolve: SpecifierResolver): Promise<string> {
  await initLexer()

  let imports: ReturnType<typeof parse>[0]
  try {
    ;[imports] = parse(code)
  } catch {
    // Not parseable as an ES module (a JSON module, say). Nothing to rewrite.
    return code
  }

  let out = ''
  let cursor = 0

  for (let record of imports) {
    // `n` is set only when the specifier is statically analyzable; `s`/`e` are -1 for
    // `import.meta`, which has no specifier at all.
    if (record.n === undefined || record.s < 0 || record.e < record.s) continue

    let replacement = resolve(record.n)
    if (replacement === null) continue

    let raw = code.slice(record.s, record.e)
    let quote = raw[0] === '"' || raw[0] === "'" || raw[0] === '`' ? raw[0] : ''

    out += code.slice(cursor, record.s)
    // A static import's range excludes its quotes; a dynamic import's includes them. Echoing back
    // whatever the range started with keeps both forms syntactically valid.
    out += quote === ''
      ? escapeSpecifier(replacement)
      : `${quote}${escapeSpecifier(replacement)}${quote}`
    cursor = record.e
  }

  return cursor === 0 ? code : out + code.slice(cursor)
}

/**
 * Escapes the characters that could terminate the surrounding string literal.
 *
 * Public paths come from {@link candidatePathFor}, which already strips the dangerous ones, so this
 * is belt-and-braces against a caller supplying its own resolver.
 */
function escapeSpecifier(specifier: string): string {
  return specifier.replace(/\\/g, '\\\\').replace(/["'`]/g, (character) => `\\${character}`)
}
