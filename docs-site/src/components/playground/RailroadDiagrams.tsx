import React, { useMemo, useEffect, useRef } from 'react'
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
import type { GrammarAST, RuleBody } from '@configuredthings/rdp.js/generator'

interface Props {
  ast: GrammarAST
  activeProduction: string | null
}

export function RailroadDiagrams({ ast, activeProduction }: Props) {
  return (
    <div>
      <div className="grammar-title">Grammar</div>
      <div className="grammar-rules">
        {ast.rules.map((rule) => (
          <RailroadRule
            key={rule.name}
            name={rule.name}
            body={rule.body}
            isActive={rule.name === activeProduction}
          />
        ))}
      </div>
    </div>
  )
}

function RailroadRule({
  name,
  body,
  isActive,
}: {
  name: string
  body: RuleBody
  isActive: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isActive && ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [isActive])

  const svg = useMemo(() => {
    try {
      return Diagram(bodyToNode(body)).toString()
    } catch {
      return null
    }
  }, [body])

  return (
    <div ref={ref} className={`grammar-rule${isActive ? ' active' : ''}`}>
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
  }
}
