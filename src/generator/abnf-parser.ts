/**
 * @packageDocumentation
 * @module ABNFParser
 *
 * ABNF grammar parser (RFC 5234) — produces a {@link GrammarAST} from ABNF source text.
 *
 * Use the static {@link ABNFParser.parse} method — do not instantiate directly.
 * Triggered when the input file has a `.abnf` extension or `--format abnf` is passed.
 *
 * ABNF-specific constructs handled:
 * - `=` and `=/` rule definitions (incremental alternatives merged at parse time)
 * - `/` alternation operator
 * - `*A`, `1*A`, `2*4A`, `*4A` repetition → `zeroOrMore`, `oneOrMore`, or `repetition` nodes
 * - `[A]` optional → `optional` node
 * - `%xNN`, `%dNN`, `%bNN` character values and `%xNN-MM` ranges → `charValue` nodes
 * - `"string"` case-insensitive string literals
 * - `%s"string"` case-sensitive string literals (RFC 7405)
 * - Core rule references (ALPHA, DIGIT, etc.) → `coreRule` nodes
 */

import { GrammarParser, encoder } from './grammar-parser.js'
import { RDParserException } from '../exception.js'
import type { GrammarAST, ProductionRule, RuleBody, CoreRuleName } from './ast.js'

const CORE_RULES = new Set<string>([
  'ALPHA',
  'BIT',
  'CHAR',
  'CR',
  'CRLF',
  'CTL',
  'DIGIT',
  'DQUOTE',
  'HEXDIG',
  'HTAB',
  'LF',
  'LWSP',
  'OCTET',
  'SP',
  'VCHAR',
  'WSP',
])

/** Options for {@link ABNFParser.parse}. */
export type ABNFParseOptions = {
  /**
   * When `true`, unquoted string literals (`"abc"`) are matched case-sensitively,
   * preserving the exact characters as written. When `false` (the RFC 5234 default),
   * they are lowercased so the generated parser matches both cases.
   *
   * @default false
   */
  caseSensitiveStrings?: boolean
}

export class ABNFParser extends GrammarParser {
  /**
   * Parse ABNF source text (RFC 5234) and return a {@link GrammarAST}.
   *
   * @param source - ABNF grammar source text.
   * @param options - Parse options.
   */
  static parse(source: string, options: ABNFParseOptions = {}): GrammarAST {
    // Pre-scan all rule definition names so forward references can be resolved correctly.
    // A rule definition starts a line with a name followed by optional whitespace and "=" or "=/".
    const definedRuleNames = new Set<string>()
    for (const m of source.matchAll(/^([A-Za-z][A-Za-z0-9-]*)\s*=\/?/gm)) {
      // istanbul ignore else -- regex capture group 1 is always defined on a successful match
      if (m[1] !== undefined) definedRuleNames.add(m[1])
    }
    const bytes = encoder.encode(source)
    return new ABNFParser(
      new DataView(bytes.buffer),
      definedRuleNames,
      options.caseSensitiveStrings ?? false,
    ).parse()
  }

  // Incremental alternatives accumulate here before being merged into the AST
  readonly #rules = new Map<string, RuleBody>()
  // Rule names that are defined in this grammar (pre-scanned before parsing bodies)
  readonly #definedRuleNames: Set<string>
  // When true, plain "..." quoted strings are matched case-sensitively
  readonly #caseSensitiveStrings: boolean

  private constructor(
    source: DataView,
    definedRuleNames: Set<string>,
    caseSensitiveStrings: boolean,
  ) {
    super(source)
    this.#definedRuleNames = definedRuleNames
    this.#caseSensitiveStrings = caseSensitiveStrings
  }

