/** @module Generator */

/**
 * @packageDocumentation
 *
 * Programmatic API for the `rdp-gen` code generator.
 *
 * Parse a grammar string into a {@link GrammarAST}:
 *
 * ```ts
 * import { EBNFParser, ABNFParser } from '\@configuredthings/rdp.js/generator'
 *
 * const ast = EBNFParser.parse('Greeting = "hello" | "world";')
 * const ast = ABNFParser.parse('greeting = "hello" / "world"')
 * ```
 *
 * Or parse and emit a TypeScript parser class in one call:
 *
 * ```ts
 * import { generateParser } from '\@configuredthings/rdp.js/generator'
 *
 * const ts = generateParser(grammarSource, {
 *   format: 'ebnf',
 *   parserName: 'ArithmeticParser',
 * })
 * ```
 */

export { generateParser } from './codegen.js'
export type { GeneratorOptions } from './codegen.js'
export { generateScaffold, generateInitScaffold } from './scaffold.js'
export type { ScaffoldPattern, InitScaffoldOptions } from './scaffold.js'
export type { GrammarAST, ProductionRule, RuleBody, CoreRuleName } from './ast.js'
export { EBNFParser } from './ebnf-parser.js'
export type { EBNFParseOptions } from './ebnf-parser.js'
export { ABNFParser } from './abnf-parser.js'
export type { ABNFParseOptions } from './abnf-parser.js'
