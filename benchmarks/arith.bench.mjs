// Benchmark: scannerless vs hand-tokenizer vs regex-lexer for the arith grammar
//
// All three approaches evaluate the expression to a number so that parse-tree
// allocation does not confound the results. The token-stream approaches also
// run the tokenization phase as part of each timed iteration.
//
// Run: node benchmarks/arith.bench.mjs

import { performance } from 'node:perf_hooks'

// ── Deterministic input ───────────────────────────────────────────────────────
// Balanced binary tree of expressions; depth 6 ≈ 443 chars, 127 operators.
// Leaf counter ensures distinct non-zero values so no division-by-zero arises.
let _leaf = 0
function makeExpr(depth) {
  if (depth === 0) return String((_leaf++ % 8) + 1)
  const op = ['+', '-', '*', '/'][depth % 4]
  const left = makeExpr(depth - 1)
  const right = makeExpr(depth - 1)
  return `(${left} ${op} ${right})`
}
const INPUT = makeExpr(6)

// ── Approach 1: Scannerless ───────────────────────────────────────────────────
// Mirrors RDParser: TextEncoder → Uint8Array, byte-level comparisons, explicit
// position saves/restores for backtracking around optional whitespace.
class Scannerless {
  #src
  #pos = 0

  constructor(input) {
    this.#src = new TextEncoder().encode(input)
  }

  static parse(input) {
    return new Scannerless(input).#expr()
  }

  #wsp() {
    while (this.#src[this.#pos] === 0x20) this.#pos++
  }

  #digit() {
    const b = this.#src[this.#pos]
    if (b >= 0x30 && b <= 0x39) { this.#pos++; return b - 0x30 }
    return -1
  }

  #number() {
    let d = this.#digit()
    if (d === -1) return null
    let n = d
    while ((d = this.#digit()) !== -1) n = n * 10 + d
    return n
  }

  #factor() {
    if (this.#src[this.#pos] === 0x28) {
      this.#pos++
      const v = this.#expr()
      this.#pos++ // ')'
      return v
    }
    return this.#number()
  }

