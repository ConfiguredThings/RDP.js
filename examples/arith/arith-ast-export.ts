/**
 * The parsed grammar AST for the arithmetic example grammar.
 *
 * Produced by `EBNFParser.parse(arithEBNF)`. Exported here so TypeDoc and the
 * doc-site can reference the concrete {@link GrammarAST} shape without a
 * runtime generation step.
 */

import { EBNFParser, type GrammarAST } from '@configuredthings/rdp.js/generator'
import { arithEBNF } from '@configuredthings/rdp.js/grammars'

/**
 * Grammar AST produced by parsing `arith.ebnf`.
 *
 * Contains one {@link ProductionRule} per grammar rule: `Expr`, `Term`,
 * `Factor`, `Number`, `Digit`, `wsp`.
 */
export const arithAST: GrammarAST = EBNFParser.parse(arithEBNF)
