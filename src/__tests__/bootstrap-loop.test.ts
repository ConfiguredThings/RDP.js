/**
 * The bootstrap loop, closed end to end.
 *
 * `bootstrap.test.ts` checks that parsers generated from the four meta-grammars accept
 * and reject small samples. This file checks the much stronger property that makes
 * rdp-gen self-hosting:
 *
 *   1. rdp-gen generates a parser P from a meta-grammar M (written in EBNF or ABNF).
 *   2. P reads a real grammar file G (its own source text included) and yields a parse tree.
 *   3. The tree is converted to a {@link GrammarAST}; it must equal what the hand-written
 *      `EBNFParser` / `ABNFParser` produce for G.
 *   4. rdp-gen generates a parser from that AST, and the emitted source must be
 *      byte-for-byte the source it generates when it reads G itself.
 *
 * Step 4 is the fixpoint: a grammar read by a generated parser rebuilds the same parser.
 * Every grammar below is read as raw text — comments, indentation, continuation lines
 * and the trailing newline included.
 */

import {
  generateParser,
  generateParserFromAST,
  EBNFParser,
  ABNFParser,
} from '../generator/index.js'
import type { GrammarAST } from '../generator/index.js'
import {
  ebnfMetaEBNF,
  ebnfMetaABNF,
  abnfMetaEBNF,
  abnfMetaABNF,
  arithEBNF,
} from '../grammars/index.js'
import { compileAndImport } from '../__testUtils__/generator-runtime.js'
import { ebnfTreeToAst, abnfTreeToAst } from '../__testUtils__/meta-tree-to-ast.js'

type Format = 'ebnf' | 'abnf'
type Reader = { parse(input: string): unknown }

/** Generate a parser with rdp-gen, compile it, and return the parser class. */
async function build(source: string, format: Format, name: string): Promise<Reader> {
  const exports = await compileAndImport(generateParser(source, { format, parserName: name }))
  return exports[name] as Reader
}

/**
 * The four meta-grammars. Each describes the syntax of `reads`, so a parser generated
 * from it reads grammars of that language.
 */
const META = [
  { name: 'EBNF in EBNF', source: ebnfMetaEBNF, written: 'ebnf', reads: 'ebnf' },
  { name: 'EBNF in ABNF', source: ebnfMetaABNF, written: 'abnf', reads: 'ebnf' },
  { name: 'ABNF in EBNF', source: abnfMetaEBNF, written: 'ebnf', reads: 'abnf' },
  { name: 'ABNF in ABNF', source: abnfMetaABNF, written: 'abnf', reads: 'abnf' },
] as const satisfies ReadonlyArray<{
  name: string
  source: string
  written: Format
  reads: Format
}>

/** Every grammar in the repo, by language: real files, not synthetic samples. */
const CORPUS: Record<Format, ReadonlyArray<{ name: string; source: string }>> = {
  ebnf: [
    { name: 'ebnf-meta.ebnf', source: ebnfMetaEBNF },
    { name: 'abnf-meta.ebnf', source: abnfMetaEBNF },
    { name: 'arith.ebnf', source: arithEBNF },
  ],
  abnf: [
    { name: 'ebnf-meta.abnf', source: ebnfMetaABNF },
    { name: 'abnf-meta.abnf', source: abnfMetaABNF },
  ],
}

const handWritten = (format: Format, source: string): GrammarAST =>
  format === 'ebnf' ? EBNFParser.parse(source) : ABNFParser.parse(source)

const treeToAst = (format: Format, tree: unknown): GrammarAST =>
  format === 'ebnf' ? ebnfTreeToAst(tree) : abnfTreeToAst(tree)

describe.each(META)('bootstrap loop — $name', (meta) => {
  let reader!: Reader

  beforeAll(async () => {
    reader = await build(meta.source, meta.written, 'MetaReader')
  })

  describe.each(CORPUS[meta.reads])('reading $name', (target) => {
    it('yields the same AST as the hand-written parser', () => {
      const fromTree = treeToAst(meta.reads, reader.parse(target.source))
      expect(fromTree).toEqual(handWritten(meta.reads, target.source))
    })

    it('regenerates the identical parser from that AST (fixpoint)', () => {
      const fromTree = treeToAst(meta.reads, reader.parse(target.source))
      const options = { parserName: 'LoopParser' }
      expect(generateParserFromAST(fromTree, options)).toBe(
        generateParser(target.source, { format: meta.reads, ...options }),
      )
    })
  })
})

// ── What the meta-grammars accept ─────────────────────────────────────────────

