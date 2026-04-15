/**
 * @packageDocumentation
 * @module EBNFParser
 *
 * ISO 14977 EBNF grammar parser — produces a {@link GrammarAST} from EBNF source text.
 *
 * Use the static {@link EBNFParser.parse} method — do not instantiate directly.
 * Triggered when the input file has a `.ebnf` extension or `--format ebnf` is passed.
 *
 * Syntax accepted (ISO 14977):
 * ```
 * Grammar  = {Rule};
 * Rule     = Name, '=', Body, ';';
 * Body     = Sequence, {'|', Sequence};
 * Sequence = Term, {',', Term};
 * Term     = Primary, ['-', Primary];
 * Primary  = '{', Body, '}'
 *           | '[', Body, ']'
 *           | '(', Body, ')'
 *           | Integer, '*', Primary
 *           | Literal
 *           | Name;
 * ```
 *
 * String literals support `\n` `\t` `\r` `\\` `\'` `\"` escape sequences.
 * Block comments use `(* ... *)`.
 */

import { GrammarParser, encoder } from './grammar-parser.js'
import { RDParserException } from '../exception.js'
import type { GrammarAST, ProductionRule, RuleBody } from './ast.js'

/** Options for {@link EBNFParser.parse}. Currently a placeholder for future extension. */
export type EBNFParseOptions = Record<string, never>

export class EBNFParser extends GrammarParser {
  private constructor(source: DataView) {
    super(source)
  }

