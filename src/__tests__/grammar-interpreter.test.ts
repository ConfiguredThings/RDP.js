import { GrammarInterpreter } from '../grammar-interpreter.js'
import { TraceObserver } from '../observable.js'
import type { GrammarAST, RuleBody } from '../generator/ast.js'

// ── Helpers ────────────────────────────────────────────────────────────────

/** Wrap a string in a DataView over its UTF-8 bytes. */
function dv(input: string): DataView {
  return new DataView(new TextEncoder().encode(input).buffer)
}

/** Build a minimal GrammarAST from (name, body) pairs. */
function grammar(...rules: [string, RuleBody][]): GrammarAST {
  return { rules: rules.map(([name, body]) => ({ name, body })) }
}

/** Parse `input` against `ast` and return the boolean result. */
function parse(ast: GrammarAST, input: string): boolean {
  return new GrammarInterpreter(ast, dv(input)).parse()
}

/** Shorthand rule bodies. */
const terminal = (value: string): RuleBody => ({ kind: 'terminal', value })
const nonTerminal = (name: string): RuleBody => ({ kind: 'nonTerminal', name })
const seq = (...items: RuleBody[]): RuleBody => ({ kind: 'sequence', items })
const alt = (...items: RuleBody[]): RuleBody => ({ kind: 'alternation', items })
const opt = (item: RuleBody): RuleBody => ({ kind: 'optional', item })
const star = (item: RuleBody): RuleBody => ({ kind: 'zeroOrMore', item })
const plus = (item: RuleBody): RuleBody => ({ kind: 'oneOrMore', item })
const rep = (min: number, max: number | null, item: RuleBody): RuleBody => ({
  kind: 'repetition',
  min,
  max,
  item,
})

// ── parse() ────────────────────────────────────────────────────────────────

describe('parse()', () => {
  it('returns false for an empty grammar (no rules)', () => {
    expect(parse({ rules: [] }, 'hello')).toBe(false)
  })

  it('returns false when the entry rule does not match', () => {
    const g = grammar(['R', terminal('x')])
    expect(parse(g, 'y')).toBe(false)
  })

  it('returns false when the entry rule matches but input remains', () => {
    const g = grammar(['R', terminal('a')])
    expect(parse(g, 'ab')).toBe(false)
  })

  it('returns true when the entry rule matches the full input', () => {
    const g = grammar(['R', terminal('hello')])
    expect(parse(g, 'hello')).toBe(true)
  })

  it('returns true on empty input when the rule permits empty match', () => {
    const g = grammar(['R', star(terminal('a'))])
    expect(parse(g, '')).toBe(true)
  })
})

// ── matchRule() ────────────────────────────────────────────────────────────

describe('matchRule() / nonTerminal references', () => {
  it('returns false and emits no events for an undefined rule name', () => {
    const obs = new TraceObserver()
    const g = grammar(['Entry', nonTerminal('Missing')])
    const result = new GrammarInterpreter(g, dv('x')).withObserver(obs).parse()
    expect(result).toBe(false)
    // 'Entry' fires enter/exit, 'Missing' fires nothing
    expect(obs.events.some((e) => e.kind === 'enter' && e.production === 'Missing')).toBe(false)
  })

  it('fires enter then exit(true) events when the rule matches', () => {
    const obs = new TraceObserver()
    const g = grammar(['R', terminal('a')])
    new GrammarInterpreter(g, dv('a')).withObserver(obs).parse()
    expect(obs.events[0]).toMatchObject({ kind: 'enter', production: 'R' })
    expect(obs.events[1]).toMatchObject({ kind: 'exit', production: 'R', matched: true })
  })

  it('fires enter then exit(false) and restores position when the rule fails', () => {
    const obs = new TraceObserver()
    const g = grammar(['Entry', seq(nonTerminal('A'), terminal('z'))], ['A', terminal('a')])
    const interp = new GrammarInterpreter(g, dv('ab'))
    interp.withObserver(obs).parse()
    const aExit = obs.events.find((e) => e.kind === 'exit' && e.production === 'A')
    // 'A' matches 'a', position advances; but 'z' then fails so Entry backtracks
    expect(aExit).toMatchObject({ kind: 'exit', production: 'A', matched: true })
    const entryExit = obs.events.find((e) => e.kind === 'exit' && e.production === 'Entry')
    expect(entryExit).toMatchObject({ kind: 'exit', matched: false })
  })

  it('resolves multi-level rule references', () => {
    const g = grammar(['Outer', nonTerminal('Inner')], ['Inner', terminal('hi')])
    expect(parse(g, 'hi')).toBe(true)
  })
})

