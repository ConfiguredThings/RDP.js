// Benchmark: four parsing strategies for the EBNF meta-grammar.
//
// All four produce an identical GrammarAST; only the pipeline differs:
//   1. Scannerless          — characters → AST directly (current EBNFParser)
//   2. Hand lexer           — characters → typed tokens → AST
//   3. Regex lexer          — regex DFA  → typed tokens → AST
//   4. Tokenizer+classifier — characters → raw spans → typed tokens → AST
//
// Each timed iteration includes every stage of the pipeline.
// Run: node benchmarks/ebnf.bench.mjs   (requires: npm run build)

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { EBNFParser } from '../dist/esm/generator/ebnf-parser.js'
import { TokenRDParser } from '../dist/esm/index.js'

const __dir = dirname(fileURLToPath(import.meta.url))

const INPUTS = {
  'ebnf-meta': readFileSync(join(__dir, '../src/grammars/ebnf-meta.ebnf'), 'utf8'),
  'stress':    readFileSync(join(__dir, 'stress.ebnf'), 'utf8'),
}

// ── Token types ───────────────────────────────────────────────────────────────
const TT = { NAME:0, LIT:1, INT:2, EQ:3, SEMI:4, PIPE:5, COMMA:6,
             LBRACE:7, RBRACE:8, LBRACKET:9, RBRACKET:10,
             LPAREN:11, RPAREN:12, STAR:13, MINUS:14, EOF:15 }

// ── Approach 1: Scannerless ───────────────────────────────────────────────────
// Existing EBNFParser — no changes.

// ── Shared token-stream parser (approaches 2, 3, 4) ──────────────────────────
// Mirrors EBNFParser's grammar logic but consumes a pre-classified token stream.
// Whitespace/comments are already stripped by the lexer stage so no skipWsp calls.

class TokenParser extends TokenRDParser {
  constructor(stream) { super(stream) }

  parse() {
    const rules = []
    while (!this.atEnd()) rules.push(this.#rule())
    if (!rules.length) throw new Error('Expected at least one rule')
    return { rules }
  }

  #rule() {
    const name = this.#name()
    this.eatToken(TT.EQ)
    const body = this.#body()
    this.eatToken(TT.SEMI)
    return { name, body }
  }

