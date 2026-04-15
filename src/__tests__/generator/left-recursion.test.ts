import { detectLeftRecursion } from '../../generator/left-recursion.js'
import { RDParserException } from '../../exception.js'
import type { GrammarAST } from '../../generator/ast.js'

describe('detectLeftRecursion', () => {
  it('does not throw for a non-left-recursive grammar', () => {
    const ast: GrammarAST = {
      rules: [{ name: 'A', body: { kind: 'terminal', value: 'a' } }],
    }
    expect(() => detectLeftRecursion(ast)).not.toThrow()
  })

  it('throws for direct left recursion', () => {
    const ast: GrammarAST = {
      rules: [{ name: 'A', body: { kind: 'nonTerminal', name: 'A' } }],
    }
    expect(() => detectLeftRecursion(ast)).toThrow(RDParserException)
  })

  it('throws for indirect left recursion (A → B → A)', () => {
    const ast: GrammarAST = {
      rules: [
        { name: 'A', body: { kind: 'nonTerminal', name: 'B' } },
        { name: 'B', body: { kind: 'nonTerminal', name: 'A' } },
      ],
    }
    expect(() => detectLeftRecursion(ast)).toThrow(RDParserException)
  })

  it('includes the cycle in the error message', () => {
    const ast: GrammarAST = {
      rules: [{ name: 'Expr', body: { kind: 'nonTerminal', name: 'Expr' } }],
    }
    expect(() => detectLeftRecursion(ast)).toThrow('Expr')
  })

  it('does not throw for right recursion', () => {
    const ast: GrammarAST = {
      rules: [
        {
          name: 'List',
          body: {
            kind: 'sequence',
            items: [
              { kind: 'terminal', value: 'a' },
              { kind: 'optional', item: { kind: 'nonTerminal', name: 'List' } },
            ],
          },
        },
      ],
    }
    expect(() => detectLeftRecursion(ast)).not.toThrow()
  })

  it('detects left recursion through alternation (A ::= A | x)', () => {
    const ast: GrammarAST = {
      rules: [
        {
          name: 'A',
          body: {
            kind: 'alternation',
            items: [
              { kind: 'nonTerminal', name: 'A' },
              { kind: 'terminal', value: 'x' },
            ],
          },
        },
      ],
    }
    expect(() => detectLeftRecursion(ast)).toThrow(RDParserException)
  })

  it('detects left recursion through optional (A ::= A?)', () => {
    const ast: GrammarAST = {
      rules: [{ name: 'A', body: { kind: 'optional', item: { kind: 'nonTerminal', name: 'A' } } }],
    }
    expect(() => detectLeftRecursion(ast)).toThrow(RDParserException)
  })

  it('detects left recursion through zeroOrMore (A ::= A*)', () => {
    const ast: GrammarAST = {
      rules: [
        { name: 'A', body: { kind: 'zeroOrMore', item: { kind: 'nonTerminal', name: 'A' } } },
      ],
    }
    expect(() => detectLeftRecursion(ast)).toThrow(RDParserException)
  })

  it('detects left recursion through oneOrMore (A ::= A+)', () => {
    const ast: GrammarAST = {
      rules: [{ name: 'A', body: { kind: 'oneOrMore', item: { kind: 'nonTerminal', name: 'A' } } }],
    }
    expect(() => detectLeftRecursion(ast)).toThrow(RDParserException)
  })

  it('detects left recursion through repetition (A = 2*4 A)', () => {
    const ast: GrammarAST = {
      rules: [
        {
          name: 'A',
          body: { kind: 'repetition', min: 2, max: 4, item: { kind: 'nonTerminal', name: 'A' } },
        },
      ],
    }
    expect(() => detectLeftRecursion(ast)).toThrow(RDParserException)
  })

  it('does not throw for a sequence where only the second element is left-recursive', () => {
    // Left recursion only in second position: not actually left-recursive
    const ast: GrammarAST = {
      rules: [
        {
          name: 'A',
          body: {
            kind: 'sequence',
            items: [
              { kind: 'terminal', value: 'x' },
              { kind: 'nonTerminal', name: 'A' },
            ],
          },
        },
      ],
    }
    expect(() => detectLeftRecursion(ast)).not.toThrow()
  })

  it('does not throw when multiple rules share the same non-terminal dependency', () => {
    // Exercises the visited.has(name) early-return branch in dfs:
    // B is reachable from both A and C; dfs(B) is called twice, second time returns early.
    const ast: GrammarAST = {
      rules: [
        { name: 'A', body: { kind: 'nonTerminal', name: 'B' } },
        { name: 'C', body: { kind: 'nonTerminal', name: 'B' } },
        { name: 'B', body: { kind: 'terminal', value: 'x' } },
      ],
    }
    expect(() => detectLeftRecursion(ast)).not.toThrow()
  })

  it('does not throw when a rule references an undefined non-terminal', () => {
    // Exercises the body === undefined branch in dfs (unknown rule has no body in ruleMap)
    const ast: GrammarAST = {
      rules: [{ name: 'A', body: { kind: 'nonTerminal', name: 'Undefined' } }],
    }
    expect(() => detectLeftRecursion(ast)).not.toThrow()
  })
})