// ── sequence ───────────────────────────────────────────────────────────────

describe('sequence', () => {
  it('matches an empty sequence', () => {
    const g = grammar(['R', seq()])
    expect(parse(g, '')).toBe(true)
  })

  it('matches when all items succeed', () => {
    const g = grammar(['R', seq(terminal('a'), terminal('b'))])
    expect(parse(g, 'ab')).toBe(true)
  })

  it('fails and restores position when the first item fails', () => {
    const g = grammar(['R', seq(terminal('a'), terminal('b'))])
    expect(parse(g, 'xb')).toBe(false)
  })

  it('fails and restores position when a later item fails', () => {
    const g = grammar(['R', seq(terminal('a'), terminal('b'))])
    // 'a' is consumed then 'b' fails; position should be restored to 0
    expect(parse(g, 'ax')).toBe(false)
  })
})

// ── alternation ────────────────────────────────────────────────────────────

describe('alternation', () => {
  it('succeeds on the first matching alternative', () => {
    const g = grammar(['R', alt(terminal('a'), terminal('b'))])
    expect(parse(g, 'a')).toBe(true)
  })

  it('falls through to the second alternative when the first fails', () => {
    const g = grammar(['R', alt(terminal('a'), terminal('b'))])
    expect(parse(g, 'b')).toBe(true)
  })

  it('fails when no alternative matches', () => {
    const g = grammar(['R', alt(terminal('a'), terminal('b'))])
    expect(parse(g, 'c')).toBe(false)
  })

  it('restores position before trying each alternative', () => {
    // First alt consumes 'a' and then fails on 'b'; second alt must restart at 0
    const g = grammar(['R', alt(seq(terminal('a'), terminal('b')), terminal('ac'))])
    expect(parse(g, 'ac')).toBe(true)
  })
})

// ── optional ───────────────────────────────────────────────────────────────

describe('optional', () => {
  it('succeeds and advances when the inner item matches', () => {
    const g = grammar(['R', seq(opt(terminal('a')), terminal('b'))])
    expect(parse(g, 'ab')).toBe(true)
  })

  it('succeeds without advancing when the inner item does not match', () => {
    const g = grammar(['R', seq(opt(terminal('a')), terminal('b'))])
    expect(parse(g, 'b')).toBe(true)
  })
})

// ── zeroOrMore ─────────────────────────────────────────────────────────────

describe('zeroOrMore', () => {
  it('succeeds with zero iterations', () => {
    const g = grammar(['R', star(terminal('a'))])
    expect(parse(g, '')).toBe(true)
  })

  it('succeeds with one iteration', () => {
    const g = grammar(['R', star(terminal('a'))])
    expect(parse(g, 'a')).toBe(true)
  })

  it('succeeds with multiple iterations', () => {
    const g = grammar(['R', star(terminal('a'))])
    expect(parse(g, 'aaa')).toBe(true)
  })

  it('stops at the first non-matching byte', () => {
    const g = grammar(['R', seq(star(terminal('a')), terminal('b'))])
    expect(parse(g, 'aaab')).toBe(true)
  })
})

// ── oneOrMore ──────────────────────────────────────────────────────────────