  /**
   * Parse ISO 14977 EBNF source text and return a {@link GrammarAST}.
   *
   * @param source - EBNF grammar source text.
   * @param _options - Parse options (currently unused).
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static parse(source: string, _options?: EBNFParseOptions): GrammarAST {
    const bytes = encoder.encode(source)
    return new EBNFParser(new DataView(bytes.buffer)).parse()
  }

  parse(): GrammarAST {
    this.skipWsp()
    const rules: ProductionRule[] = []
    while (!this.atEnd()) {
      rules.push(this.parseRule())
      this.skipWsp()
    }
    if (rules.length === 0) {
      this.error('Expected at least one rule')
    }
    return { rules }
  }

  // ── Rule ──────────────────────────────────────────────────────────────────

  private parseRule(): ProductionRule {
    const name = this.parseName()
    this.skipWsp()
    this.expectChar(0x3d, "'='") // =
    this.skipWsp()
    const body = this.parseBody()
    this.skipWsp()
    this.expectChar(0x3b, "';'") // ;
    return { name, body }
  }

  // ── Body: alternation ─────────────────────────────────────────────────────

  private parseBody(): RuleBody {
    const first = this.parseSequence()
    this.skipWsp()
    if (!this.matchChar(0x7c)) return first // |
    const items: RuleBody[] = [first]
    do {
      this.skipWsp()
      items.push(this.parseSequence())
      this.skipWsp()
    } while (this.matchChar(0x7c))
    return { kind: 'alternation', items }
  }

  // ── Sequence: explicit comma-concatenation ────────────────────────────────

  private parseSequence(): RuleBody {
    const items: RuleBody[] = [this.parseTerm()]
    this.skipWsp()
    while (this.matchChar(0x2c)) {
      // ,
      this.skipWsp()
      items.push(this.parseTerm())
      this.skipWsp()
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    if (items.length === 1) return items[0]!
    return { kind: 'sequence', items }
  }

  // ── Term: primary with optional exception ─────────────────────────────────

  private parseTerm(): RuleBody {
    const item = this.parsePrimary()
    this.skipWsp()
    if (!this.matchChar(0x2d)) return item // -
    this.skipWsp()
    const except = this.parsePrimary()
    return { kind: 'exception', item, except }
  }

  // ── Primary ───────────────────────────────────────────────────────────────

  private parsePrimary(): RuleBody {
    const byte = this.peek()
    // istanbul ignore next -- parseSequence always ensures non-null
    if (byte === null) this.error('Unexpected end of input')

    // { Body } — zero-or-more
    if (byte === 0x7b) {
      this.advance()
      this.skipWsp()
      const body = this.parseBody()
      this.skipWsp()
      this.expectChar(0x7d, "'}'")
      return { kind: 'zeroOrMore', item: body }
    }

    // [ Body ] — optional
    if (byte === 0x5b) {
      this.advance()
      this.skipWsp()
      const body = this.parseBody()
      this.skipWsp()
      this.expectChar(0x5d, "']'")
      return { kind: 'optional', item: body }
    }

    // ( Body ) — grouping
    if (byte === 0x28) {
      this.advance()
      this.skipWsp()
      const body = this.parseBody()
      this.skipWsp()
      this.expectChar(0x29, "')'")
      return body
    }

    // Integer * Primary — exact n repetitions (expanded to sequence)
    if (this.isDigit(byte)) {
      const n = this.parseInteger()
      this.skipWsp()
      this.expectChar(0x2a, "'*'") // *
      this.skipWsp()
      const item = this.parsePrimary()
      if (n === 0) this.error('Repetition count must be at least 1')
      if (n === 1) return item
      return { kind: 'sequence', items: Array.from({ length: n }, () => item) }
    }

    // String literal
    if (byte === 0x27 || byte === 0x22) return this.parseStringLiteral() // ' or "

    // Non-terminal name
    if (this.isNameStart(byte)) return { kind: 'nonTerminal', name: this.parseName() }

    this.error(`Unexpected character '${String.fromCharCode(byte)}'`)
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private parseInteger(): number {
    let n = 0
    while (this.isDigit(this.peek())) {
      n = n * 10 + (this.consume() - 0x30)
    }
    return n
  }

  private parseName(): string {
    const start = this.getPosition()
    if (!this.isNameStart(this.peek())) this.error('Expected rule name')
    this.advance()
    while (!this.atEnd() && this.isNameContinue(this.peek())) this.advance()
    return this.decodeSlice(start, this.getPosition())
  }

  private parseStringLiteral(): RuleBody {
    const quote = this.consume()
    let value = ''
    while (!this.atEnd() && this.peek() !== quote) {
      if (this.peek() === 0x5c) {
        // backslash — start of escape sequence
        this.advance()
        const esc = this.peek()
        if (esc === null) this.error('Unexpected end of input in escape sequence')
        switch (esc) {
          case 0x6e:
            value += '\n'
            break // \n
          case 0x74:
            value += '\t'
            break // \t
          case 0x72:
            value += '\r'
            break // \r
          case 0x5c:
            value += '\\'
            break // \\
          case 0x27:
            value += "'"
            break // \'
          case 0x22:
            value += '"'
            break // \"
          default:
            this.error(`Unknown escape sequence \\${String.fromCharCode(esc)}`)
        }
        this.advance()
      } else {
        const start = this.getPosition()
        this.advance()
        value += this.decodeSlice(start, this.getPosition())
      }
    }
    if (this.atEnd()) this.error('Unterminated string literal')
    this.advance() // closing quote
    return { kind: 'terminal', value }
  }

  // ── Character class overrides (allow _ in names) ──────────────────────────

  /** EBNF names allow underscore in addition to letters. */
  protected override isNameStart(byte: number | null): byte is number {
    return (
      byte !== null &&
      ((byte >= 0x41 && byte <= 0x5a) || (byte >= 0x61 && byte <= 0x7a) || byte === 0x5f)
    )
  }

  /** EBNF names allow underscore, letters, digits, and hyphen. */
  protected override isNameContinue(byte: number | null): byte is number {
    return this.isNameStart(byte) || this.isDigit(byte) || byte === 0x2d
  }

  // ── Whitespace + comment skipping ────────────────────────────────────────

  private skipWsp(): void {
    while (!this.atEnd()) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const byte = this.peek()!
      if (byte === 0x20 || byte === 0x09 || byte === 0x0a || byte === 0x0d) {
        this.advance()
        continue
      }
      // block comment: (* ... *) with nested-comment support
      if (byte === 0x28 && this.peekAt(1) === 0x2a) {
        this.advance()
        this.advance()
        let depth = 1
        while (!this.atEnd() && depth > 0) {
          if (this.peek() === 0x28 && this.peekAt(1) === 0x2a) {
            this.advance()
            this.advance()
            depth++
            continue
          }
          if (this.peek() === 0x2a && this.peekAt(1) === 0x29) {
            this.advance()
            this.advance()
            depth--
            continue
          }
          this.advance()
        }
        continue
      }
      break
    }
  }

  private peekAt(offset: number): number | null {
    const pos = this.getPosition() + offset
    if (pos >= this.source.byteLength) return null
    return this.source.getUint8(pos)
  }
}

// Re-export the exception so callers don't need a separate import
export { RDParserException }