  #body() {
    const first = this.#sequence()
    if (this.peekToken() !== TT.PIPE) return first
    const items = [first]
    while (this.peekToken() === TT.PIPE) { this.eatToken(TT.PIPE); items.push(this.#sequence()) }
    return { kind: 'alternation', items }
  }

  #sequence() {
    const items = [this.#term()]
    while (this.peekToken() === TT.COMMA) { this.eatToken(TT.COMMA); items.push(this.#term()) }
    return items.length === 1 ? items[0] : { kind: 'sequence', items }
  }

  #term() {
    const item = this.#primary()
    if (this.peekToken() !== TT.MINUS) return item
    this.eatToken(TT.MINUS)
    return { kind: 'exception', item, except: this.#primary() }
  }

  #primary() {
    const t = this.peekToken()
    if (t === TT.LBRACE)   { this.eatToken(TT.LBRACE);   const b = this.#body(); this.eatToken(TT.RBRACE);   return { kind: 'zeroOrMore', item: b } }
    if (t === TT.LBRACKET) { this.eatToken(TT.LBRACKET); const b = this.#body(); this.eatToken(TT.RBRACKET); return { kind: 'optional',   item: b } }
    if (t === TT.LPAREN)   { this.eatToken(TT.LPAREN);   const b = this.#body(); this.eatToken(TT.RPAREN);   return b }
    if (t === TT.INT) {
      const n = this.eatToken(TT.INT); this.eatToken(TT.STAR)
      const item = this.#primary()
      if (n === 0) throw new Error('Repetition count must be >= 1')
      if (n === 1) return item
      return { kind: 'sequence', items: Array.from({ length: n }, () => item) }
    }
    if (t === TT.LIT)  return { kind: 'terminal',    value: this.eatToken(TT.LIT) }
    if (t === TT.NAME) return { kind: 'nonTerminal', name:  this.eatToken(TT.NAME) }
    throw new Error(`Unexpected token ${t} at position ${this.getPosition()}`)
  }

  #name() { return this.eatToken(TT.NAME, 'rule name') }
}

// ── Approach 2: Hand-written lexer ────────────────────────────────────────────
// Single pass: reads charCodes, classifies and extracts values immediately.
// Handles nested (* ... *) comments correctly.

function handLex(input) {
  const len = input.length
  const types  = new Int32Array(len + 1)
  const values = new Array(len + 1)
  let ti = 0, i = 0

  while (i < len) {
    const c = input.charCodeAt(i)

    // Whitespace
    if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) { i++; continue }

    // Block comment (* ... *) with nesting
    if (c === 0x28 && input.charCodeAt(i + 1) === 0x2a) {
      i += 2; let depth = 1
      while (i < len && depth > 0) {
        const a = input.charCodeAt(i), b = input.charCodeAt(i + 1)
        if (a === 0x28 && b === 0x2a) { i += 2; depth++; continue }
        if (a === 0x2a && b === 0x29) { i += 2; depth--; continue }
        i++
      }
      continue
    }

    // Identifier / name
    if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a) || c === 0x5f) {
      const s = i++
      while (i < len) {
        const d = input.charCodeAt(i)
        if ((d >= 0x41 && d <= 0x5a) || (d >= 0x61 && d <= 0x7a) || d === 0x5f ||
            (d >= 0x30 && d <= 0x39) || d === 0x2d) i++
        else break
      }
      types[ti] = TT.NAME; values[ti++] = input.slice(s, i); continue
    }

    // Integer
    if (c >= 0x30 && c <= 0x39) {
      let n = c - 0x30; i++
      while (i < len && input.charCodeAt(i) >= 0x30 && input.charCodeAt(i) <= 0x39)
        n = n * 10 + (input.charCodeAt(i++) - 0x30)
      types[ti] = TT.INT; values[ti++] = n; continue
    }

    // String literal (handles escape sequences)
    if (c === 0x27 || c === 0x22) {
      const q = c; i++; let val = ''
      while (i < len && input.charCodeAt(i) !== q) {
        if (input.charCodeAt(i) === 0x5c) {
          i++
          switch (input.charCodeAt(i++)) {
            case 0x6e: val += '\n'; break; case 0x74: val += '\t'; break
            case 0x72: val += '\r'; break; case 0x5c: val += '\\'; break
            case 0x27: val += "'";  break; case 0x22: val += '"';  break
          }
        } else val += input[i++]
      }
      i++ // closing quote
      types[ti] = TT.LIT; values[ti++] = val; continue
    }

    // Single-character operators
    let tt = -1
    switch (c) {
      case 0x3d: tt = TT.EQ;       break; case 0x3b: tt = TT.SEMI;     break
      case 0x7c: tt = TT.PIPE;     break; case 0x2c: tt = TT.COMMA;    break
      case 0x7b: tt = TT.LBRACE;   break; case 0x7d: tt = TT.RBRACE;   break
      case 0x5b: tt = TT.LBRACKET; break; case 0x5d: tt = TT.RBRACKET; break
      case 0x28: tt = TT.LPAREN;   break; case 0x29: tt = TT.RPAREN;   break
      case 0x2a: tt = TT.STAR;     break; case 0x2d: tt = TT.MINUS;    break
    }
    if (tt !== -1) { types[ti] = tt; values[ti++] = null }
    i++
  }

  types[ti] = TT.EOF; values[ti] = null
  return { types, values, len: ti }
}

// ── Approach 3: Regex lexer ───────────────────────────────────────────────────
// Two stages: (1) hand-written comment stripper (regex cannot handle nesting),
// then (2) a single alternating regex — the JS engine compiles this to a DFA.

function stripComments(input) {
  let out = '', i = 0
  const len = input.length
  while (i < len) {
    if (input.charCodeAt(i) === 0x28 && input.charCodeAt(i + 1) === 0x2a) {
      i += 2; let depth = 1
      while (i < len && depth > 0) {
        const a = input.charCodeAt(i), b = input.charCodeAt(i + 1)
        if (a === 0x28 && b === 0x2a) { i += 2; depth++; continue }
        if (a === 0x2a && b === 0x29) { i += 2; depth--; continue }
        i++
      }
    } else { out += input[i++] }
  }
  return out
}

const EBNF_RE = /[ \t\n\r]+|([A-Za-z_][A-Za-z0-9_-]*)|(\d+)|('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")|([=;|,{}\[\]()*-])/g

function regexLex(input) {
  const src = stripComments(input)
  const types  = new Int32Array(src.length + 1)
  const values = new Array(src.length + 1)
  let ti = 0
  EBNF_RE.lastIndex = 0
  let m
  while ((m = EBNF_RE.exec(src)) !== null) {
    if (m[1] !== undefined) {
      types[ti] = TT.NAME; values[ti++] = m[1]
    } else if (m[2] !== undefined) {
      types[ti] = TT.INT; values[ti++] = +m[2]
    } else if (m[3] !== undefined) {
      const raw = m[3]; const q = raw.charCodeAt(0); let val = ''
      for (let j = 1; j < raw.length - 1; j++) {
        if (raw.charCodeAt(j) === 0x5c) {
          j++
          switch (raw.charCodeAt(j)) {
            case 0x6e: val += '\n'; break; case 0x74: val += '\t'; break
            case 0x72: val += '\r'; break; case 0x5c: val += '\\'; break
            case 0x27: val += "'";  break; case 0x22: val += '"';  break
          }
        } else val += raw[j]
      }
      types[ti] = TT.LIT; values[ti++] = val
    } else if (m[4] !== undefined) {
      const c = m[4].charCodeAt(0); let tt = -1
      switch (c) {
        case 0x3d: tt = TT.EQ;       break; case 0x3b: tt = TT.SEMI;     break
        case 0x7c: tt = TT.PIPE;     break; case 0x2c: tt = TT.COMMA;    break
        case 0x7b: tt = TT.LBRACE;   break; case 0x7d: tt = TT.RBRACE;   break
        case 0x5b: tt = TT.LBRACKET; break; case 0x5d: tt = TT.RBRACKET; break
        case 0x28: tt = TT.LPAREN;   break; case 0x29: tt = TT.RPAREN;   break
        case 0x2a: tt = TT.STAR;     break; case 0x2d: tt = TT.MINUS;    break
      }
      if (tt !== -1) { types[ti] = tt; values[ti++] = null }
    }
    // else: whitespace or comment match with no capture group — skip
  }
  types[ti] = TT.EOF; values[ti] = null
  return { types, values, len: ti }
}

// ── Approach 4: Raw span tokenizer → classifier → parser ─────────────────────
// Stage 1 (tokenizer): identifies token boundaries and raw categories only —
//   no string allocation, no escape-sequence processing, no type mapping.
// Stage 2 (classifier): maps raw spans to typed tokens, decodes string values.
// Stage 3: same TokenParser as approaches 2 & 3.

const RK = { WORD:0, NUMBER:1, STRING:2, PUNCT:3 }

function spanTokenize(input) {
  const len = input.length
  // flat: [start, end, rawKind] per token — 3 ints each
  const buf = new Int32Array(len * 3)
  let si = 0, i = 0

  while (i < len) {
    const c = input.charCodeAt(i)

    if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) { i++; continue }

    // Block comment — skip entirely (no span recorded)
    if (c === 0x28 && input.charCodeAt(i + 1) === 0x2a) {
      i += 2; let depth = 1
      while (i < len && depth > 0) {
        const a = input.charCodeAt(i), b = input.charCodeAt(i + 1)
        if (a === 0x28 && b === 0x2a) { i += 2; depth++; continue }
        if (a === 0x2a && b === 0x29) { i += 2; depth--; continue }
        i++
      }
      continue
    }

    // Word
    if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a) || c === 0x5f) {
      const s = i++
      while (i < len) {
        const d = input.charCodeAt(i)
        if ((d >= 0x41 && d <= 0x5a) || (d >= 0x61 && d <= 0x7a) || d === 0x5f ||
            (d >= 0x30 && d <= 0x39) || d === 0x2d) i++
        else break
      }
      buf[si++] = s; buf[si++] = i; buf[si++] = RK.WORD; continue
    }

    // Number — store span only, no parsing yet
    if (c >= 0x30 && c <= 0x39) {
      const s = i++
      while (i < len && input.charCodeAt(i) >= 0x30 && input.charCodeAt(i) <= 0x39) i++
      buf[si++] = s; buf[si++] = i; buf[si++] = RK.NUMBER; continue
    }

    // String — store span including quotes, no escape processing yet
    if (c === 0x27 || c === 0x22) {
      const s = i++; const q = c
      while (i < len && input.charCodeAt(i) !== q) {
        if (input.charCodeAt(i) === 0x5c) i++ // skip escaped char
        i++
      }
      i++ // closing quote
      buf[si++] = s; buf[si++] = i; buf[si++] = RK.STRING; continue
    }

    // Single-char punctuation
    buf[si++] = i; buf[si++] = i + 1; buf[si++] = RK.PUNCT
    i++
  }