describe('oneOrMore', () => {
  it('fails with zero iterations', () => {
    const g = grammar(['R', plus(terminal('a'))])
    expect(parse(g, '')).toBe(false)
  })

  it('succeeds with exactly one iteration', () => {
    const g = grammar(['R', plus(terminal('a'))])
    expect(parse(g, 'a')).toBe(true)
  })

  it('succeeds with multiple iterations', () => {
    const g = grammar(['R', plus(terminal('a'))])
    expect(parse(g, 'aaa')).toBe(true)
  })
})

// ── repetition ─────────────────────────────────────────────────────────────

describe('repetition', () => {
  it('fails when input provides fewer than min occurrences', () => {
    const g = grammar(['R', rep(3, null, terminal('a'))])
    expect(parse(g, 'aa')).toBe(false)
  })

  it('succeeds when input has exactly min occurrences (unbounded max)', () => {
    const g = grammar(['R', rep(2, null, terminal('a'))])
    expect(parse(g, 'aa')).toBe(true)
  })

  it('succeeds when input exceeds min (unbounded max)', () => {
    const g = grammar(['R', rep(1, null, terminal('a'))])
    expect(parse(g, 'aaaa')).toBe(true)
  })

  it('succeeds with min=0 and zero occurrences', () => {
    const g = grammar(['R', rep(0, null, terminal('a'))])
    expect(parse(g, '')).toBe(true)
  })

  it('stops at max and does not consume the extra occurrence', () => {
    // max=2 — should consume exactly 2 'a's, leaving the 3rd
    const g = grammar(['R', seq(rep(0, 2, terminal('a')), terminal('b'))])
    expect(parse(g, 'aab')).toBe(true)
  })

  it('stops when item fails before reaching max', () => {
    const g = grammar(['R', seq(rep(0, 5, terminal('a')), terminal('b'))])
    expect(parse(g, 'ab')).toBe(true)
  })

  it('exits the optional loop via the count >= max condition', () => {
    // Exactly max=3 'a's available — loop exits by condition not by item failure
    const g = grammar(['R', rep(0, 3, terminal('a'))])
    expect(parse(g, 'aaa')).toBe(true)
  })
})

// ── terminal ───────────────────────────────────────────────────────────────

describe('terminal', () => {
  it('matches an exact single-character literal', () => {
    const g = grammar(['R', terminal('x')])
    expect(parse(g, 'x')).toBe(true)
  })

  it('fails on a wrong character', () => {
    const g = grammar(['R', terminal('x')])
    expect(parse(g, 'y')).toBe(false)
  })

  it('matches a multi-character literal', () => {
    const g = grammar(['R', terminal('abc')])
    expect(parse(g, 'abc')).toBe(true)
  })

  it('fails and restores position on a partial multi-character match', () => {
    // 'a' matches, 'b' fails — position must be restored to 0
    const g = grammar(['R', alt(terminal('ab'), terminal('ac'))])
    expect(parse(g, 'ac')).toBe(true)
  })

  it('matches an empty terminal (always succeeds, consumes nothing)', () => {
    const g = grammar(['R', seq(terminal(''), terminal('a'))])
    expect(parse(g, 'a')).toBe(true)
  })
})

// ── charValue ──────────────────────────────────────────────────────────────

describe('charValue (range)', () => {
  const rangeBody = (lo: number, hi: number): RuleBody => ({
    kind: 'charValue',
    encoding: 'x',
    codepoints: [],
    range: [lo, hi],
  })

  it('matches a byte within the range', () => {
    const g = grammar(['R', rangeBody(0x61, 0x7a)]) // a–z
    expect(parse(g, 'm')).toBe(true)
  })

  it('fails at end of input (null peek)', () => {
    const g = grammar(['R', rangeBody(0x61, 0x7a)])
    expect(parse(g, '')).toBe(false)
  })

  it('fails when byte is below the range', () => {
    const g = grammar(['R', rangeBody(0x62, 0x7a)]) // b–z
    expect(parse(g, 'a')).toBe(false) // 0x61 < 0x62
  })

  it('fails when byte is above the range', () => {
    const g = grammar(['R', rangeBody(0x61, 0x79)]) // a–y
    expect(parse(g, 'z')).toBe(false) // 0x7a > 0x79
  })
})

