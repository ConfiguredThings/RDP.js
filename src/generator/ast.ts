/**
 * @packageDocumentation
 * @module Grammar AST
 *
 * Grammar AST node types shared by both the EBNF and ABNF parsers.
 * `codegen.ts` and `type-gen.ts` are format-agnostic — they only see this AST.
 */

/** The root of a parsed grammar: an ordered list of production rules. */
export type GrammarAST = { rules: ProductionRule[] }

/** A single named production rule. */
export type ProductionRule = {
  /** The rule name as it appears in the grammar source. */
  name: string
  /** The rule's body — what it matches. */
  body: RuleBody
}

/**
 * A node in the body of a production rule.
 * This is a discriminated union — inspect `kind` to narrow to a specific node type.
 */
export type RuleBody =
  // ── Common to both EBNF and ABNF ──────────────────────────────────────────

  /** An ordered sequence of items that must all match in order. */
  | { kind: 'sequence'; items: RuleBody[] }

  /** Two or more alternatives; the first matching branch is taken. */
  | { kind: 'alternation'; items: RuleBody[] }

  /** Matches the inner item zero or one times. EBNF: `A?`; ABNF: `[A]`. */
  | { kind: 'optional'; item: RuleBody }

  /** Matches the inner item zero or more times. EBNF: `A*`; ABNF: `*A`. */
  | { kind: 'zeroOrMore'; item: RuleBody }

  /** Matches the inner item one or more times. EBNF: `A+`; ABNF: `1*A`. */
  | { kind: 'oneOrMore'; item: RuleBody }

  /** A reference to another named production rule. */
  | { kind: 'nonTerminal'; name: string }

  /** A literal string to match byte-for-byte. */
  | { kind: 'terminal'; value: string }

  // ── ISO EBNF-specific ────────────────────────────────────────────────────

  /**
   * Set difference. ISO 14977: `A - B`.
   * Matches `item` only when `except` would NOT match at the same position.
   */
  | { kind: 'exception'; item: RuleBody; except: RuleBody }

  // ── ABNF-specific ─────────────────────────────────────────────────────────

  /**
   * A bounded repetition. ABNF: `2*4A`, `*4A`, `2*A`.
   * `max: null` means unbounded.
   */
  | { kind: 'repetition'; min: number; max: number | null; item: RuleBody }

  /**
   * A single character value or range specified by codepoint.
   * ABNF: `%x41`, `%d65`, `%b1000001`, `%x41-5A`.
   */
  | {
      kind: 'charValue'
      encoding: 'x' | 'd' | 'b'
      codepoints: number[]
      range?: [number, number]
    }

  /** A reference to one of the RFC 5234 core rules (ALPHA, DIGIT, etc.). */
  | { kind: 'coreRule'; name: CoreRuleName }

/** The set of core rule names defined in RFC 5234 Section 6. */
export type CoreRuleName =
  | 'ALPHA'
  | 'BIT'
  | 'CHAR'
  | 'CR'
  | 'CRLF'
  | 'CTL'
  | 'DIGIT'
  | 'DQUOTE'
  | 'HEXDIG'
  | 'HTAB'
  | 'LF'
  | 'LWSP'
  | 'OCTET'
  | 'SP'
  | 'VCHAR'
  | 'WSP'
