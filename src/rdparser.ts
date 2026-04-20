/** @module RDParser */

/**
 * @packageDocumentation
 *
 * `\@configuredthings/rdp.js` — a minimal typed base class for writing recursive
 * descent parsers in TypeScript.
 *
 * Abstract base class for recursive descent parsers.
 *
 * Provides position tracking, backtracking, and error-reporting infrastructure
 * shared by all parser variants. Extend {@link ScannerlessRDParser} for
 * character-by-character parsing, or {@link TokenRDParser} for token-stream
 * parsing.
 *
 * ## Recommended construction pattern
 *
 * Parser instances are ephemeral — created, used once, then discarded. Subclasses
 * should keep their constructor `private` and expose a `static parse()` method as
 * the sole public entry point. This makes the one-shot lifecycle explicit and
 * prevents callers from retaining stale parser state.
 *
 * ```ts
 * export class MyParser extends ScannerlessRDParser {
 *   private constructor(source: DataView) { super(source) }
 *
 *   static parse(input: string): MyResult {
 *     const bytes = new TextEncoder().encode(input)
 *     return new MyParser(new DataView(bytes.buffer)).parse()
 *   }
 *
 *   parse(): MyResult {
 *     // production rules here
 *   }
 * }
 *
 * // Callers use the static method only — the instance never escapes:
 * const result = MyParser.parse('...')
 * ```
 */

import { RDParserException } from './exception.js'
export { RDParserException } from './exception.js'

/** Base type for parser options. Extend this for format-specific option types. */
export type ParseOptions = Record<string, unknown>

export abstract class RDParser {
  #position = 0

  /**
   * Tracks the furthest position at which a terminal match was attempted and
   * failed. When the overall parse fails, this position indicates where the
   * parser made the most progress — a much more useful error location than the
   * top-level position (which is reset to 0 on the first rule failure).
   */
  #furthestFailPosition = 0

  /**
   * Returns `true` when the parser has reached the end of input.
   * Implemented by subclasses based on their input representation.
   */
  protected abstract atEnd(): boolean

  /**
   * Returns a human-readable description of the input element at `pos` for
   * use in error messages. In scannerless parsers this describes a byte; in
   * token parsers it describes a token.
   *
   * @param pos - The position index to describe.
   */
  protected abstract describePosition(pos: number): string

  /**
   * Returns the current position within the input.
   */
  protected getPosition(): number {
    return this.#position
  }

  /**
   * Restores the current position to a previously saved value.
   *
   * Used with {@link getPosition} to implement backtracking in parser alternatives.
   *
   * @param pos - The position to restore to.
   */
  protected restorePosition(pos: number): void {
    this.#position = pos
  }

  /**
   * Returns the furthest position at which a terminal match was attempted and
   * failed. Useful for producing informative error messages when the overall
   * parse fails.
   */
  protected getFurthestFailPosition(): number {
    return this.#furthestFailPosition
  }

  /**
   * Records the current position as a fail point if it is further than any
   * previously recorded fail. Subclasses call this when a terminal match fails.
   */
  protected updateFurthestFail(): void {
    if (this.#position > this.#furthestFailPosition) this.#furthestFailPosition = this.#position
  }

  /**
   * Throws an {@link RDParserException} with the given message and the current
   * position appended. The return type is `never` so call sites can write
   * `return this.error(...)` to satisfy TypeScript's control-flow analysis.
   *
   * @param message - Description of the parse failure.
   * @throws {RDParserException} Always.
   */
  protected error(message: string): never {
    throw new RDParserException(`${message} (at position ${this.#position})`)
  }

  /**
   * Throws a {@link RDParserException} naming the unexpected input element at
   * the furthest position reached during parsing.
   *
   * Call this from the top-level `parse()` method when the first rule returns
   * `null`, to give callers a precise error location rather than a generic
   * "Failed to parse input (at position 0)" message.
   *
   * @throws {RDParserException} Always.
   */
  protected errorAtFurthest(): never {
    const pos = this.#furthestFailPosition
    throw new RDParserException(
      `Failed to parse: unexpected ${this.describePosition(pos)} at position ${pos}`,
    )
  }
}