describe('charValue (codepoints)', () => {
  const cpBody = (...codepoints: number[]): RuleBody => ({
    kind: 'charValue',
    encoding: 'x',
    codepoints,
  })

  it('matches an empty codepoints array (consumes nothing)', () => {
    const g = grammar(['R', seq(cpBody(), terminal('a'))])
    expect(parse(g, 'a')).toBe(true)
  })

  it('matches a single codepoint', () => {
    const g = grammar(['R', cpBody(0x61)]) // 'a'
    expect(parse(g, 'a')).toBe(true)
  })

  it('fails on a non-matching single codepoint', () => {
    const g = grammar(['R', cpBody(0x61)])
    expect(parse(g, 'b')).toBe(false)
  })

  it('matches a sequence of codepoints', () => {
    const g = grammar(['R', cpBody(0x61, 0x62)]) // 'ab'
    expect(parse(g, 'ab')).toBe(true)
  })

  it('fails and restores position on a partial codepoints match', () => {
    // 0x61 matches, 0x62 fails → position restored; alternation picks 'ac'
    const g = grammar(['R', alt(cpBody(0x61, 0x62), cpBody(0x61, 0x63))])
    expect(parse(g, 'ac')).toBe(true)
  })
})

// ── coreRule ───────────────────────────────────────────────────────────────

const cr = (name: string): RuleBody => ({
  kind: 'coreRule',
  name: name as import('../generator/ast.js').CoreRuleName,
})

function coreMatch(ruleName: string, input: string): boolean {
  return parse(grammar(['R', cr(ruleName)]), input)
}

describe('coreRule ALPHA', () => {
  it('matches an uppercase letter', () => {
    expect(coreMatch('ALPHA', 'A')).toBe(true)
  })
  it('matches a lowercase letter', () => {
    expect(coreMatch('ALPHA', 'z')).toBe(true)
  })
  it('fails on a digit', () => {
    expect(coreMatch('ALPHA', '0')).toBe(false)
  })
})

describe('coreRule BIT', () => {
  it('matches "0"', () => {
    expect(coreMatch('BIT', '0')).toBe(true)
  })
  it('matches "1"', () => {
    expect(coreMatch('BIT', '1')).toBe(true)
  })
  it('fails on "2"', () => {
    expect(coreMatch('BIT', '2')).toBe(false)
  })
})

describe('coreRule CHAR', () => {
  it('matches 0x01', () => {
    expect(parse(grammar(['R', cr('CHAR')]), '\x01')).toBe(true)
  })
  it('matches 0x7F (DEL)', () => {
    expect(parse(grammar(['R', cr('CHAR')]), '\x7f')).toBe(true)
  })
  it('fails on 0x00 (NUL)', () => {
    expect(parse(grammar(['R', cr('CHAR')]), '\x00')).toBe(false)
  })
})

describe('coreRule CR', () => {
  it('matches \\r', () => {
    expect(coreMatch('CR', '\r')).toBe(true)
  })
  it('fails on \\n', () => {
    expect(coreMatch('CR', '\n')).toBe(false)
  })
})

describe('coreRule CRLF', () => {
  it('matches \\r\\n', () => {
    expect(coreMatch('CRLF', '\r\n')).toBe(true)
  })
  it('fails on \\r alone (no LF follows)', () => {
    expect(coreMatch('CRLF', '\r')).toBe(false)
  })
  it('fails on \\r followed by non-LF', () => {
    expect(coreMatch('CRLF', '\rX')).toBe(false)
  })
  it('fails on a non-CR character', () => {
    expect(coreMatch('CRLF', 'X')).toBe(false)
  })
})

