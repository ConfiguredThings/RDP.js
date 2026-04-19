/**
 * JSON value types as a typed discriminated union.
 *
 * {@link JSONAST} is a typed representation of JSON values — the same information
 * as a raw `JSON.parse` result, but with explicit `kind` tags instead of `any`.
 * Use {@link toJSONAST} / {@link fromJSONAST} to convert between raw JSON strings
 * and this representation; use `Transformer<JSONAST, T>` to transform the tree.
 *
 * When translating a DSL to JSON, `JSONAST` is the output format — the last step
 * before serialising to a string. It is not a domain IR; define a domain-specific
 * discriminated union for that and lower into `JSONAST` as a final emission step.
 */

type JSONValue = string | number | boolean | null | JSONValue[] | { [key: string]: JSONValue }

/**
 * A discriminated union representing any JSON value.
 *
 * Mirrors the six JSON value types with explicit `kind` tags so that
 * `Transformer<JSONAST, T>` gives compile-time exhaustiveness checking.
 */
export type JSONAST =
  | { kind: 'string'; value: string }
  | { kind: 'number'; value: number }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'null' }
  | { kind: 'array'; items: JSONAST[] }
  | { kind: 'object'; entries: { key: string; value: JSONAST }[] }

/**
 * Convert a JSON string to a {@link JSONAST} tree.
 *
 * Wraps `JSON.parse`, hiding the `any` return type behind a typed discriminated
 * union. Symmetric with {@link fromJSONAST}.
 *
 * @param text - A valid JSON string.
 * @returns The root {@link JSONAST} node.
 * @throws {SyntaxError} If `text` is not valid JSON.
 */
export function toJSONAST(text: string): JSONAST {
  return toAST(JSON.parse(text) as JSONValue)
}

/**
 * Serialise a {@link JSONAST} tree to a JSON string.
 *
 * Symmetric with {@link toJSONAST}: `fromJSONAST(toJSONAST(text))` round-trips
 * to equivalent JSON.
 *
 * @param ast - The root {@link JSONAST} node to serialise.
 * @returns A JSON string.
 */
export function fromJSONAST(ast: JSONAST): string {
  return JSON.stringify(toValue(ast))
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function toAST(value: JSONValue): JSONAST {
  if (value === null) return { kind: 'null' }
  if (typeof value === 'string') return { kind: 'string', value }
  if (typeof value === 'number') return { kind: 'number', value }
  if (typeof value === 'boolean') return { kind: 'boolean', value }
  if (Array.isArray(value)) return { kind: 'array', items: value.map(toAST) }
  return {
    kind: 'object',
    entries: Object.entries(value).map(([key, v]) => ({ key, value: toAST(v) })),
  }
}

function toValue(ast: JSONAST): JSONValue {
  switch (ast.kind) {
    case 'null':
      return null
    case 'string':
      return ast.value
    case 'number':
      return ast.value
    case 'boolean':
      return ast.value
    case 'array':
      return ast.items.map(toValue)
    case 'object': {
      const obj: { [key: string]: JSONValue } = {}
      for (const { key, value } of ast.entries) obj[key] = toValue(value)
      return obj
    }
  }
}
