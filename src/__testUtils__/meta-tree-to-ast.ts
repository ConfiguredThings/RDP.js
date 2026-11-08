/**
 * Convert the parse trees produced by parsers generated from the meta-grammars
 * (`ebnf-meta.*`, `abnf-meta.*`) into a {@link GrammarAST}.
 *
 * This is the missing step that closes the bootstrap loop: a parser that rdp-gen
 * generated reads a grammar, and its tree is turned back into the same AST the
 * hand-written `EBNFParser` / `ABNFParser` produce, which rdp-gen can then generate
 * a parser from again.
 *
 * The four generated parsers have different tree shapes (field names and nesting depend
 * on how each meta-grammar is written), but they share rule-derived `kind` names. These
 * converters therefore locate children by `kind` and ignore everything else — whitespace,
 * comments, separators and punctuation never reach the AST.
 *
 * The conversions deliberately mirror the hand-written parsers' normalisation:
 * single-item sequences/alternations collapse, groups disappear, `n * P` expands to a
 * sequence of `n` copies, and an ABNF name is a core rule only if the grammar does not
 * define a rule of that name.
 */

import type { GrammarAST, ProductionRule, RuleBody, CoreRuleName } from '../generator/ast.js'

type Node = { kind: string } & Record<string, unknown>

const isNode = (x: unknown): x is Node =>
  typeof x === 'object' && x !== null && !Array.isArray(x) && typeof (x as Node).kind === 'string'

/** Child values of a node or array, in parse order. */
function childValues(x: unknown): unknown[] {
  if (Array.isArray(x)) return x
  if (typeof x === 'object' && x !== null) {
    // `kind` labels the node; it is not part of the parsed text.
    return Object.entries(x as Record<string, unknown>)
      .filter(([key]) => key !== 'kind')
      .map(([, value]) => value)
  }
  return []
}

/**
 * The nearest descendants of `x` whose kind is in `kinds`, in parse order.
 * The search does not descend into a match, so nested structures (a group's own
 * sequences, say) are not mistaken for the caller's.
 */
function collect(x: unknown, ...kinds: string[]): Node[] {
  const out: Node[] = []
  const visit = (v: unknown): void => {
    if (isNode(v) && kinds.includes(v.kind)) {
      out.push(v)
      return
    }
    for (const c of childValues(v)) visit(c)
  }
  for (const c of childValues(x)) visit(c)
  return out
}

/** Every string leaf in `x`, concatenated in parse order. */
function leafText(x: unknown): string {
  if (typeof x === 'string') return x
  return childValues(x).map(leafText).join('')
}

function must<T>(v: T | undefined, what: string): T {
  if (v === undefined) throw new Error(`meta tree is missing ${what}`)
  return v
}

const ESCAPES: Record<string, string> = {
  n: '\n',
  t: '\t',
  r: '\r',
  '\\': '\\',
  "'": "'",
  '"': '"',
}

/** Decode the characters of an EBNF string literal (`SqChr`/`DqChr`/`SqChar`/`DqChar` nodes). */
function ebnfLiteralValue(literal: Node): string {
  return collect(literal, 'SqChr', 'DqChr', 'SqChar', 'DqChar')
    .map((ch) => {
      const raw = leafText(ch)
      return raw.length === 2 && raw.startsWith('\\') ? must(ESCAPES[raw[1] ?? ''], 'escape') : raw
    })
    .join('')
}

const collapse = (kind: 'sequence' | 'alternation', items: RuleBody[]): RuleBody =>
  items.length === 1 ? must(items[0], 'an item') : { kind, items }

// ── EBNF ──────────────────────────────────────────────────────────────────────

function ebnfPrimary(primary: Node): RuleBody {
  const alt = primary['item0']
  if (isNode(alt)) {
    if (alt.kind === 'Literal') return { kind: 'terminal', value: ebnfLiteralValue(alt) }
    return { kind: 'nonTerminal', name: leafText(alt) }
  }
  const obj = alt as Record<string, unknown>
  if ('integer' in obj) {
    const n = parseInt(leafText(obj['integer']), 10)
    if (n === 0) throw new Error('Repetition count must be at least 1')
    const item = ebnfPrimary(must(collect(obj, 'Primary')[0], 'a Primary'))
    return n === 1 ? item : { kind: 'sequence', items: Array.from({ length: n }, () => item) }
  }
  const body = ebnfBody(must(collect(obj, 'Body')[0], 'a Body'))
  switch (obj['item0']) {
    case '{':
      return { kind: 'zeroOrMore', item: body }
    case '[':
      return { kind: 'optional', item: body }
    default:
      return body // '(' grouping
  }
}

function ebnfTerm(term: Node): RuleBody {
  const [first, except] = collect(term, 'Primary')
  const item = ebnfPrimary(must(first, 'a Primary'))
  return except === undefined ? item : { kind: 'exception', item, except: ebnfPrimary(except) }
}

