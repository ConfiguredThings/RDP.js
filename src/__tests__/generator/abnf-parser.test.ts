import { ABNFParser } from '../../generator/abnf-parser.js'
import { RDParserException } from '../../exception.js'

describe('ABNFParser.parse', () => {
  it('parses a single rule with a quoted string', () => {
    const ast = ABNFParser.parse(`greeting = "hello"`)
    expect(ast.rules).toHaveLength(1)
    expect(ast.rules[0]?.name).toBe('greeting')
    expect(ast.rules[0]?.body).toMatchObject({ kind: 'terminal', value: 'hello' })
  })

  it('normalises case-insensitive quoted strings to lowercase', () => {
    const ast = ABNFParser.parse(`rule = "Hello"`)
    expect(ast.rules[0]?.body).toMatchObject({ kind: 'terminal', value: 'hello' })
  })

  it('preserves case for %s"..." case-sensitive strings', () => {
    const ast = ABNFParser.parse(`rule = %s"Hello"`)
    expect(ast.rules[0]?.body).toMatchObject({ kind: 'terminal', value: 'Hello' })
  })

  it('preserves case for %i"..." (RFC 7405 explicit case-insensitive)', () => {
    // %i is case-insensitive — same behaviour as plain quotes: lowercase
    const ast = ABNFParser.parse(`rule = %i"Hello"`)
    expect(ast.rules[0]?.body).toMatchObject({ kind: 'terminal', value: 'hello' })
  })

  it('preserves case when caseSensitiveStrings option is true', () => {
    const ast = ABNFParser.parse(`rule = "Hello"`, { caseSensitiveStrings: true })
    expect(ast.rules[0]?.body).toMatchObject({ kind: 'terminal', value: 'Hello' })
  })

  it('parses alternation with /', () => {
    const ast = ABNFParser.parse(`bit = "0" / "1"`)
    expect(ast.rules[0]?.body).toMatchObject({ kind: 'alternation' })
  })

  it('parses a multi-element concatenation as a sequence', () => {
    // Two adjacent elements in ABNF → sequence node
    const ast = ABNFParser.parse(`pair = "a" "b"`)
    expect(ast.rules[0]?.body).toMatchObject({ kind: 'sequence' })
  })

  it('parses optional with []', () => {
    const ast = ABNFParser.parse(`rule = ["x"]`)
    expect(ast.rules[0]?.body).toMatchObject({ kind: 'optional' })
  })

  it('parses grouping with ()', () => {
    // Grouped sub-expression: (A / B) as an element
    const ast = ABNFParser.parse(`rule = ("a" / "b")`)
    expect(ast.rules[0]?.body).toMatchObject({ kind: 'alternation' })
  })

  it('parses *A as zeroOrMore', () => {
    const ast = ABNFParser.parse(`rule = *"a"`)
    expect(ast.rules[0]?.body).toMatchObject({ kind: 'zeroOrMore' })
  })

  it('parses 1*A as oneOrMore', () => {
    const ast = ABNFParser.parse(`rule = 1*"a"`)
    expect(ast.rules[0]?.body).toMatchObject({ kind: 'oneOrMore' })
  })

  it('parses *1A as optional (0 to 1)', () => {
    const ast = ABNFParser.parse(`rule = *1"a"`)
    expect(ast.rules[0]?.body).toMatchObject({ kind: 'optional' })
  })

  it('parses 2*4A as repetition', () => {
    const ast = ABNFParser.parse(`rule = 2*4"a"`)
    expect(ast.rules[0]?.body).toMatchObject({ kind: 'repetition', min: 2, max: 4 })
  })

  it('parses an exact-count repetition (3A → min=max=3)', () => {
    // No * operator: 3A means exactly 3 repetitions
    const ast = ABNFParser.parse(`rule = 3"a"`)
    expect(ast.rules[0]?.body).toMatchObject({ kind: 'repetition', min: 3, max: 3 })
  })

  it('parses %xNN character values', () => {
    const ast = ABNFParser.parse(`rule = %x41`)
    expect(ast.rules[0]?.body).toMatchObject({
      kind: 'charValue',
      encoding: 'x',
      codepoints: [0x41],
    })
  })

  it('parses %xNN-MM character ranges', () => {
    const ast = ABNFParser.parse(`rule = %x41-5A`)
    expect(ast.rules[0]?.body).toMatchObject({ kind: 'charValue', range: [0x41, 0x5a] })
  })

  it('parses %xNN.MM codepoint concatenation', () => {
    const ast = ABNFParser.parse(`rule = %x41.42`)
    expect(ast.rules[0]?.body).toMatchObject({ kind: 'charValue', codepoints: [0x41, 0x42] })
  })

  it('parses %dNN decimal character values', () => {
    const ast = ABNFParser.parse(`rule = %d65`)
    expect(ast.rules[0]?.body).toMatchObject({ kind: 'charValue', encoding: 'd', codepoints: [65] })
  })

  it('parses %bNNN binary character values', () => {
    const ast = ABNFParser.parse(`rule = %b1000001`)
    expect(ast.rules[0]?.body).toMatchObject({ kind: 'charValue', encoding: 'b', codepoints: [65] })
  })

  it('parses hex values with lowercase letters (a-f)', () => {
    // Exercises the lowercase branch of isHexDigit / hexDigitValue
    const ast = ABNFParser.parse(`rule = %xaf`)
    expect(ast.rules[0]?.body).toMatchObject({ kind: 'charValue', codepoints: [0xaf] })
  })

  it('parses hex values with uppercase letters (A-F)', () => {
    const ast = ABNFParser.parse(`rule = %xAF`)
    expect(ast.rules[0]?.body).toMatchObject({ kind: 'charValue', codepoints: [0xaf] })
  })

  it('parses ALPHA core rule reference', () => {
    const ast = ABNFParser.parse(`rule = ALPHA`)
    expect(ast.rules[0]?.body).toMatchObject({ kind: 'coreRule', name: 'ALPHA' })
  })

  it('treats a core-rule name as a nonTerminal when it is locally defined', () => {
    // DIGIT is defined in this grammar, so the reference is a nonTerminal, not a coreRule
    const ast = ABNFParser.parse(`rule = DIGIT\nDIGIT = "0" / "1"`)
    expect(ast.rules[0]?.body).toMatchObject({ kind: 'nonTerminal', name: 'DIGIT' })
  })

  it('parses a user-defined non-terminal reference', () => {
    const ast = ABNFParser.parse(`top = item\nitem = "x"`)
    expect(ast.rules[0]?.body).toMatchObject({ kind: 'nonTerminal', name: 'item' })
  })

  it('merges incremental alternatives (=/) when base rule is a terminal', () => {
    const ast = ABNFParser.parse(`rule = "a"\nrule =/ "b"`)
    expect(ast.rules).toHaveLength(1)
    expect(ast.rules[0]?.body).toMatchObject({ kind: 'alternation' })
  })

  it('merges incremental alternatives (=/) when base rule is already an alternation', () => {
    // Covers the existing.kind === 'alternation' branch
    const ast = ABNFParser.parse(`rule = "a" / "b"\nrule =/ "c"`)
    expect(ast.rules).toHaveLength(1)
    const body = ast.rules[0]?.body
    expect(body?.kind).toBe('alternation')
    if (body?.kind === 'alternation') {
      expect(body.items).toHaveLength(3)
    }
  })

  it('throws when an incremental rule (=/) is defined before its base rule', () => {
    expect(() => ABNFParser.parse(`rule =/ "b"`)).toThrow(RDParserException)
  })

  it('skips semicolon-prefixed line comments', () => {
    const ast = ABNFParser.parse(`rule = "a" ; this is a comment\n`)
    expect(ast.rules).toHaveLength(1)
    expect(ast.rules[0]?.body).toMatchObject({ kind: 'terminal', value: 'a' })
  })

  it('throws on empty input', () => {
    expect(() => ABNFParser.parse('')).toThrow(RDParserException)
  })

  it('throws on an unexpected character in an element', () => {
    expect(() => ABNFParser.parse(`rule = !`)).toThrow(RDParserException)
  })

  it('throws on an unterminated string literal', () => {
    expect(() => ABNFParser.parse(`rule = "abc`)).toThrow(RDParserException)
  })

  it('throws on an invalid encoding specifier after %', () => {
    // %z is not a valid encoding: not x, d, b, s, or i
    expect(() => ABNFParser.parse(`rule = %z41`)).toThrow(RDParserException)
  })

  it('throws when alternation has a trailing / with no following element', () => {
    // parseConcatenation called after consuming '/' finds zero items → error
    expect(() => ABNFParser.parse(`rule = "a" /`)).toThrow(RDParserException)
  })

  it('throws when a rule begins with a non-name character', () => {
    // parseName throws when peek() is not a name-start character
    expect(() => ABNFParser.parse(`! = "x"`)).toThrow(RDParserException)
  })

  it('throws on %d with no decimal digits', () => {
    expect(() => ABNFParser.parse(`rule = %d!`)).toThrow(RDParserException)
  })

  it('throws on %x with no hex digits', () => {
    expect(() => ABNFParser.parse(`rule = %xg`)).toThrow(RDParserException)
  })

  it('throws on %b with no binary digits', () => {
    expect(() => ABNFParser.parse(`rule = %b2`)).toThrow(RDParserException)
  })
})
