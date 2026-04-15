import { EBNFParser } from '../../generator/ebnf-parser.js'
import { RDParserException } from '../../exception.js'

describe('EBNFParser.parse — ISO 14977 EBNF', () => {
  // ── Basic rule structure ──────────────────────────────────────────────────

  it('parses a single rule with a terminal', () => {
    const ast = EBNFParser.parse(`Greeting = 'hello';`)
    expect(ast.rules).toHaveLength(1)
    expect(ast.rules[0]?.name).toBe('Greeting')
    expect(ast.rules[0]?.body).toMatchObject({ kind: 'terminal', value: 'hello' })
  })

  it('parses a sequence (comma concatenation)', () => {
    const ast = EBNFParser.parse(`AB = 'a', 'b';`)
    expect(ast.rules[0]?.body).toMatchObject({ kind: 'sequence' })
  })

  it('parses alternation', () => {
    const ast = EBNFParser.parse(`Letter = 'a' | 'b';`)
    expect(ast.rules[0]?.body).toMatchObject({ kind: 'alternation' })
  })

  it('parses { } as zero-or-more', () => {
    const ast = EBNFParser.parse(`Many = {'a'};`)
    expect(ast.rules[0]?.body).toMatchObject({ kind: 'zeroOrMore' })
  })

  it('parses [ ] as optional', () => {
    const ast = EBNFParser.parse(`Opt = ['a'];`)
    expect(ast.rules[0]?.body).toMatchObject({ kind: 'optional' })
  })

  it('parses ( ) as grouping (transparent)', () => {
    const ast = EBNFParser.parse(`Rule = ('a' | 'b');`)
    expect(ast.rules[0]?.body).toMatchObject({ kind: 'alternation' })
  })

  it('parses n * P as an exact-count sequence', () => {
    const ast = EBNFParser.parse(`Three = 3 * 'x';`)
    expect(ast.rules[0]?.body).toMatchObject({
      kind: 'sequence',
      items: [
        { kind: 'terminal', value: 'x' },
        { kind: 'terminal', value: 'x' },
        { kind: 'terminal', value: 'x' },
      ],
    })
  })

  it('parses 1 * P as the item itself (no wrapping)', () => {
    const ast = EBNFParser.parse(`One = 1 * 'x';`)
    expect(ast.rules[0]?.body).toMatchObject({ kind: 'terminal', value: 'x' })
  })

  it('parses A - B as an exception', () => {
    const ast = EBNFParser.parse(`NotE = Letter - 'e';`)
    expect(ast.rules[0]?.body).toMatchObject({
      kind: 'exception',
      item: { kind: 'nonTerminal', name: 'Letter' },
      except: { kind: 'terminal', value: 'e' },
    })
  })

  it('parses non-terminal references', () => {
    const ast = EBNFParser.parse(`A = B;\nB = 'x';`)
    expect(ast.rules[0]?.body).toMatchObject({ kind: 'nonTerminal', name: 'B' })
  })

  it('parses multiple rules', () => {
    const ast = EBNFParser.parse(`A = 'x'; B = 'y'; C = 'z';`)
    expect(ast.rules).toHaveLength(3)
  })

  it('parses rules separated by newlines', () => {
    const ast = EBNFParser.parse(`A = 'x';\nB = 'y';\nC = 'z';`)
    expect(ast.rules).toHaveLength(3)
  })

  it('skips block comments', () => {
    const ast = EBNFParser.parse(`(* greeting *) Greeting = 'hello';`)
    expect(ast.rules).toHaveLength(1)
  })

  it('parses double-quoted literals', () => {
    const ast = EBNFParser.parse(`Rule = "hello";`)
    expect(ast.rules[0]?.body).toMatchObject({ kind: 'terminal', value: 'hello' })
  })

  // ── Operator precedence ───────────────────────────────────────────────────

  it('comma binds tighter than pipe: a, b | c, d = (a,b) | (c,d)', () => {
    const ast = EBNFParser.parse(`Rule = 'a', 'b' | 'c', 'd';`)
    expect(ast.rules[0]?.body).toMatchObject({
      kind: 'alternation',
      items: [
        {
          kind: 'sequence',
          items: [
            { kind: 'terminal', value: 'a' },
            { kind: 'terminal', value: 'b' },
          ],
        },
        {
          kind: 'sequence',
          items: [
            { kind: 'terminal', value: 'c' },
            { kind: 'terminal', value: 'd' },
          ],
        },
      ],
    })
  })

  // ── String escape sequences ───────────────────────────────────────────────

  it('parses \\n as a newline character', () => {
    const ast = EBNFParser.parse(`Rule = '\\n';`)
    expect(ast.rules[0]?.body).toMatchObject({ kind: 'terminal', value: '\n' })
  })

  it('parses \\t as a tab character', () => {
    const ast = EBNFParser.parse(`Rule = '\\t';`)
    expect(ast.rules[0]?.body).toMatchObject({ kind: 'terminal', value: '\t' })
  })

  it('parses \\\\ as a backslash', () => {
    const ast = EBNFParser.parse(`Rule = '\\\\';`)
    expect(ast.rules[0]?.body).toMatchObject({ kind: 'terminal', value: '\\' })
  })

  it("parses \\' as a single quote", () => {
    const ast = EBNFParser.parse(`Rule = '\\'';`)
    expect(ast.rules[0]?.body).toMatchObject({ kind: 'terminal', value: "'" })
  })

  it('throws on unknown escape sequence', () => {
    expect(() => EBNFParser.parse(`Rule = '\\z';`)).toThrow(RDParserException)
  })

  it('throws when input ends inside an escape sequence', () => {
    expect(() => EBNFParser.parse(`Rule = '\\`)).toThrow(RDParserException)
  })

  // ── Error cases ───────────────────────────────────────────────────────────

  it('throws on empty input', () => {
    expect(() => EBNFParser.parse('')).toThrow(RDParserException)
  })

  it('throws on missing = separator', () => {
    expect(() => EBNFParser.parse(`Foo 'bar';`)).toThrow(RDParserException)
  })

  it('throws on missing ; terminator', () => {
    expect(() => EBNFParser.parse(`Foo = 'bar'`)).toThrow(RDParserException)
  })

  it('throws on an unterminated string literal', () => {
    expect(() => EBNFParser.parse(`Rule = 'hello;`)).toThrow(RDParserException)
  })

  it('throws on an unexpected character in a primary', () => {
    expect(() => EBNFParser.parse(`Rule = !;`)).toThrow(RDParserException)
  })

  it('throws when rule begins with a non-name character', () => {
    expect(() => EBNFParser.parse(`123 = 'x';`)).toThrow(RDParserException)
  })

  it('throws on zero repetition count', () => {
    expect(() => EBNFParser.parse(`Rule = 0 * 'x';`)).toThrow(RDParserException)
  })
})
