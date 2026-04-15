/**
 * Bootstrapping tests — rdp-gen can generate parsers for EBNF and ABNF grammars,
 * and those generated parsers can in turn parse their own meta-grammar format.
 *
 * Four scenarios:
 *   1. EBNF meta-grammar described in EBNF  → parser reads EBNF input
 *   2. EBNF meta-grammar described in ABNF  → parser reads EBNF input
 *   3. ABNF meta-grammar described in EBNF  → parser reads ABNF input
 *   4. ABNF meta-grammar described in ABNF  → parser reads ABNF input
 *
 * All four tests use generateParser (rdp-gen programmatic API) — NOT GrammarInterpreter.
 * The returned TypeScript is transpiled with ts.transpileModule and executed via new Function.
 *
 * Grammar sources live in src/grammars/ as .ebnf / .abnf files; this module
 * imports them from the canonical src/grammars/index.ts export.
 */

import ts from 'typescript'
import { generateParser } from '../generator/index.js'
import { RDParser } from '../rdparser.js'
import { ebnfMetaEBNF, ebnfMetaABNF, abnfMetaEBNF, abnfMetaABNF } from '../grammars/index.js'

// ── Helpers ────────────────────────────────────────────────────────────────

type AnyParser = { parse(input: string): unknown }

/**
 * Build a real RD parser class from grammar source using generateParser (rdp-gen API),
 * transpile the emitted TypeScript to CommonJS, and return the class constructor.
 */
function buildParser(
  source: string,
  format: 'ebnf' | 'abnf',
  parserName = 'MetaParser',
): AnyParser {
  const tsSource = generateParser(source, { format, parserName })

  const { outputText } = ts.transpileModule(tsSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      strict: false,
    },
  })

  const mockExports: Record<string, unknown> = {}
  const mockModule = { exports: mockExports }

  new Function('require', 'exports', 'module', outputText)(
    (id: string) => {
      if (id === '@configuredthings/rdp.js') return { RDParser }
      throw new Error(`Unexpected require('${id}')`)
    },
    mockExports,
    mockModule,
  )

  const ParserClass = Object.values(mockModule.exports as Record<string, unknown>).find(
    (v): v is AnyParser =>
      typeof v === 'function' &&
      typeof (v as unknown as Record<string, unknown>)['parse'] === 'function',
  )
  if (!ParserClass) throw new Error('No parser class found in generated module exports')
  return ParserClass
}

/** Run a generated parser against `input`; return true on success, false on failure. */
function tryParse(Parser: AnyParser, input: string): boolean {
  try {
    Parser.parse(input)
    return true
  } catch {
    return false
  }
}

// ── Sample inputs ──────────────────────────────────────────────────────────

// EBNF-in-EBNF: ISO 14977 syntax
const EBNF_IN_EBNF_VALID = `A = 'hello' | B;\nB = 'world';`
const EBNF_IN_EBNF_INVALID = 'bad grammar !!!'

// EBNF-in-ABNF: full grammar; use the DEFAULT_EBNF arithmetic grammar as a real test
const EBNF_IN_ABNF_VALID = `\
Expr   = wsp, Term, {wsp, ('+' | '-'), wsp, Term}, wsp;
Term   = Factor, {wsp, ('*' | '/'), wsp, Factor};
Factor = '(', Expr, ')' | Number;
Number = Digit, {Digit};
Digit  = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';
wsp    = {' '};`
const EBNF_IN_ABNF_INVALID = '= missing name'

// ABNF-in-EBNF: ABNF rules have no terminator — abnf-meta.ebnf doesn't include one
const ABNF_IN_EBNF_VALID = `HexDig = %x30-39 / %x41-46 / %x61-66\nBit = %x30 / %x31`
const ABNF_IN_EBNF_INVALID = '= missing-name'

// ABNF-in-ABNF: self-describing; use the DEFAULT_ABNF arithmetic grammar
const ABNF_IN_ABNF_VALID = `\
Expr   = wsp Term *( wsp ("+" / "-") wsp Term ) wsp
Term   = Factor *( wsp ("*" / "/") wsp Factor )
Factor = "(" Expr ")" / Number
Number = 1*Digit
Digit  = "0" / "1" / "2" / "3" / "4" / "5" / "6" / "7" / "8" / "9"
wsp    = *" "`
const ABNF_IN_ABNF_INVALID = '= missing-name'