  parse(): GrammarAST {
    this.skipWhitespace()
    while (!this.atEnd()) {
      this.parseRule()
      this.skipWhitespace()
    }
    if (this.#rules.size === 0) this.error('Expected at least one rule')
    const rules: ProductionRule[] = Array.from(this.#rules.entries()).map(([name, body]) => ({
      name,
      body,
    }))
    return { rules }
  }

  private parseRule(): void {
    const name = this.parseName()
    this.skipWhitespace()
    this.expectChar(0x3d, "'='")
    const incremental = this.matchChar(0x2f) // =/ vs plain =
    this.skipWhitespace()
    const body = this.parseAlternation()
    if (incremental) {
      const existing = this.#rules.get(name)
      if (existing === undefined) this.error(`Incremental rule '${name}' defined before base rule`)
      if (existing.kind === 'alternation') {
        this.#rules.set(name, { kind: 'alternation', items: [...existing.items, body] })
      } else {
        this.#rules.set(name, { kind: 'alternation', items: [existing, body] })
      }
    } else {
      this.#rules.set(name, body)
    }
  }

  private parseAlternation(): RuleBody {
    const first = this.parseConcatenation()
    this.skipWhitespace()
    if (!this.matchChar(0x2f)) return first // /
    const items: RuleBody[] = [first]
    do {
      this.skipWhitespace()
      items.push(this.parseConcatenation())
      this.skipWhitespace()
    } while (this.matchChar(0x2f))
    return { kind: 'alternation', items }
  }

  private parseConcatenation(): RuleBody {
    const items: RuleBody[] = []
    this.skipWhitespace()
    while (!this.atEnd() && !this.isAlternationTerminator() && !this.isNextRuleStart()) {
      items.push(this.parseRepetition())
      this.skipWhitespace()
    }
    if (items.length === 0) this.error('Expected at least one element in concatenation')
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    if (items.length === 1) return items[0]!
    return { kind: 'sequence', items }
  }

  /** Returns true if the current position looks like the start of a new rule (Name =). */
  private isNextRuleStart(): boolean {
    let i = 0
    const base = this.getPosition()
    const len = this.source.byteLength
    const at = (offset: number): number | null => {
      const pos = base + offset
      return pos < len ? this.source.getUint8(pos) : null
    }
    const byte = at(i)
    if (byte === null || !this.isNameStart(byte)) return false
    i++
    while (true) {
      const next = at(i)
      if (next === null || !this.isNameContinue(next)) break
      i++
    }
    // skip whitespace
    while (at(i) === 0x20 || at(i) === 0x09 || at(i) === 0x0a || at(i) === 0x0d) i++
    return at(i) === 0x3d // =
  }

  private parseRepetition(): RuleBody {
    // Optional leading count: *  1*  2*4  etc.
    let min = 0
    let max: number | null = null
    let hasRepeat = false

    if (this.isDigit(this.peek())) {
      min = this.parseDecimal()
      hasRepeat = true
    }
    if (this.matchChar(0x2a)) {
      // *
      hasRepeat = true
      if (this.isDigit(this.peek())) max = this.parseDecimal()
      else max = null
    } else if (hasRepeat) {
      max = min
    }

    const element = this.parseElement()

    if (!hasRepeat) return element
    if (min === 0 && max === null) return { kind: 'zeroOrMore', item: element }
    if (min === 1 && max === null) return { kind: 'oneOrMore', item: element }
    if (min === 0 && max === 1) return { kind: 'optional', item: element }
    return { kind: 'repetition', min, max, item: element }
  }

  private parseElement(): RuleBody {
    const byte = this.peek()
    // istanbul ignore next -- parseConcatenation guards !atEnd() before every parseRepetition call
    if (byte === null) this.error('Unexpected end of input')
    if (byte === 0x5b) {
      // [
      this.advance()
      this.skipWhitespace()
      const body = this.parseAlternation()
      this.skipWhitespace()
      this.expectChar(0x5d, "']'")
      return { kind: 'optional', item: body }
    }
    if (byte === 0x28) {
      // (
      this.advance()
      this.skipWhitespace()
      const body = this.parseAlternation()
      this.skipWhitespace()
      this.expectChar(0x29, "')'")
      return body
    }
    if (byte === 0x25) return this.parseCharValue() // %
    if (byte === 0x22) return this.parseQuotedString(false) // "
    if (this.isNameStart(byte)) {
      const name = this.parseName()
      if (CORE_RULES.has(name) && !this.#definedRuleNames.has(name))
        return { kind: 'coreRule', name: name as CoreRuleName }
      return { kind: 'nonTerminal', name }
    }
    this.error(`Unexpected character '${String.fromCharCode(byte)}'`)
  }

  private parseCharValue(): RuleBody {
    this.expectChar(0x25, "'%'")
    const flag = this.peek()
    // %s"..." case-sensitive string (RFC 7405)
    if (flag === 0x73 || flag === 0x53) {
      this.advance()
      return this.parseQuotedString(true)
    }
    // %i"..." case-insensitive string (RFC 7405) — same as plain quoted string
    if (flag === 0x69 || flag === 0x49) {
      this.advance()
      return this.parseQuotedString(false)
    }
    const encodingTypeByte = this.consume()
    if (
      encodingTypeByte !== 0x78 &&
      encodingTypeByte !== 0x58 &&
      encodingTypeByte !== 0x64 &&
      encodingTypeByte !== 0x44 &&
      encodingTypeByte !== 0x62 &&
      encodingTypeByte !== 0x42
    ) {
      this.error("Expected 'x', 'd', or 'b' after '%'")
    }
    const encoding = String.fromCharCode(encodingTypeByte).toLowerCase() as 'x' | 'd' | 'b'
    const first = this.parseCodepoint(encoding)
    // Range: %xNN-MM
    if (this.matchChar(0x2d)) {
      const last = this.parseCodepoint(encoding)
      return { kind: 'charValue', encoding, codepoints: [], range: [first, last] }
    }
    // Concatenation: %xNN.MM.PP
    const codepoints = [first]
    while (this.matchChar(0x2e)) codepoints.push(this.parseCodepoint(encoding))
    return { kind: 'charValue', encoding, codepoints }
  }

  private parseCodepoint(encoding: 'x' | 'd' | 'b'): number {
    if (encoding === 'x') return this.parseHexInt()
    if (encoding === 'd') return this.parseDecimal()
    return this.parseBinaryInt()
  }

  private parseQuotedString(caseSensitive: boolean): RuleBody {
    this.expectChar(0x22, "'\"'")
    const start = this.getPosition()
    while (!this.atEnd() && this.peek() !== 0x22) this.advance()
    if (this.atEnd()) this.error('Unterminated string literal')
    let value = this.decodeSlice(start, this.getPosition())
    this.advance()
    if (!caseSensitive && !this.#caseSensitiveStrings) value = value.toLowerCase()
    return { kind: 'terminal', value }
  }

  private parseName(): string {
    const start = this.getPosition()
    if (!this.isNameStart(this.peek())) this.error('Expected rule name')
    this.advance()
    while (!this.atEnd() && this.isNameContinue(this.peek())) this.advance()
    return this.decodeSlice(start, this.getPosition())
  }

  private parseDecimal(): number {
    if (!this.isDigit(this.peek())) this.error('Expected decimal digit')
    let n = 0
    while (this.isDigit(this.peek())) {
      n = n * 10 + (this.consume() - 0x30)
    }
    return n
  }

  private parseHexInt(): number {
    if (!this.isHexDigit(this.peek())) this.error('Expected hex digit')
    let n = 0
    while (this.isHexDigit(this.peek())) {
      n = n * 16 + this.hexDigitValue(this.consume())
    }
    return n
  }

  private parseBinaryInt(): number {
    if (!this.isBinDigit(this.peek())) this.error('Expected binary digit')
    let n = 0
    while (this.isBinDigit(this.peek())) {
      n = n * 2 + (this.consume() - 0x30)
    }
    return n
  }

  private isAlternationTerminator(): boolean {
    const byte = this.peek()
    return byte === 0x2f || byte === 0x29 || byte === 0x5d // / ) ]
  }

  private isBinDigit(byte: number | null): byte is number {
    return byte === 0x30 || byte === 0x31
  }

  private hexDigitValue(byte: number): number {
    if (byte >= 0x30 && byte <= 0x39) return byte - 0x30
    if (byte >= 0x41 && byte <= 0x46) return byte - 0x41 + 10
    return byte - 0x61 + 10
  }

  private skipWhitespace(): void {
    while (!this.atEnd()) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const byte = this.peek()!
      if (byte === 0x20 || byte === 0x09 || byte === 0x0a || byte === 0x0d) {
        this.advance()
        continue
      }
      if (byte === 0x3b) {
        // ; comment
        while (!this.atEnd() && this.peek() !== 0x0a) this.advance()
        continue
      }
      break
    }
  }
}

export { RDParserException }