  #term() {
    let left = this.#factor()
    while (true) {
      const p = this.#pos
      this.#wsp()
      const c = this.#src[this.#pos]
      if      (c === 0x2a) { this.#pos++; this.#wsp(); left *= this.#factor() }
      else if (c === 0x2f) { this.#pos++; this.#wsp(); left /= this.#factor() }
      else { this.#pos = p; break }
    }
    return left
  }

  #expr() {
    this.#wsp()
    let left = this.#term()
    while (true) {
      const p = this.#pos
      this.#wsp()
      const c = this.#src[this.#pos]
      if      (c === 0x2b) { this.#pos++; this.#wsp(); left += this.#term() }
      else if (c === 0x2d) { this.#pos++; this.#wsp(); left -= this.#term() }
      else { this.#pos = p; break }
    }
    this.#wsp()
    return left
  }
}

// ── Approach 2: Hand-written tokenizer + recursive descent ────────────────────
// Tokenization: single char-code loop building two parallel arrays (type +
// numeric value) to avoid per-token object allocation.
// Parsing: identical recursive-descent logic but token-indexed — no whitespace
// handling needed, no position saves around wsp.

const TT = { NUM: 0, PLUS: 1, MINUS: 2, STAR: 3, SLASH: 4, LPAREN: 5, RPAREN: 6, EOF: 7 }

function handTokenize(input) {
  const types = new Int32Array(input.length + 1)
  const values = new Float64Array(input.length + 1)
  let ti = 0, i = 0
  const len = input.length
  while (i < len) {
    const c = input.charCodeAt(i)
    if (c === 0x20) { i++; continue }
    if (c >= 0x30 && c <= 0x39) {
      let n = c - 0x30; i++
      while (i < len) {
        const d = input.charCodeAt(i)
        if (d < 0x30 || d > 0x39) break
        n = n * 10 + (d - 0x30); i++
      }
      types[ti] = TT.NUM; values[ti++] = n
    } else {
      switch (c) {
        case 0x2b: types[ti++] = TT.PLUS;   break
        case 0x2d: types[ti++] = TT.MINUS;  break
        case 0x2a: types[ti++] = TT.STAR;   break
        case 0x2f: types[ti++] = TT.SLASH;  break
        case 0x28: types[ti++] = TT.LPAREN; break
        case 0x29: types[ti++] = TT.RPAREN; break
      }
      i++
    }
  }
  types[ti] = TT.EOF
  return { types, values, len: ti }
}

class HandParser {
  #types
  #values
  #pos = 0

  constructor({ types, values }) {
    this.#types = types
    this.#values = values
  }

  static parse(input) {
    return new HandParser(handTokenize(input)).#expr()
  }

  #factor() {
    if (this.#types[this.#pos] === TT.LPAREN) {
      this.#pos++
      const v = this.#expr()
      this.#pos++ // RPAREN
      return v
    }
    return this.#values[this.#pos++]
  }

  #term() {
    let left = this.#factor()
    while (true) {
      const t = this.#types[this.#pos]
      if      (t === TT.STAR)  { this.#pos++; left *= this.#factor() }
      else if (t === TT.SLASH) { this.#pos++; left /= this.#factor() }
      else break
    }
    return left
  }

  #expr() {
    let left = this.#term()
    while (true) {
      const t = this.#types[this.#pos]
      if      (t === TT.PLUS)  { this.#pos++; left += this.#term() }
      else if (t === TT.MINUS) { this.#pos++; left -= this.#term() }
      else break
    }
    return left
  }
}

// ── Approach 3: Regex lexer + same token-stream parser ────────────────────────
// Tokenization via a single alternating regex; JS engines compile this to a DFA.
// The parse phase is identical to approach 2.

const ARITH_RE = /(\d+)|([+\-*/()])/g

function regexTokenize(input) {
  const types = new Int32Array(input.length + 1)
  const values = new Float64Array(input.length + 1)
  let ti = 0
  ARITH_RE.lastIndex = 0
  let m
  while ((m = ARITH_RE.exec(input)) !== null) {
    if (m[1] !== undefined) {
      types[ti] = TT.NUM; values[ti++] = +m[1]
    } else {
      switch (m[2]) {
        case '+': types[ti++] = TT.PLUS;   break
        case '-': types[ti++] = TT.MINUS;  break
        case '*': types[ti++] = TT.STAR;   break
        case '/': types[ti++] = TT.SLASH;  break
        case '(': types[ti++] = TT.LPAREN; break
        case ')': types[ti++] = TT.RPAREN; break
      }
    }
  }
  types[ti] = TT.EOF
  return { types, values, len: ti }
}

class RegexParser {
  #types
  #values
  #pos = 0

  constructor({ types, values }) {
    this.#types = types
    this.#values = values
  }

  static parse(input) {
    return new RegexParser(regexTokenize(input)).#expr()
  }

  #factor() {
    if (this.#types[this.#pos] === TT.LPAREN) {
      this.#pos++
      const v = this.#expr()
      this.#pos++
      return v
    }
    return this.#values[this.#pos++]
  }

  #term() {
    let left = this.#factor()
    while (true) {
      const t = this.#types[this.#pos]
      if      (t === TT.STAR)  { this.#pos++; left *= this.#factor() }
      else if (t === TT.SLASH) { this.#pos++; left /= this.#factor() }
      else break
    }
    return left
  }

  #expr() {
    let left = this.#term()
    while (true) {
      const t = this.#types[this.#pos]
      if      (t === TT.PLUS)  { this.#pos++; left += this.#term() }
      else if (t === TT.MINUS) { this.#pos++; left -= this.#term() }
      else break
    }
    return left
  }
}

// ── Benchmark harness ─────────────────────────────────────────────────────────
function bench(label, fn, input, iters = 300_000) {
  // warmup — let JIT stabilise
  for (let i = 0; i < 5_000; i++) fn(input)

  const start = performance.now()
  for (let i = 0; i < iters; i++) fn(input)
  const ms = performance.now() - start
  return { label, opsPerSec: Math.round(iters / ms * 1000), ms }
}

// ── Validate correctness ──────────────────────────────────────────────────────
const expected = Scannerless.parse(INPUT)
const check = (label, got) => {
  if (!Object.is(got, expected)) { console.error(`FAIL ${label}: got ${got}, expected ${expected}`); process.exit(1) }
}
check('HandParser',  HandParser.parse(INPUT))
check('RegexParser', RegexParser.parse(INPUT))

// ── Run ───────────────────────────────────────────────────────────────────────
console.log(`Input: ${INPUT.length} chars, result: ${expected}\n`)

const runs = [
  bench('1. Scannerless  (TextEncoder + Uint8Array, byte cmps)', s => Scannerless.parse(s), INPUT),
  bench('2. Hand tokenizer (charCodeAt loop) + token RD       ', s => HandParser.parse(s),  INPUT),
  bench('3. Regex lexer  (single alternating RE) + token RD   ', s => RegexParser.parse(s), INPUT),
]

const base = runs[0].opsPerSec
const col = (s, w) => s.toString().padStart(w)

console.log(`${'Approach'.padEnd(55)} ${'ops/sec'.padStart(9)}  speedup`)
console.log('─'.repeat(72))
for (const r of runs) {
  const x = (r.opsPerSec / base).toFixed(2)
  const bar = '▓'.repeat(Math.max(1, Math.round(r.opsPerSec / base * 10)))
  console.log(`${r.label.padEnd(55)} ${col(r.opsPerSec, 9)}  ${x}x  ${bar}`)
}

console.log(`\nNote: each iteration includes tokenization + parsing.`)
console.log(`Input complexity: ~${INPUT.length} chars, balanced tree, 127 binary operators.`)