describe('coreRule CTL', () => {
  it('matches 0x00', () => {
    expect(parse(grammar(['R', cr('CTL')]), '\x00')).toBe(true)
  })
  it('matches 0x1F', () => {
    expect(parse(grammar(['R', cr('CTL')]), '\x1f')).toBe(true)
  })
  it('matches 0x7F (DEL)', () => {
    expect(parse(grammar(['R', cr('CTL')]), '\x7f')).toBe(true)
  })
  it('fails on 0x20 (SP)', () => {
    expect(coreMatch('CTL', ' ')).toBe(false)
  })
})

describe('coreRule DIGIT', () => {
  it('matches "5"', () => {
    expect(coreMatch('DIGIT', '5')).toBe(true)
  })
  it('fails on "a"', () => {
    expect(coreMatch('DIGIT', 'a')).toBe(false)
  })
})

describe('coreRule DQUOTE', () => {
  it("matches '\"'", () => {
    expect(coreMatch('DQUOTE', '"')).toBe(true)
  })
  it('fails on "a"', () => {
    expect(coreMatch('DQUOTE', 'a')).toBe(false)
  })
})

describe('coreRule HEXDIG', () => {
  it('matches a decimal digit', () => {
    expect(coreMatch('HEXDIG', '9')).toBe(true)
  })
  it('matches an uppercase hex A–F', () => {
    expect(coreMatch('HEXDIG', 'F')).toBe(true)
  })
  it('matches a lowercase hex a–f', () => {
    expect(coreMatch('HEXDIG', 'f')).toBe(true)
  })
  it('fails on "G"', () => {
    expect(coreMatch('HEXDIG', 'G')).toBe(false)
  })
})

describe('coreRule HTAB', () => {
  it('matches a horizontal tab', () => {
    expect(coreMatch('HTAB', '\t')).toBe(true)
  })
  it('fails on a space', () => {
    expect(coreMatch('HTAB', ' ')).toBe(false)
  })
})

describe('coreRule LF', () => {
  it('matches \\n', () => {
    expect(coreMatch('LF', '\n')).toBe(true)
  })
  it('fails on \\r', () => {
    expect(coreMatch('LF', '\r')).toBe(false)
  })
})

describe('coreRule LWSP', () => {
  const lwspGrammar = grammar(['R', cr('LWSP')])

  it('matches empty input (zero occurrences)', () => {
    expect(parse(lwspGrammar, '')).toBe(true)
  })

  it('matches a single space', () => {
    expect(parse(lwspGrammar, ' ')).toBe(true)
  })

  it('matches a horizontal tab', () => {
    expect(parse(lwspGrammar, '\t')).toBe(true)
  })

  it('matches a sequence of mixed WSP characters', () => {
    expect(parse(lwspGrammar, ' \t ')).toBe(true)
  })

  it('matches CRLF followed by WSP (folded whitespace)', () => {
    expect(parse(grammar(['R', seq(cr('LWSP'), terminal('x'))]), '\r\n x')).toBe(true)
  })

  it('matches CRLF followed by HTAB (folded whitespace)', () => {
    expect(parse(grammar(['R', seq(cr('LWSP'), terminal('x'))]), '\r\n\tx')).toBe(true)
  })

  it('does not consume a CRLF not followed by WSP', () => {
    // CRLF without WSP after is not part of LWSP; the loop breaks after 0 chars
    expect(parse(grammar(['R', seq(cr('LWSP'), terminal('\r\n'))]), '\r\n')).toBe(true)
  })

  it('does not consume a lone CR (no following LF)', () => {
    expect(parse(grammar(['R', seq(cr('LWSP'), terminal('\r'))]), '\r')).toBe(true)
  })

  it('matches zero characters when input starts with a non-LWSP byte', () => {
    // LWSP succeeds consuming nothing; the trailing 'x' is checked separately
    expect(parse(grammar(['R', seq(cr('LWSP'), terminal('x'))]), 'x')).toBe(true)
  })
})

describe('coreRule OCTET', () => {
  it('matches any byte', () => {
    expect(coreMatch('OCTET', 'X')).toBe(true)
  })

  it('fails on empty input', () => {
    expect(coreMatch('OCTET', '')).toBe(false)
  })
})

