/** @module ScannerlessRDParser */

import { RDParser } from './rdparser.js'

/**
 * Base class for scannerless recursive descent parsers.
 *
 * Extends {@link RDParser} with character-by-character input handling over a
 * `DataView`. Subclass this to write a parser that reads the source string
 * byte by byte with no separate tokenisation step.
 *
 * Use the protected helper methods (`peek`, `matchChar`, `readChar`,
 * `expectChar`, etc.) to read bytes and signal failures.
 */
export class ScannerlessRDParser extends RDParser {
  /** The raw input buffer. Accessible to subclasses so they can decode slices. */
  protected readonly source: DataView

  /**
   * @param source - The input to parse, wrapped in a `DataView`.
   */
  constructor(source: DataView) {
    super()
    this.source = source
  }

  protected atEnd(): boolean {
    return this.getPosition() >= this.source.byteLength
  }

  protected describePosition(pos: number): string {
    const byte = pos < this.source.byteLength ? this.source.getUint8(pos) : null
    return byte !== null
      ? `'${String.fromCharCode(byte)}' (0x${byte.toString(16).padStart(2, '0')})`
      : 'end of input'
  }

  /**
   * Returns the byte at the current position without consuming it,
   * or `null` if the parser has reached the end of input.
   */
  protected peek(): number | null {
    if (this.getPosition() >= this.source.byteLength) return null
    return this.source.getUint8(this.getPosition())
  }

  /**
   * Moves the current position forward by one byte.
   * Has no effect when already at end of input.
   */
  protected advance(): void {
    if (this.getPosition() < this.source.byteLength) this.restorePosition(this.getPosition() + 1)
  }

  /**
   * Returns the byte at the current position and advances past it.
   *
   * @throws {RDParserException} If already at end of input.
   */
  protected consume(): number {
    const byte = this.peek()
    if (byte === null) return this.error('Unexpected end of input')
    this.restorePosition(this.getPosition() + 1)
    return byte
  }

  /**
   * If the current byte equals `expectedByte`, consumes it and returns `true`.
   * Otherwise leaves the position unchanged and returns `false`.
   *
   * @param expectedByte - The byte value to match.
   */
  protected matchChar(expectedByte: number): boolean {
    if (this.peek() === expectedByte) {
      this.restorePosition(this.getPosition() + 1)
      return true
    }
    this.updateFurthestFail()
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
      this.restorePosition(this.getPosition() + 1)
      return String.fromCharCode(expectedByte)
    }
    this.updateFurthestFail()
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
      this.updateFurthestFail()
      return null
    }
    this.restorePosition(this.getPosition() + 1)
    return String.fromCharCode(currentByte)
  }

  /**
   * Asserts that the current byte equals `expectedByte` and consumes it.
   *
   * @param expectedByte - The byte value expected.
   * @param expectedCharDescription - Optional human-readable name for the expected character.
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
}
