/**
 * CommonJS interop.
 *
 * Browsers only run ES modules, so a CJS file served as-is fails twice over: `module` is not
 * defined, and an importer asking for a default export finds none. `@remix-run/assets` refuses such
 * a module outright (`COMMONJS_NOT_SUPPORTED`). Serving it verbatim is worse — the failure moves
 * from build time to a runtime `ReferenceError` in the browser.
 *
 * So CJS is wrapped into an ES module, the way esbuild and Vite do: give the body the `module`,
 * `exports`, and `require` it expects, run it, and re-export what it produced. Two pieces beyond the
 * bare shim are what make this work on real packages — `require()` calls are hoisted to real
 * imports, and the names the module exports are re-exported individually so `import { x } from …`
 * keeps working.
 */

import { init as initCjsLexer, parse as parseCjs } from 'cjs-module-lexer'

/** Identifiers that cannot be re-exported by name, either as syntax or because we set them. */
const RESERVED_EXPORT_NAMES = new Set(['default', '__esModule'])

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/

/**
 * Reserved words that are valid property names but not valid `const` binding names, so they cannot
 * become `export const <name>`.
 */
const RESERVED_WORDS = new Set([
  'await',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'delete',
  'do',
  'else',
  'enum',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'function',
  'if',
  'implements',
  'import',
  'in',
  'instanceof',
  'interface',
  'let',
  'new',
  'null',
  'package',
  'private',
  'protected',
  'public',
  'return',
  'static',
  'super',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'typeof',
  'var',
  'void',
  'while',
  'with',
  'yield',
])

let lexerReady: Promise<void> | undefined

/** Initializes the CJS lexer once, sharing the initialization. */
export function initCommonJsLexer(): Promise<void> {
  return (lexerReady ??= initCjsLexer())
}

/**
 * Detects whether a module is CommonJS.
 *
 * `@deno/loader` reports both CJS and ESM JavaScript as `MediaType.JavaScript`, so the distinction
 * has to come from the source. A module counts as CJS when it touches the CJS free variables and
 * has no ESM syntax of its own — the absence of `import`/`export` matters, because a file with both
 * is already an ES module that merely mentions `module` somewhere.
 *
 * @param code The module source
 * @param hasEsmSyntax Whether an ES module lexer found any `import`/`export` in it
 * @returns `true` when the module should be wrapped
 */
export function isCommonJs(code: string, hasEsmSyntax: boolean): boolean {
  if (hasEsmSyntax) return false

  return /(?:^|[^.\w$])(?:module\s*\.\s*exports|exports\s*\.|exports\s*\[|require\s*\()/.test(code)
}

/**
 * Lists the specifiers a CJS module `require()`s with a string literal.
 *
 * A `require(someVariable)` cannot be resolved ahead of time and is left for the runtime shim to
 * reject, which is the same trade every static bundler makes.
 *
 * @param code The module source
 * @returns The literal specifiers, deduplicated
 */
export function collectRequires(code: string): string[] {
  let specifiers = new Set<string>()

  for (let match of code.matchAll(/(?:^|[^.\w$])require\s*\(\s*(['"])((?:\\.|(?!\1).)*)\1\s*\)/g)) {
    specifiers.add(match[2])
  }

  return [...specifiers]
}

/**
 * Lists the names a CJS module assigns to its exports.
 *
 * Without these, `export default module.exports` is the only export, and `import { x } from …`
 * fails at link time even though `x` exists on the object.
 *
 * @param code The module source
 * @returns Re-exportable names, or an empty array when the source could not be analyzed
 */
export function detectNamedExports(code: string): string[] {
  let result
  try {
    result = parseCjs(code)
  } catch {
    return []
  }

  return result.exports.filter(
    (name: string) =>
      !RESERVED_EXPORT_NAMES.has(name) && !RESERVED_WORDS.has(name) && IDENTIFIER.test(name),
  )
}

/** Inputs for {@link wrapCommonJs}. */
export interface WrapCommonJsOptions {
  /** The `require()` specifier as written -> the public URL to import it from. */
  imports: ReadonlyMap<string, string>
  /** Names to re-export individually, from {@link detectNamedExports}. */
  namedExports: readonly string[]
  /** Value for the module's `__filename`. */
  filename?: string
  /** Value for the module's `__dirname`. */
  dirname?: string
}

/**
 * Wraps a CommonJS module as an ES module.
 *
 * The body runs inside a function called with `module.exports` as `this`, which is what Node does
 * and what top-level `this` in a CJS file expects — a plain top-level wrapper would leave `this`
 * `undefined` under ESM's strict mode.
 *
 * @param code The CJS source
 * @param options Resolved requires and detected exports
 * @returns An ES module
 */
export function wrapCommonJs(code: string, options: WrapCommonJsOptions): string {
  let lines: string[] = []
  let bindings: string[] = []

  let index = 0
  for (let [specifier, url] of options.imports) {
    let binding = `__cjs_dep_${index++}`
    bindings.push(`  ${JSON.stringify(specifier)}: ${binding},`)
    lines.push(`import ${binding} from ${JSON.stringify(url)};`)
  }

  lines.push(`const __cjs_deps = {`, ...bindings, `};`)
  lines.push(
    `function __cjs_require(id) {`,
    `  if (Object.prototype.hasOwnProperty.call(__cjs_deps, id)) {`,
    `    const dep = __cjs_deps[id];`,
    // An ESM dependency reached through require() exposes its CJS shape on `default`.
    `    return dep && dep.__esModule ? dep : (dep && "default" in dep ? dep.default : dep);`,
    `  }`,
    `  throw new Error("Cannot require " + id + " from a browser-served CommonJS module.");`,
    `}`,
    `__cjs_require.resolve = (id) => id;`,
  )

  lines.push(`const __cjs_module = { exports: {} };`)
  lines.push(
    `(function (exports, require, module, __filename, __dirname) {`,
    code,
    `}).call(`,
    `  __cjs_module.exports,`,
    `  __cjs_module.exports,`,
    `  __cjs_require,`,
    `  __cjs_module,`,
    `  ${JSON.stringify(options.filename ?? '')},`,
    `  ${JSON.stringify(options.dirname ?? '')},`,
    `);`,
  )

  lines.push(`const __cjs_exports = __cjs_module.exports;`)
  lines.push(`export default __cjs_exports;`)

  for (let name of options.namedExports) {
    lines.push(`export const ${name} = __cjs_exports.${name};`)
  }

  return lines.join('\n')
}
