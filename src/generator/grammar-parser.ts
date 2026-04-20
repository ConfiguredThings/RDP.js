/**
 * `GrammarParser` — shared base class for grammar-file parsers.
 *
 * Both {@link ABNFParser} and {@link EBNFParser} extend this class.
 * It provides the utilities that are common to parsing any grammar file format:
 * character-class predicates, slice decoding, and name scanning.
 *
 * Concrete subclasses supply their own `parse()` entry point, whitespace
 * skipping, comment handling, and format-specific rule syntax.
 */

import { ScannerlessRDParser } from '../scannerless.js'
import type { GrammarAST } from './ast.js'

/** Shared `TextEncoder` instance used by all grammar-file parsers. */
export const encoder = new TextEncoder()

export abstract class GrammarParser extends ScannerlessRDParser {
  /** Parse the source and return a {@link GrammarAST}. */
  abstract parse(): GrammarAST

  // ── Character predicates ──────────────────────────────────────────────────

  /** Returns `true` if `byte` is an ASCII letter (A–Z or a–z). */
  protected isAlpha(byte: number | null): byte is number {
    return byte !== null && ((byte >= 0x41 && byte <= 0x5a) || (byte >= 0x61 && byte <= 0x7a))
  }

  /** Returns `true` if `byte` is an ASCII digit (0–9). */
  protected isDigit(byte: number | null): byte is number {
    return byte !== null && byte >= 0x30 && byte <= 0x39
  }

  /** Returns `true` if `byte` is a valid ASCII hex digit (0–9, A–F, a–f). */
  protected isHexDigit(byte: number | null): byte is number {
    return (
      byte !== null &&
      ((byte >= 0x30 && byte <= 0x39) ||
        (byte >= 0x41 && byte <= 0x46) ||
        (byte >= 0x61 && byte <= 0x66))
    )
  }

  // ── Name helpers ──────────────────────────────────────────────────────────

  /**
   * Returns `true` if `byte` can start a grammar rule name.
   * Both ABNF and EBNF rule names start with a letter.
   * (EBNF additionally allows `_`; override if needed.)
   */
  protected isNameStart(byte: number | null): byte is number {
    return this.isAlpha(byte)
  }

  /**
   * Returns `true` if `byte` can continue a grammar rule name.
   * Default: letter, digit, or hyphen (ABNF convention).
   * EBNF overrides to add `_`.
   */
  protected isNameContinue(byte: number | null): byte is number {
    return this.isAlpha(byte) || this.isDigit(byte) || byte === 0x2d // hyphen
  }

  // ── Slice decoding ────────────────────────────────────────────────────────

  /**
   * Decodes a byte range of the source buffer as a UTF-8 string.
   *
   * @param from - Start offset (inclusive).
   * @param to   - End offset (exclusive).
   */
  protected decodeSlice(from: number, to: number): string {
    return new TextDecoder().decode(this.captureSlice(from, to))
  }
}