// ── Tests ─────────────────────────────────────────────────────────────────

describe('Bootstrap: EBNF meta-grammar described in EBNF', () => {
  let Parser: AnyParser

  beforeAll(() => {
    Parser = buildParser(ebnfMetaEBNF, 'ebnf', 'EBNFInEBNFParser')
  })

  it('generates a parser class without throwing', () => {
    expect(Parser).toBeDefined()
    expect(typeof Parser).toBe('function')
  })

  it('accepts a rule with a string literal', () => {
    expect(tryParse(Parser, EBNF_IN_EBNF_VALID)).toBe(true)
  })

  it('accepts a rule with groups and quantifiers', () => {
    expect(tryParse(Parser, "A = {'x' | 'y'};")).toBe(true)
  })

  it('accepts a rule with only name references', () => {
    expect(tryParse(Parser, 'A = B | C, D;')).toBe(true)
  })

  it('rejects invalid input', () => {
    expect(tryParse(Parser, EBNF_IN_EBNF_INVALID)).toBe(false)
  })
})

describe('Bootstrap: EBNF meta-grammar described in ABNF', () => {
  let Parser: AnyParser

  beforeAll(() => {
    Parser = buildParser(ebnfMetaABNF, 'abnf', 'EBNFInABNFParser')
  })

  it('generates a parser class without throwing', () => {
    expect(Parser).toBeDefined()
    expect(typeof Parser).toBe('function')
  })

  it('accepts the playground DEFAULT_EBNF arithmetic grammar', () => {
    expect(tryParse(Parser, EBNF_IN_ABNF_VALID)).toBe(true)
  })

  it('accepts a simple EBNF rule with a literal', () => {
    expect(tryParse(Parser, "A = 'hello' | 'world';")).toBe(true)
  })

  it('rejects invalid input', () => {
    expect(tryParse(Parser, EBNF_IN_ABNF_INVALID)).toBe(false)
  })
})

describe('Bootstrap: ABNF meta-grammar described in EBNF', () => {
  let Parser: AnyParser

  beforeAll(() => {
    Parser = buildParser(abnfMetaEBNF, 'ebnf', 'ABNFInEBNFParser')
  })

  it('generates a parser class without throwing', () => {
    expect(Parser).toBeDefined()
    expect(typeof Parser).toBe('function')
  })

  it('accepts a rule with %x char-value ranges', () => {
    expect(tryParse(Parser, ABNF_IN_EBNF_VALID)).toBe(true)
  })

  it('accepts a rule with %x codepoint concatenation', () => {
    expect(tryParse(Parser, 'CRLF = %x0D.0A')).toBe(true)
  })

  it('accepts a rule with string literals', () => {
    expect(tryParse(Parser, 'Greeting = "hello" / "world"')).toBe(true)
  })

  it('accepts a rule with repetition and optional groups', () => {
    expect(tryParse(Parser, 'Name = Letter *( Letter / Digit )')).toBe(true)
  })

  it('rejects invalid input', () => {
    expect(tryParse(Parser, ABNF_IN_EBNF_INVALID)).toBe(false)
  })
})

describe('Bootstrap: ABNF meta-grammar described in ABNF (self-describing)', () => {
  let Parser: AnyParser

  beforeAll(() => {
    Parser = buildParser(abnfMetaABNF, 'abnf', 'ABNFInABNFParser')
  })

  it('generates a parser class without throwing', () => {
    expect(Parser).toBeDefined()
    expect(typeof Parser).toBe('function')
  })

  it('accepts the playground DEFAULT_ABNF arithmetic grammar', () => {
    expect(tryParse(Parser, ABNF_IN_ABNF_VALID)).toBe(true)
  })

  it('accepts a simple ABNF rule', () => {
    expect(tryParse(Parser, 'Greeting = "hello" / "world"')).toBe(true)
  })

  it('rejects invalid input', () => {
    expect(tryParse(Parser, ABNF_IN_ABNF_INVALID)).toBe(false)
  })
})
