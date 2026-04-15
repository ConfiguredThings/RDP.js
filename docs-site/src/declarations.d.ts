declare module 'railroad-diagrams' {
  interface DiagramNode {
    toString(): string
  }
  export function Diagram(...items: DiagramNode[]): DiagramNode
  export function Sequence(...items: DiagramNode[]): DiagramNode
  export function Choice(defaultIndex: number, ...items: DiagramNode[]): DiagramNode
  export function Optional(item: DiagramNode, skip?: 'skip'): DiagramNode
  export function ZeroOrMore(item: DiagramNode, repeat?: DiagramNode): DiagramNode
  export function OneOrMore(item: DiagramNode, repeat?: DiagramNode): DiagramNode
  export function Terminal(text: string): DiagramNode
  export function NonTerminal(text: string): DiagramNode
  export function Skip(): DiagramNode
  export function Comment(text: string): DiagramNode
}

declare module '*.css'
declare module '*.svg'
