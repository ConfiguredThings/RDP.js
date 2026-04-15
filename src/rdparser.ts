/** @module RDParser */

/**
 * @packageDocumentation
 *
 * `\@configuredthings/rdp.js` — a minimal typed base class for writing recursive
 * descent parsers in TypeScript.
 *
 * Base class for recursive descent parsers.
 *
 * Subclass `RDParser` and implement each production rule of your grammar as a
 * `protected` method. Use the protected helper methods (`peek`, `consume`,
 * `matchChar`, `expectChar`, `error`, etc.) to read bytes and signal failures.
 *
 * The parser operates on a `DataView` over an `ArrayBuffer`, treating the input
 * as a sequence of unsigned bytes. All position tracking is handled internally.
 *
 * ## Recommended construction pattern
 *
 * Parser instances are ephemeral — created, used once, then discarded. Subclasses
 * should keep their constructor `private` and expose a `static parse()` method as
 * the sole public entry point. This makes the one-shot lifecycle explicit and
 * prevents callers from retaining stale parser state.
 *
 * ```ts
 * export class MyParser extends RDParser {
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

export class RDParser {
  /** The raw input buffer. Accessible to subclasses so they can decode slices. */
  protected readonly source: DataView

  #position = 0

  /**
   * Tracks the furthest byte offset at which a terminal match was attempted and
   * failed. When the overall parse fails, this position indicates where the
   * parser made the most progress — a much more useful error location than the
   * top-level position (which is reset to 0 on the first rule failure).
   */
  #furthestFailPosition = 0

  /**
   * @param source - The input to parse, wrapped in a `DataView`.
   */
  constructor(source: DataView) {
    this.source = source
  }

  /**
   * Returns the byte at the current position without consuming it,
   * or `null` if the parser has reached the end of input.
   */
  protected peek(): number | null {
    if (this.#position >= this.source.byteLength) return null
    return this.source.getUint8(this.#position)
  }

  /**
   * Moves the current position forward by one byte.
   * Has no effect when already at end of input.
   */
  protected advance(): void {
    if (this.#position < this.source.byteLength) {
      this.#position++
    }
  }

  /**
   * Returns the byte at the current position and advances past it.
   *
   * @throws {RDParserException} If already at end of input.
   */
  protected consume(): number {
    const byte = this.peek()
    if (byte === null) {
      return this.error('Unexpected end of input')
    }
    this.#position++
    return byte
  }

  /**
   * Returns `true` when the current position is at or past the end of input.
   */
  protected atEnd(): boolean {
    return this.#position >= this.source.byteLength
  }

  /**
   * If the current byte equals `expectedByte`, consumes it and returns `true`.
   * Otherwise leaves the position unchanged and returns `false`.
   *
   * @param expectedByte - The byte value to match.
   */
  protected matchChar(expectedByte: number): boolean {
    if (this.peek() === expectedByte) {
      this.#position++
      return true
    }
    if (this.#position > this.#furthestFailPosition) this.#furthestFailPosition = this.#position
    return false
  }

  /**
   * If the current byte equals `expectedByte`, consumes it and returns it as a one-character string.
   * Otherwise leaves the position unchanged and returns `null`.
   *
   * This is the value-returning counterpart of {@link matchChar}, used by generated parsers
   * to capture terminal characters directly into the parse tree.
   *
   * @param expectedByte - The byte value to match.
   */
  protected readChar(expectedByte: number): string | null {
    if (this.peek() === expectedByte) {
      this.#position++
      return String.fromCharCode(expectedByte)
    }
    if (this.#position > this.#furthestFailPosition) this.#furthestFailPosition = this.#position
    return null
  }

  /**
   * If the current byte falls within `[lowerBound, upperBound]` (inclusive), consumes it and returns it
   * as a one-character string. Otherwise leaves the position unchanged and returns `null`.
   *
   * Used by generated parsers to capture character-range terminals into the parse tree.
   *
   * @param lowerBound - Lower bound (inclusive) of the byte range.
   * @param upperBound - Upper bound (inclusive) of the byte range.
   */
  protected readCharRange(lowerBound: number, upperBound: number): string | null {
    const currentByte = this.peek()
    if (currentByte === null || currentByte < lowerBound || currentByte > upperBound) {
      if (this.#position > this.#furthestFailPosition) this.#furthestFailPosition = this.#position
      return null
    }
    this.#position++
    return String.fromCharCode(currentByte)
  }

  /**
   * Asserts that the current byte equals `expectedByte` and consumes it.
   *
   * @param expectedByte - The byte value expected.
   * @param expectedCharDescription - Optional human-readable name for the expected character, used in the error message.
   * @throws {RDParserException} If the current byte does not match `expectedByte`.
   */
  protected expectChar(expectedByte: number, expectedCharDescription?: string): void {
    if (!this.matchChar(expectedByte)) {
      const foundByte = this.peek()
      const foundStr =
        foundByte !== null
          ? `'${String.fromCharCode(foundByte)}' (0x${foundByte.toString(16).padStart(2, '0')})`
          : 'end of input'
      const expected =
        expectedCharDescription ??
        `'${String.fromCharCode(expectedByte)}' (0x${expectedByte.toString(16).padStart(2, '0')})`
      this.error(`Expected ${expected} but found ${foundStr}`)
    }
  }

  /**
   * Returns a zero-copy `DataView` slice of the source buffer.
   *
   * @param from - Start byte offset (inclusive), relative to the start of `source`.
   * @param to - End byte offset (exclusive), relative to the start of `source`.
   */
  protected captureSlice(from: number, to: number): DataView {
    return new DataView(this.source.buffer, this.source.byteOffset + from, to - from)
  }

  /**
   * Throws an {@link RDParserException} with the given message and the current
   * byte position appended. The return type is `never` so call sites can write
   * `return this.error(...)` to satisfy TypeScript's control-flow analysis.
   *
   * @param message - Description of the parse failure.
   * @throws {RDParserException} Always.
   */
  protected error(message: string): never {
    throw new RDParserException(`${message} (at position ${this.#position})`)
  }

  /**
   * Returns the current byte offset within the source buffer.
   */
  protected getPosition(): number {
    return this.#position
  }

  /**
   * Returns the furthest byte offset at which a terminal match was attempted
   * and failed. Useful for producing informative error messages: when the
   * overall parse fails, this position is where the parser made the most
   * progress and is typically closest to the actual error in the input.
   */
  protected getFurthestFailPosition(): number {
    return this.#furthestFailPosition
  }

  /**
   * Throws a {@link RDParserException} that names the unexpected byte (or
   * end-of-input) at the furthest position reached during parsing.
   *
   * Call this from the top-level `parse()` method when the first rule returns
   * `null`, to give callers a precise error location and token description
   * rather than a generic "Failed to parse input (at position 0)" message.
   *
   * @throws {RDParserException} Always.
   */
  protected errorAtFurthest(): never {
    const pos = this.#furthestFailPosition
    const byte = pos < this.source.byteLength ? this.source.getUint8(pos) : null
    const token =
      byte !== null
        ? `'${String.fromCharCode(byte)}' (0x${byte.toString(16).padStart(2, '0')})`
        : 'end of input'
    throw new RDParserException(`Failed to parse: unexpected ${token} at position ${pos}`)
  }

  /**
   * Restores the current byte position to a previously saved value.
   *
   * Typically used with {@link getPosition} to implement backtracking in
   * parser alternatives.
   *
   * @param pos - The byte offset to restore to.
   */
  protected restorePosition(pos: number): void {
    this.#position = pos
  }
}
