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
export { ScannerlessRDParser } from './scannerless.js'
export { TokenRDParser, type TokenStream } from './tokenparser.js'
export { RDParserException } from './exception.js'
export { type JSONAST, toJSONAST, fromJSONAST } from './json-ast.js'

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

// ── Transformer ────────────────────────────────────────────────────────────────

/**
 * An exhaustive transformer map over a discriminated union.
 *
 * Like {@link Visitor} but with **required** keys — every `kind` in `Union` must
 * have a handler. TypeScript will report a compile error on the object literal if
 * any kind is missing, giving a compile-time exhaustiveness guarantee. Adding a
 * new grammar rule will produce a type error in every transformer that has not
 * been updated.
 *
 * @example
 * ```ts
 * import { transform, type Transformer } from '@configuredthings/rdp.js'
 * import type { ParseTree } from './MyParser.js'
 *
 * const toString: Transformer<ParseTree, string> = {
 *   Number: (n) => String(n.value),
 *   BinaryExpr: (n) => `${transform(n.left, toString)} ${n.op} ${transform(n.right, toString)}`,
 * }
 * ```
 */
export type Transformer<Union extends { kind: string }, T> = {
  [K in Union['kind']]: (node: Extract<Union, { kind: K }>) => T
}

/**
 * Dispatch `node` to the matching handler in `transformer`.
 *
 * Unlike {@link visit}, this function always returns a `T` — there is no
 * `undefined` case because {@link Transformer} requires a handler for every kind.
 *
 * @example
 * ```ts
 * const result = transform(node, {
 *   Number: (n) => n.value,
 *   BinaryExpr: (n) => transform(n.left, eval) + transform(n.right, eval),
 * })
 * ```
 */
export function transform<Union extends { kind: string }, T>(
  node: Union,
  transformer: Transformer<Union, T>,
): T {
  // Same unavoidable cast as visit(): the mapped type cannot correlate kind → handler type.
  const fn = transformer[node.kind as Union['kind']] as (n: Union) => T
  return fn(node)
}
