/**
 * @module ArithExample
 */

/**
 * @packageDocumentation
 *
 * Complete worked example: an arithmetic expression grammar compiled to a
 * generated parser, four scaffold files, and the grammar AST.
 *
 * **Grammar** (`src/grammars/arith.ebnf`):
 * ```ebnf
 * Expr   = wsp, Term, {wsp, ('+' | '-'), wsp, Term}, wsp;
 * Term   = Factor, {wsp, ('*' | '/'), wsp, Factor};
 * Factor = '(', Expr, ')' | Number;
 * Number = Digit, {Digit};
 * Digit  = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';
 * wsp    = {' '};
 * ```
 *
 * | File | Role |
 * |------|------|
 * | {@link ArithParser} | Generated parser (with `childNodes` walker) |
 * | {@link "arith-evaluator"} | Evaluator scaffold — one function per rule |
 * | {@link "arith-facade"} | Facade scaffold — clean domain API |
 * | {@link "arith-pipeline"} | Pipeline scaffold — parse / validate / transform |
 * | {@link "arith-walker"} | Walker scaffold — tree traversal with `visit()` |
 * | {@link arithAST} | Parsed grammar AST |
 */

// ── Generated parser ──────────────────────────────────────────────────────────
export { ArithParser, childNodes } from './ArithParser.js'
export type {
  ArithTree,
  ExprNode,
  TermNode,
  FactorNode,
  NumberNode,
  DigitNode,
  WspNode,
} from './ArithParser.js'

// ── Evaluator scaffold ────────────────────────────────────────────────────────
export { evaluate } from './arith-evaluator.js'

// ── Facade scaffold ───────────────────────────────────────────────────────────
export { parseArith, ArithError } from './arith-facade.js'
export type { Arith as ArithFacade } from './arith-facade.js'

// ── Pipeline scaffold ─────────────────────────────────────────────────────────
export { parse, validate, transform } from './arith-pipeline.js'
export type { Arith as ArithPipeline, ValidationError } from './arith-pipeline.js'

// ── Walker scaffold ───────────────────────────────────────────────────────────
export { walk } from './arith-walker.js'

// ── Grammar AST ───────────────────────────────────────────────────────────────
export { arithAST } from './arith-ast-export.js'
