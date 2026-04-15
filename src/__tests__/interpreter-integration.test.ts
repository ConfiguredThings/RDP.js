/**
 * Integration tests — parse a grammar file into an AST, then run GrammarInterpreter
 * against sample inputs.  Verifies the full pipeline:
 *   grammar source string → EBNFParser / ABNFParser → GrammarAST → GrammarInterpreter
 *
 * The four meta-grammars from src/grammars/ are used as the test subjects.
 */

import { GrammarInterpreter } from '../grammar-interpreter.js'
import { EBNFParser } from '../generator/ebnf-parser.js'
import { ABNFParser } from '../generator/abnf-parser.js'
import { ebnfMetaEBNF, ebnfMetaABNF, abnfMetaEBNF, abnfMetaABNF } from '../grammars/index.js'
import type { GrammarAST } from '../generator/ast.js'

function interpret(ast: GrammarAST, input: string): boolean {
  const bytes = new TextEncoder().encode(input)
  return new GrammarInterpreter(ast, new DataView(bytes.buffer)).parse()
}

// ── EBNF meta-grammar described in EBNF ────────────────────────────────────

describe('Interpreter + EBNF meta-grammar (EBNF source)', () => {
  let ast: GrammarAST

  beforeAll(() => {
    ast = EBNFParser.parse(ebnfMetaEBNF)
  })

  it('parses the grammar without throwing', () => {
    expect(ast.rules.length).toBeGreaterThan(0)
  })

  it('accepts a simple rule with a literal', () => {
    expect(interpret(ast, "A = 'hello' | B;")).toBe(true)
  })

  it('accepts a rule with groups and repetition', () => {
    expect(interpret(ast, "A = {'x' | 'y'};")).toBe(true)
  })

  it('accepts a rule with only name references', () => {
    expect(interpret(ast, 'A = B | C, D;')).toBe(true)
  })

  it('rejects invalid EBNF', () => {
    expect(interpret(ast, 'bad grammar !!!')).toBe(false)
  })
})

// ── EBNF meta-grammar described in ABNF ────────────────────────────────────

describe('Interpreter + EBNF meta-grammar (ABNF source)', () => {
  let ast: GrammarAST

  beforeAll(() => {
    ast = ABNFParser.parse(ebnfMetaABNF)
  })

  it('parses the grammar without throwing', () => {
    expect(ast.rules.length).toBeGreaterThan(0)
  })

  it('accepts a multi-rule EBNF grammar', () => {
    const input = [
      "Expr   = Term, {('+' | '-'), Term};",
      "Term   = Factor, {('*' | '/'), Factor};",
      "Factor = '(', Expr, ')' | Number;",
      'Number = Digit, {Digit};',
      "Digit  = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';",
    ].join('\n')
    expect(interpret(ast, input)).toBe(true)
  })

  it('accepts a simple EBNF rule with a literal', () => {
    expect(interpret(ast, "A = 'hello' | 'world';")).toBe(true)
  })

  it('accepts a rule with optional and repetition', () => {
    expect(interpret(ast, "A = ['x'], {'y'};")).toBe(true)
  })

  it('rejects malformed EBNF (missing rule name)', () => {
    expect(interpret(ast, '= missing name')).toBe(false)
  })
})

// ── ABNF meta-grammar described in EBNF ────────────────────────────────────

describe('Interpreter + ABNF meta-grammar (EBNF source)', () => {
  // abnfMetaEBNF Grammar rule matches a single rule only (no newlines in EBNF literals)
  let ast: GrammarAST

  beforeAll(() => {
    ast = EBNFParser.parse(abnfMetaEBNF)
  })

  it('parses the grammar without throwing', () => {
    expect(ast.rules.length).toBeGreaterThan(0)
  })

  it('accepts a rule with %x char-value ranges', () => {
    expect(interpret(ast, 'HexDig = %x30-39 / %x41-46 / %x61-66')).toBe(true)
  })

  it('accepts a rule with %x codepoint concatenation', () => {
    expect(interpret(ast, 'CRLF = %x0D.0A')).toBe(true)
  })

  it('accepts a rule with string literals', () => {
    expect(interpret(ast, 'Greeting = "hello" / "world"')).toBe(true)
  })

  it('accepts a rule with repetition and optional groups', () => {
    expect(interpret(ast, 'Name = Letter *( Letter / Digit )')).toBe(true)
  })

  it('rejects malformed ABNF (missing rule name)', () => {
    expect(interpret(ast, '= missing-name')).toBe(false)
  })
})

// ── ABNF meta-grammar described in ABNF ────────────────────────────────────

describe('Interpreter + ABNF meta-grammar (ABNF source, self-describing)', () => {
  let ast: GrammarAST

  beforeAll(() => {
    ast = ABNFParser.parse(abnfMetaABNF)
  })

  it('parses the grammar without throwing', () => {
    expect(ast.rules.length).toBeGreaterThan(0)
  })

  it('accepts a multi-rule ABNF grammar', () => {
    const input = [
      'Expr   = wsp Term *( wsp ("+" / "-") wsp Term ) wsp',
      'Term   = Factor *( wsp ("*" / "/") wsp Factor )',
      'Factor = "(" Expr ")" / Number',
      'Number = 1*Digit',
      'Digit  = "0" / "1" / "2" / "3" / "4" / "5" / "6" / "7" / "8" / "9"',
      'wsp    = *" "',
    ].join('\n')
    expect(interpret(ast, input)).toBe(true)
  })

  it('accepts a simple ABNF rule', () => {
    expect(interpret(ast, 'Greeting = "hello" / "world"')).toBe(true)
  })

  it('rejects malformed ABNF (missing rule name)', () => {
    expect(interpret(ast, '= missing-name')).toBe(false)
  })
})