const ebnfSequence = (seq: Node): RuleBody =>
  collapse('sequence', collect(seq, 'Term').map(ebnfTerm))

function ebnfBody(body: Node): RuleBody {
  return collapse('alternation', collect(body, 'Sequence').map(ebnfSequence))
}

/** Convert a tree from `ebnf-meta.ebnf` / `ebnf-meta.abnf` parsers into a {@link GrammarAST}. */
export function ebnfTreeToAst(tree: unknown): GrammarAST {
  const rules = collect(tree, 'Rule').map((rule): ProductionRule => ({
    name: leafText(must(collect(rule, 'Name')[0], 'a rule name')),
    body: ebnfBody(must(collect(rule, 'Body')[0], 'a Body')),
  }))
  return { rules }
}

// ── ABNF ──────────────────────────────────────────────────────────────────────

// prettier-ignore
const CORE_RULES = new Set<string>([
  'ALPHA', 'BIT', 'CHAR', 'CR', 'CRLF', 'CTL', 'DIGIT', 'DQUOTE',
  'HEXDIG', 'HTAB', 'LF', 'LWSP', 'OCTET', 'SP', 'VCHAR', 'WSP',
])

const RADIX = { HexVal: 16, DecVal: 10, BinVal: 2 } as const
const ENCODING = { HexVal: 'x', DecVal: 'd', BinVal: 'b' } as const

function abnfCharValue(charVal: Node): RuleBody {
  const val = must(collect(charVal, 'HexVal', 'DecVal', 'BinVal')[0], 'a char value')
  const kind = val.kind as keyof typeof RADIX
  const codepoint = (cpnt: Node): number => parseInt(leafText(cpnt), RADIX[kind])
  const encoding = ENCODING[kind]
  const cpnts = collect(val, 'HexCpnt', 'DecCpnt', 'BinCpnt').map(codepoint)
  // `item2` is a single `{ '-', Cpnt }` for a range and an array of `{ '.', Cpnt }` otherwise.
  if (!Array.isArray(val['item2'])) {
    const [lo, hi] = cpnts
    return { kind: 'charValue', encoding, codepoints: [], range: [must(lo, 'lo'), must(hi, 'hi')] }
  }
  return { kind: 'charValue', encoding, codepoints: cpnts }
}

function abnfElement(element: Node, defined: ReadonlySet<string>): RuleBody {
  const atom = must(element['item0'] as Node | undefined, 'an element')
  switch (atom.kind) {
    case 'Group':
      return abnfBody(must(collect(atom, 'Body')[0], 'a Body'), defined)
    case 'OptGrp':
      return { kind: 'optional', item: abnfBody(must(collect(atom, 'Body')[0], 'a Body'), defined) }
    case 'CharVal':
      return abnfCharValue(atom)
    case 'Str': {
      const value = collect(atom, 'DChr', 'DChar').map(leafText).join('')
      return /[A-Za-z]/.test(value)
        ? { kind: 'terminal', value, caseInsensitive: true }
        : { kind: 'terminal', value }
    }
    default: {
      const name = leafText(atom)
      return CORE_RULES.has(name) && !defined.has(name)
        ? { kind: 'coreRule', name: name as CoreRuleName }
        : { kind: 'nonTerminal', name }
    }
  }
}

/** An `Item` / `Term`: an optional repeat prefix plus an element. */
function abnfItem(item: Node, defined: ReadonlySet<string>): RuleBody {
  const x = item['item0']
  if (isNode(x)) return abnfElement(x, defined)
  const parts = x as Record<string, unknown>
  const element = abnfElement((parts['factor'] ?? parts['element']) as Node, defined)
  return leafText(parts['rep']) === '*'
    ? { kind: 'zeroOrMore', item: element }
    : { kind: 'oneOrMore', item: element }
}

function abnfBody(body: Node, defined: ReadonlySet<string>): RuleBody {
  const seqs = collect(body, 'Seq', 'Sequence').map((seq) =>
    collapse(
      'sequence',
      collect(seq, 'Item', 'Term').map((item) => abnfItem(item, defined)),
    ),
  )
  return collapse('alternation', seqs)
}

/** Convert a tree from `abnf-meta.ebnf` / `abnf-meta.abnf` parsers into a {@link GrammarAST}. */
export function abnfTreeToAst(tree: unknown): GrammarAST {
  const ruleNodes = collect(tree, 'Rule')
  const nameOf = (rule: Node): string => leafText(must(collect(rule, 'RuleName')[0], 'a rule name'))
  const defined = new Set(ruleNodes.map(nameOf))
  return {
    rules: ruleNodes.map((rule) => ({
      name: nameOf(rule),
      body: abnfBody(must(collect(rule, 'Body')[0], 'a Body'), defined),
    })),
  }
}
