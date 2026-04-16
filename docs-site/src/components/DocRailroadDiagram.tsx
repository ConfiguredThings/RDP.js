import React, { useMemo } from 'react'
import {
  Diagram,
  Sequence,
  Choice,
  Optional,
  ZeroOrMore,
  OneOrMore,
  Terminal,
  NonTerminal,
} from 'railroad-diagrams'
import { EBNFParser } from '@configuredthings/rdp.js/generator'
import type { RuleBody } from '@configuredthings/rdp.js/generator'

interface Props {
  /** EBNF grammar source to render. */
  grammar: string
  /** Which rules to display. Defaults to all rules in grammar order. */
  rules?: string[]
}

/**
 * Renders a subset of an EBNF grammar as railroad diagrams.
 * Registered globally in mdxComponents so doc pages can use <RailroadDiagram />.
 */
export function DocRailroadDiagram({ grammar, rules }: Props) {
  const diagrams = useMemo(() => {
    let ast
    try {
      ast = EBNFParser.parse(grammar)
    } catch {
      return []
    }
    const filtered = rules ? ast.rules.filter((r) => rules.includes(r.name)) : ast.rules
    return filtered.map((rule) => {
      try {
        const svg = Diagram(bodyToNode(rule.body)).toString()
        return { name: rule.name, svg }
      } catch {
        return { name: rule.name, svg: null }
      }
    })
  }, [grammar, rules])

  if (diagrams.length === 0) return null

  return (
    <div className="grammar-rules" style={{ margin: '1.25rem 0' }}>
      {diagrams.map(({ name, svg }) => (
        <div key={name} className="grammar-rule">
          <div className="grammar-rule-name">{name}</div>
          {svg ? (
            <div dangerouslySetInnerHTML={{ __html: svg }} />
          ) : (
            <span
              style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontStyle: 'italic' }}
            >
              unavailable
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

function bodyToNode(body: RuleBody): ReturnType<typeof Terminal> {
  switch (body.kind) {
    case 'terminal':
      return Terminal(JSON.stringify(body.value))
    case 'nonTerminal':
    case 'coreRule':
      return NonTerminal(body.name)
    case 'charValue':
      if (body.range !== undefined) {
        const [lo, hi] = body.range
        return Terminal(`0x${lo.toString(16)}–0x${hi.toString(16)}`)
      }
      return Terminal(body.codepoints.map((cp) => String.fromCharCode(cp)).join(''))
    case 'sequence':
      if (body.items.length === 1) return bodyToNode(body.items[0]!)
      return Sequence(...body.items.map(bodyToNode))
    case 'alternation':
      return Choice(0, ...body.items.map(bodyToNode))
    case 'optional':
      return Optional(bodyToNode(body.item))
    case 'zeroOrMore':
      return ZeroOrMore(bodyToNode(body.item))
    case 'oneOrMore':
      return OneOrMore(bodyToNode(body.item))
    case 'repetition': {
      const label = body.max !== null ? `${body.min}–${body.max}×` : `${body.min}+×`
      return ZeroOrMore(bodyToNode(body.item), Terminal(label))
    }
    case 'exception':
      return bodyToNode(body.item)
  }
}
