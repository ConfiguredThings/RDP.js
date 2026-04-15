import { ObservableRDParser, TraceObserver, DebugObserver } from '../observable.js'
import { RDParserException } from '../exception.js'

function makeView(input: string): DataView {
  const bytes = new TextEncoder().encode(input)
  return new DataView(bytes.buffer)
}

class TestParser extends ObservableRDParser {
  parse(succeed: boolean): boolean {
    this.notifyEnter('test')
    if (succeed) {
      if (!this.atEnd()) this.advance()
      this.notifyExit('test', true)
      return true
    }
    this.notifyExit('test', false)
    return false
  }

  parseError(): never {
    this.notifyEnter('bad')
    return this.error('forced error')
  }
}

describe('TraceObserver', () => {
  it('records enter and exit events', () => {
    const obs = new TraceObserver()
    const parser = new TestParser(makeView('A'))
    parser.withObserver(obs).parse(true)

    expect(obs.events).toHaveLength(2)
    expect(obs.events[0]).toMatchObject({ kind: 'enter', production: 'test', position: 0 })
    expect(obs.events[1]).toMatchObject({ kind: 'exit', production: 'test', matched: true })
  })

  it('records failed exit', () => {
    const obs = new TraceObserver()
    new TestParser(makeView('')).withObserver(obs).parse(false)
    expect(obs.events[1]).toMatchObject({ kind: 'exit', matched: false })
  })

  it('records error events', () => {
    const obs = new TraceObserver()
    const parser = new TestParser(makeView('A')).withObserver(obs)
    expect(() => parser.parseError()).toThrow(RDParserException)
    expect(obs.events.some((e) => e.kind === 'error')).toBe(true)
  })

  it('accumulates events across multiple productions', () => {
    const obs = new TraceObserver()
    const parser = new TestParser(makeView('AB')).withObserver(obs)
    parser.parse(true)
    parser.parse(true)
    expect(obs.events).toHaveLength(4)
  })
})

describe('DebugObserver', () => {
  it('writes indented enter/exit lines to the sink', () => {
    const lines: string[] = []
    const obs = new DebugObserver((line) => lines.push(line))
    new TestParser(makeView('A')).withObserver(obs).parse(true)

    expect(lines[0]).toMatch(/^→ test/)
    expect(lines[1]).toMatch(/^← test.*matched/)
  })

  it('indents nested productions', () => {
    const lines: string[] = []
    const obs = new DebugObserver((line) => lines.push(line))

    class NestedParser extends ObservableRDParser {
      outer(): void {
        this.notifyEnter('outer')
        this.inner()
        this.notifyExit('outer', true)
      }
      inner(): void {
        this.notifyEnter('inner')
        this.notifyExit('inner', true)
      }
    }

    new NestedParser(makeView('')).withObserver(obs).outer()
    expect(lines[1]).toMatch(/^  → inner/) // indented by 2 spaces
  })

  it('defaults to console.error when no sink is provided', () => {
    const lines: string[] = []
    const original = console.error
    console.error = (line: string): number => lines.push(line)
    try {
      const obs = new DebugObserver()
      new TestParser(makeView('A')).withObserver(obs).parse(true)
      expect(lines.length).toBeGreaterThan(0)
    } finally {
      console.error = original
    }
  })
})

describe('withObserver chaining', () => {
  it('returns the parser instance for chaining', () => {
    const parser = new TestParser(makeView('A'))
    const result = parser.withObserver(new TraceObserver())
    expect(result).toBe(parser)
  })
})

describe('DebugObserver error output', () => {
  it('writes an error line to the sink when a parse error occurs', () => {
    const lines: string[] = []
    const obs = new DebugObserver((line) => lines.push(line))
    const parser = new TestParser(makeView('A')).withObserver(obs)
    expect(() => parser.parseError()).toThrow(RDParserException)
    expect(lines.some((l) => l.includes('ERROR'))).toBe(true)
  })

  it('writes a "failed" exit line when a production does not match', () => {
    const lines: string[] = []
    const obs = new DebugObserver((line) => lines.push(line))
    new TestParser(makeView('')).withObserver(obs).parse(false)
    expect(lines.some((l) => l.includes('failed'))).toBe(true)
  })
})
