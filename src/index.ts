/**
 * @packageDocumentation
 *
 * `\@configuredthings/rdp.js` — a minimal typed base class for writing recursive
 * descent parsers in TypeScript.
 *
 * This entry point exports the lean runtime only. Observer infrastructure is
 * available separately via the `\@configuredthings/rdp.js/observable` subpath.
 * The code generator is available via `\@configuredthings/rdp.js/generator`.
 */

export { RDParser } from './rdparser.js'
export { RDParserException } from './exception.js'

// ── Tree utilities ─────────────────────────────────────────────────────────────

/**
 * A visitor map over a discriminated union.
 *
 * Each key is a `kind` value present in `Union`; the associated function handles
 * nodes of that exact kind. All handlers are optional — unhandled nodes cause
 * {@link visit} to return `undefined`.
 *
 * Use `Required<Visitor<ParseTree, T>>` when you want TypeScript to enforce that
 * every node kind is handled — a new grammar rule will then produce a compile
 * error rather than silently returning `undefined`.
 *
 * @example
 * ```ts
 * import { visit, type Visitor } from '@configuredthings/rdp.js'
 * import type { ParseTree } from './MyParser.js'
 *
 * const counter: Visitor<ParseTree, number> = {
 *   Identifier: (_n) => 1,
 *   BinaryExpr: (_n) => 0,
 * }
 *
 * const count = visit(node, counter) ?? 0
 * ```
 */
export type Visitor<Union extends { kind: string }, T = void> = {
  [K in Union['kind']]?: (node: Extract<Union, { kind: K }>) => T
}

/**
 * Dispatch `node` to the matching handler in `visitor`.
 *
 * Looks up `node.kind` in the visitor map and calls the handler if one is
 * registered. Returns the handler's result, or `undefined` if no handler is
 * registered for `node.kind`.
 *
 * @example
 * ```ts
 * visit(node, {
 *   Number: (n) => console.log('number:', n.digit.item0),
 *   BinaryExpr: (n) => console.log('op:', n.item1),
 * })
 * ```
 */
export function visit<Union extends { kind: string }, T>(
  node: Union,
  visitor: Visitor<Union, T>,
): T | undefined {
  // Cast is unavoidable: TypeScript cannot correlate the specific `kind` value
  // with the corresponding handler parameter type through the mapped type.
  const fn = visitor[node.kind as Union['kind']] as ((n: Union) => T) | undefined
  return fn?.(node)
}