  return { buf, count: si / 3 }
}

function classify(input, { buf, count }) {
  const types  = new Int32Array(count + 1)
  const values = new Array(count + 1)
  let ti = 0

  for (let k = 0, end = count * 3; k < end; k += 3) {
    const start = buf[k], stop = buf[k + 1], rk = buf[k + 2]

    if (rk === RK.WORD) {
      types[ti] = TT.NAME; values[ti++] = input.slice(start, stop)
    } else if (rk === RK.NUMBER) {
      let n = 0
      for (let j = start; j < stop; j++) n = n * 10 + (input.charCodeAt(j) - 0x30)
      types[ti] = TT.INT; values[ti++] = n
    } else if (rk === RK.STRING) {
      const q = input.charCodeAt(start); let val = ''
      for (let j = start + 1; j < stop - 1; j++) {
        if (input.charCodeAt(j) === 0x5c) {
          j++
          switch (input.charCodeAt(j)) {
            case 0x6e: val += '\n'; break; case 0x74: val += '\t'; break
            case 0x72: val += '\r'; break; case 0x5c: val += '\\'; break
            case 0x27: val += "'";  break; case 0x22: val += '"';  break
          }
        } else val += input[j]
      }
      types[ti] = TT.LIT; values[ti++] = val
    } else { // PUNCT
      const c = input.charCodeAt(start); let tt = -1
      switch (c) {
        case 0x3d: tt = TT.EQ;       break; case 0x3b: tt = TT.SEMI;     break
        case 0x7c: tt = TT.PIPE;     break; case 0x2c: tt = TT.COMMA;    break
        case 0x7b: tt = TT.LBRACE;   break; case 0x7d: tt = TT.RBRACE;   break
        case 0x5b: tt = TT.LBRACKET; break; case 0x5d: tt = TT.RBRACKET; break
        case 0x28: tt = TT.LPAREN;   break; case 0x29: tt = TT.RPAREN;   break
        case 0x2a: tt = TT.STAR;     break; case 0x2d: tt = TT.MINUS;    break
      }
      if (tt !== -1) { types[ti] = tt; values[ti++] = null }
    }
  }

  types[ti] = TT.EOF; values[ti] = null
  return { types, values, len: ti }
}