describe('coreRule SP', () => {
  it('matches a space', () => {
    expect(coreMatch('SP', ' ')).toBe(true)
  })
  it('fails on a tab', () => {
    expect(coreMatch('SP', '\t')).toBe(false)
  })
})

describe('coreRule VCHAR', () => {
  it('matches "!" (0x21)', () => {
    expect(coreMatch('VCHAR', '!')).toBe(true)
  })
  it('matches "~" (0x7E)', () => {
    expect(coreMatch('VCHAR', '~')).toBe(true)
  })
  it('fails on SP (0x20)', () => {
    expect(coreMatch('VCHAR', ' ')).toBe(false)
  })
  it('fails on DEL (0x7F)', () => {
    expect(parse(grammar(['R', cr('VCHAR')]), '\x7f')).toBe(false)
  })
})

describe('coreRule WSP', () => {
  it('matches a space', () => {
    expect(coreMatch('WSP', ' ')).toBe(true)
  })
  it('matches a tab', () => {
    expect(coreMatch('WSP', '\t')).toBe(true)
  })
  it('fails on a letter', () => {
    expect(coreMatch('WSP', 'a')).toBe(false)
  })
})

// ── EOF / null-peek edge cases ─────────────────────────────────────────────

describe('end-of-input handling', () => {
  const eoRules: Array<[string, string]> = [
    ['ALPHA', ''],
    ['BIT', ''],
    ['CHAR', ''],
    ['CR', ''],
    ['CRLF', ''],
    ['CTL', ''],
    ['DIGIT', ''],
    ['DQUOTE', ''],
    ['HEXDIG', ''],
    ['HTAB', ''],
    ['LF', ''],
    ['SP', ''],
    ['VCHAR', ''],
    ['WSP', ''],
  ]

  it.each(eoRules)('coreRule %s fails on empty input', (ruleName) => {
    expect(coreMatch(ruleName, '')).toBe(false)
  })

  it('LWSP succeeds on empty input (matches zero characters)', () => {
    expect(coreMatch('LWSP', '')).toBe(true)
  })

  it('OCTET fails on empty input', () => {
    expect(coreMatch('OCTET', '')).toBe(false)
  })
})

// ── Observer integration ───────────────────────────────────────────────────

describe('observer integration', () => {
  it('emits correct enter/exit events for a multi-rule grammar', () => {
    const g = grammar(
      ['Expr', seq(nonTerminal('Num'), terminal('+'), nonTerminal('Num'))],
      ['Num', plus({ kind: 'coreRule', name: 'DIGIT' })],
    )
    const obs = new TraceObserver()
    new GrammarInterpreter(g, dv('1+2')).withObserver(obs).parse()

    const enters = obs.events.filter((e) => e.kind === 'enter').map((e) => e.production)
    expect(enters).toContain('Expr')
    expect(enters).toContain('Num')
  })

  it('records failed exits when a production backtracks', () => {
    const g = grammar(['R', alt(seq(terminal('a'), terminal('b')), terminal('ac'))])
    const obs = new TraceObserver()
    new GrammarInterpreter(g, dv('ac')).withObserver(obs).parse()
    // No explicit named rules other than R — just ensure it parses and observer runs
    const exits = obs.events.filter((e) => e.kind === 'exit')
    expect(exits.length).toBeGreaterThan(0)
  })

  it('passes the observer to nested rule calls', () => {
    const g = grammar(['Outer', nonTerminal('Inner')], ['Inner', terminal('x')])
    const obs = new TraceObserver()
    new GrammarInterpreter(g, dv('x')).withObserver(obs).parse()
    const enters = obs.events.filter((e) => e.kind === 'enter')
    expect(enters.some((e) => e.kind === 'enter' && e.production === 'Outer')).toBe(true)
    expect(enters.some((e) => e.kind === 'enter' && e.production === 'Inner')).toBe(true)
  })
})