describe('meta-grammar syntax coverage', () => {
  const readers = {} as Record<(typeof META)[number]['name'], Reader>

  beforeAll(async () => {
    for (const m of META) readers[m.name] = await build(m.source, m.written, 'MetaReader')
  })

  const accepts = (names: ReadonlyArray<keyof typeof readers>, input: string): boolean[] =>
    names.map((n) => {
      try {
        readers[n].parse(input)
        return true
      } catch {
        return false
      }
    })

  const EBNF_READERS = ['EBNF in EBNF', 'EBNF in ABNF'] as const
  const ABNF_READERS = ['ABNF in EBNF', 'ABNF in ABNF'] as const

  describe('EBNF', () => {
    it.each([
      ['a trailing newline', "A = 'a';\n"],
      ['trailing blank lines and spaces', "A = 'a';  \n\n  "],
      ['a leading comment', "(* hi *)\nA = 'a';"],
      ['a trailing comment', "A = 'a'; (* end *)\n"],
      ['comments between tokens', "A (* x *) = (* y *) 'a' (* z *) ;"],
      ['an empty comment', "(**)A = 'a';"],
      ['stars inside comments', "(* ** *) (*** *) (* a * b *) (* x **) A = 'a';"],
      ['parentheses and quotes inside a comment', "(* (a) ( b ) it's \"q\" *)A = 'a';"],
      ['a comment after the last rule', "A = B;\nB = 'b';\n(* t *)\n"],
    ])('accepts %s', (_label, input) => {
      expect(accepts(EBNF_READERS, input)).toEqual([true, true])
      expect(() => EBNFParser.parse(input)).not.toThrow()
    })

    it.each([
      ['an unterminated comment', "(* oops\nA = 'a';"],
      ['a grammar with no rules', '(* only a comment *)'],
      ['a missing semicolon', "A = 'a'"],
    ])('rejects %s', (_label, input) => {
      expect(accepts(EBNF_READERS, input)).toEqual([false, false])
      expect(() => EBNFParser.parse(input)).toThrow()
    })

    it('does not nest comments (the hand-written parser does)', () => {
      const input = "(* a (* b *) c *)A = 'a';"
      expect(accepts(EBNF_READERS, input)).toEqual([false, false])
      expect(() => EBNFParser.parse(input)).not.toThrow()
    })
  })

  describe('ABNF', () => {
    it.each([
      ['a trailing newline', 'a = "x"\n'],
      ['blank lines between rules', 'a = "x"\n\nb = a\n'],
      ['an alternation continued on the next line', 'a = "x"\n    / "y"\n'],
      ['a continuation inside a group', 'a = ( "x"\n   "y" )\n'],
      ['a continuation before and after =', 'a\n  = "x"\n'],
      ['a continuation after =', 'a =\n  "x"\n'],
      ['a tab-indented continuation', 'a = "x"\n\t/ "y"\n'],
      ['several continuation lines', 'a = "x"\n  / "y"\n  / "z"\n'],
      ['a comment at the end of a line', 'a = "x" ; note\nb = a\n'],
      ['a comment line between rules', 'a = "x"\n; mid\nb = a\n'],
      ['a comment line inside a continuation', 'a = "x"\n  ; c\n  / "y"\n'],
      ['a comment at EOF without a newline', 'a = "x" ; end'],
      ['a leading comment', '; hdr\na = "x"\n'],
      ['CRLF line endings', 'a = "x"\r\n  / "y"\r\nb = a\r\n'],
      ['character values on a continuation line', 'a = %x41-5A\n  / %d97 / %B1\n'],
      ['an indented first rule', '  a = "x"\n'],
    ])('accepts %s', (_label, input) => {
      expect(accepts(ABNF_READERS, input)).toEqual([true, true])
      expect(() => ABNFParser.parse(input)).not.toThrow()
    })

    it.each([
      ['a missing =', 'a "x"'],
      ['an unterminated string', 'a = "x'],
      ['no rules', '; only a comment\n'],
    ])('rejects %s', (_label, input) => {
      expect(accepts(ABNF_READERS, input)).toEqual([false, false])
      expect(() => ABNFParser.parse(input)).toThrow()
    })

    it('reads an indented later rule as a continuation, per RFC 5234 (the hand-written parser does not)', () => {
      const input = 'a = "x"\n  b = "y"\n'
      expect(accepts(ABNF_READERS, input)).toEqual([false, false])
      expect(() => ABNFParser.parse(input)).not.toThrow()
    })
  })
})