// ── Validation checksum ───────────────────────────────────────────────────────
function checksum(ast) {
  let terminals = 0, nonTerminals = 0, nodes = 0
  function walk(b) {
    nodes++
    if (b.kind === 'terminal')    { terminals++; return }
    if (b.kind === 'nonTerminal') { nonTerminals++; return }
    if (b.items) { for (const c of b.items) walk(c) }
    else { if (b.item) walk(b.item); if (b.except) walk(b.except) }
  }
  for (const r of ast.rules) walk(r.body)
  return `rules=${ast.rules.length} terms=${terminals} nonTerms=${nonTerminals} nodes=${nodes}`
}

// ── Benchmark harness ─────────────────────────────────────────────────────────
function bench(label, fn, input, iters = 50_000) {
  for (let i = 0; i < 2_000; i++) fn(input) // warmup
  const t0 = performance.now()
  for (let i = 0; i < iters; i++) fn(input)
  const ms = performance.now() - t0
  return { label, opsPerSec: Math.round(iters / ms * 1000), ms }
}

// ── Validate + run for each input ────────────────────────────────────────────
function runSuite(name, input, iters = 50_000) {
  const c1 = checksum(EBNFParser.parse(input))
  const c2 = checksum(new TokenParser(handLex(input)).parse())
  const c3 = checksum(new TokenParser(regexLex(input)).parse())
  const c4 = checksum(new TokenParser(classify(input, spanTokenize(input))).parse())
  if (c2 !== c1 || c3 !== c1 || c4 !== c1) {
    console.error(`Checksum mismatch on ${name}:`, { c1, c2, c3, c4 }); process.exit(1)
  }

  console.log(`── ${name}  (${input.length.toLocaleString()} chars  |  ${c1})`)

  const runs = [
    bench('1. Scannerless                      ', s => EBNFParser.parse(s),                                   input, iters),
    bench('2. Hand lexer        + token parser ', s => new TokenParser(handLex(s)).parse(),                   input, iters),
    bench('3. Regex lexer       + token parser ', s => new TokenParser(regexLex(s)).parse(),                  input, iters),
    bench('4. Span tokenizer    + classifier   ', s => new TokenParser(classify(s, spanTokenize(s))).parse(), input, iters),
  ]

  const base = runs[0].opsPerSec
  console.log(`${'Approach'.padEnd(42)} ${'ops/sec'.padStart(9)}  speedup`)
  console.log('─'.repeat(58))
  for (const r of runs) {
    const x = (r.opsPerSec / base).toFixed(2)
    const bar = '▓'.repeat(Math.max(1, Math.round(r.opsPerSec / base * 20)))
    console.log(`${r.label.padEnd(42)} ${String(r.opsPerSec).padStart(9)}  ${x}x  ${bar}`)
  }
  console.log()
}

runSuite('ebnf-meta  (3 KB, 20 rules)',  INPUTS['ebnf-meta'])
runSuite('stress     (13 KB, 71 rules)', INPUTS['stress'], 10_000)

console.log('Note: approach 3 uses a comment pre-pass (regex cannot handle nested comments).')
