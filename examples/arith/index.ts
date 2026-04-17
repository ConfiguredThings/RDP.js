/**
 * @module ArithExample
 */

/**
 * @packageDocumentation
 *
 * Complete worked example: an arithmetic expression grammar compiled to a
 * generated parser, scaffold files for each composable pattern, and the
 * grammar AST.
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
 * | {@link "arith-facade"} | Facade + evaluator scaffold — clean domain API |
 * | {@link "arith-pipeline"} | Pipeline + evaluator scaffold — parse / validate / transform |
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

// ── Facade scaffold (facade + evaluator) ─────────────────────────────────────
export { parseArith, ArithError, ArithResult } from './arith-facade.js'

// ── Pipeline scaffold (pipeline + evaluator) ─────────────────────────────────
export { parse, validate, transform, loadArith } from './arith-pipeline.js'
export type { ArithResult as ArithPipelineResult, ValidationError } from './arith-pipeline.js'

// ── Walker scaffold ───────────────────────────────────────────────────────────
export { walk } from './arith-walker.js'

// ── Grammar AST ───────────────────────────────────────────────────────────────
export { arithAST } from './arith-ast-export.js'
