/**
 * Left-recursion detection — validates a {@link GrammarAST} before code emission.
 *
 * Detects both direct and indirect left recursion and throws with a clear
 * message identifying the cycle, so `rdp-gen` can fail fast at generation time
 * rather than producing a parser that infinite-loops at runtime.
 */

import { RDParserException } from '../exception.js'
import type { GrammarAST, RuleBody } from './ast.js'

/**
 * Throws {@link RDParserException} if `ast` contains any direct or indirect
 * left recursion.
 *
 * @param ast - The grammar to validate.
 * @throws {RDParserException} Describing the left-recursive cycle.
 */
export function detectLeftRecursion(ast: GrammarAST): void {
  const ruleMap = new Map<string, RuleBody>(ast.rules.map((r) => [r.name, r.body]))

  // DFS with a path stack to reconstruct cycle descriptions
  const visiting = new Set<string>()
  const visited = new Set<string>()

  for (const rule of ast.rules) {
    if (!visited.has(rule.name)) {
      dfs(rule.name, [rule.name])
    }
  }

  function dfs(name: string, path: string[]): void {
    if (visiting.has(name)) {
      const cycleStart = path.indexOf(name)
      const cycle = path.slice(cycleStart).join(' → ')
      throw new RDParserException(`Left recursion detected: ${cycle} → ${name}`)
    }
    if (visited.has(name)) return

    visiting.add(name)
    const body = ruleMap.get(name)
    if (body !== undefined) {
      for (const first of firstNonTerminals(body)) {
        dfs(first, [...path, first])
      }
    }
    visiting.delete(name)
    visited.add(name)
  }
}

/**
 * Returns the set of non-terminal names that can appear as the *first* symbol
 * of a rule body — i.e. the non-terminals reachable without consuming any input.
 */
function firstNonTerminals(body: RuleBody): Set<string> {
  const result = new Set<string>()
  collectFirst(body, result)
  return result
}

function collectFirst(body: RuleBody, out: Set<string>): void {
  switch (body.kind) {
    case 'nonTerminal':
      out.add(body.name)
      break
    case 'sequence':
      // istanbul ignore else -- parsers never produce sequences with zero items
      if (body.items[0] !== undefined) collectFirst(body.items[0], out)
      break
    case 'alternation':
      for (const item of body.items) collectFirst(item, out)
      break
    case 'optional':
    case 'zeroOrMore':
      collectFirst(body.item, out)
      break
    case 'oneOrMore':
      collectFirst(body.item, out)
      break
    case 'repetition':
      collectFirst(body.item, out)
      break
    case 'exception':
      collectFirst(body.item, out)
      break
    // terminals and charValues cannot be left-recursive
    case 'terminal':
    case 'charValue':
    case 'coreRule':
      break
  }
}
