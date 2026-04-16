import { generateScaffold, generateInitScaffold } from '../../generator/scaffold.js'
import { generateParser } from '../../generator/codegen.js'
import { importScaffold } from '../../__testUtils__/generator-runtime.js'
const DATE_GRAMMAR = `Date = Year, '-', Month, '-', Day;\nYear = Digit, Digit, Digit, Digit;\nMonth = Digit, Digit;\nDay = Digit, Digit;\nDigit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';`
const PARSER_NAME = 'DateParser'

// ── Evaluator scaffold ────────────────────────────────────────────────────────

describe('generateScaffold — evaluator', () => {
  let output: string

  beforeAll(() => {
    output = generateScaffold(DATE_GRAMMAR, 'evaluator', { parserName: PARSER_NAME })
  })

  it('imports the parser class and every node type', () => {
    expect(output).toContain(`import {`)
    expect(output).toContain(`  ${PARSER_NAME},`)
    expect(output).toContain(`  type DateNode,`)
    expect(output).toContain(`  type YearNode,`)
    expect(output).toContain(`  type DigitNode,`)
    expect(output).toContain(`} from './${PARSER_NAME}.js'`)
  })

  it('emits an evaluate() entry point that calls the first rule', () => {
    expect(output).toContain(`export function evaluate(input: string): unknown`)
    expect(output).toContain(`evalDate(${PARSER_NAME}.parse(input))`)
  })

  it('emits one eval function per grammar rule', () => {
    expect(output).toContain(`function evalDate(node: DateNode): unknown`)
    expect(output).toContain(`function evalYear(node: YearNode): unknown`)
    expect(output).toContain(`function evalMonth(node: MonthNode): unknown`)
    expect(output).toContain(`function evalDay(node: DayNode): unknown`)
    expect(output).toContain(`function evalDigit(node: DigitNode): unknown`)
  })

  it('wraps RDParserException in the entry point', () => {
    expect(output).toContain(`RDParserException`)
  })
})

// ── Facade scaffold ───────────────────────────────────────────────────────────

describe('generateScaffold — facade', () => {
  let output: string

  beforeAll(() => {
    output = generateScaffold(DATE_GRAMMAR, 'facade', { parserName: PARSER_NAME })
  })

  it('imports the parser class and root node type only', () => {
    expect(output).toContain(`import { ${PARSER_NAME}, type DateNode }`)
    expect(output).not.toContain('type YearNode')
  })

  it('emits a domain interface named after the parser base', () => {
    expect(output).toContain(`export interface Date {`)
  })

  it('emits an error class named after the parser base', () => {
    expect(output).toContain(`export class DateError extends Error`)
  })

  it('emits a parseDate() entry point', () => {
    expect(output).toContain(`export function parseDate(input: string): Date`)
  })

  it('emits a private transform() stub', () => {
    expect(output).toContain(`function transform(tree: DateNode): Date`)
  })

  it('wraps RDParserException', () => {
    expect(output).toContain(`RDParserException`)
  })
})

// ── Pipeline scaffold ─────────────────────────────────────────────────────────

describe('generateScaffold — pipeline', () => {
  let output: string

  beforeAll(() => {
    output = generateScaffold(DATE_GRAMMAR, 'pipeline', { parserName: PARSER_NAME })
  })

  it('emits a domain type and ValidationError interface', () => {
    expect(output).toContain(`export interface Date {`)
    expect(output).toContain(`export interface ValidationError {`)
  })

  it('emits all three pipeline stage functions', () => {
    expect(output).toContain(`export function parse(input: string): DateNode`)
    expect(output).toContain(`export function validate(`)
    expect(output).toContain(`export function transform(tree: DateNode): Date`)
  })

  it('validate returns a Result discriminated union', () => {
    expect(output).toContain(`ok: true`)
    expect(output).toContain(`ok: false`)
    expect(output).toContain(`errors: ValidationError[]`)
  })
})

// ── Walker scaffold ───────────────────────────────────────────────────────────

describe('generateScaffold — walker', () => {
  let output: string

  beforeAll(() => {
    output = generateScaffold(DATE_GRAMMAR, 'walker', { parserName: PARSER_NAME })
  })

  it('imports childNodes and ParseTree from the parser module', () => {
    expect(output).toContain(`childNodes`)
    expect(output).toContain(`type ParseTree`)
    expect(output).toContain(`'./${PARSER_NAME}.js'`)
  })

  it('imports visit and Visitor from the runtime', () => {
    expect(output).toContain(`visit`)
    expect(output).toContain(`type Visitor`)
    expect(output).toContain(`'@configuredthings/rdp.js'`)
  })

  it('emits a walk() utility function', () => {
    expect(output).toContain(`export function walk(root: ParseTree`)
    expect(output).toContain(`for (const child of childNodes(root)) walk(child, fn)`)
  })

  it('includes a commented-out visitor stub for every rule', () => {
    for (const rule of ['Date', 'Year', 'Month', 'Day', 'Digit']) {
      expect(output).toContain(`'${rule}':`)
    }
  })
})

// ── Scaffold runtime — evaluator ──────────────────────────────────────────────

describe('evaluator scaffold — runtime', () => {
  let evaluate: (input: string) => unknown

  beforeAll(async () => {
    const parserSource = generateParser(DATE_GRAMMAR, { parserName: PARSER_NAME })
    const scaffoldSource = generateScaffold(DATE_GRAMMAR, 'evaluator', { parserName: PARSER_NAME })
    const { scaffold } = await importScaffold(scaffoldSource, parserSource, PARSER_NAME)
    evaluate = scaffold['evaluate'] as (input: string) => unknown
  })

  it('wraps a parse failure in a plain Error (not RDParserException)', () => {
    // Invalid input never reaches the stub — error translation fires first
    expect(() => evaluate('not-a-date')).toThrow(Error)
    expect(() => evaluate('not-a-date')).not.toThrow('RDParserException')
  })

  it('reaches the not-implemented stub on valid input', () => {
    // Valid input gets through the parser; the unfilled eval functions throw
    expect(() => evaluate('2024-01-15')).toThrow('not implemented')
  })
})

// ── Scaffold runtime — facade ─────────────────────────────────────────────────

describe('facade scaffold — runtime', () => {
  let parseDate: (input: string) => unknown
  let DateError: new (input: string) => Error

  beforeAll(async () => {
    const parserSource = generateParser(DATE_GRAMMAR, { parserName: PARSER_NAME })
    const scaffoldSource = generateScaffold(DATE_GRAMMAR, 'facade', { parserName: PARSER_NAME })
    const { scaffold } = await importScaffold(scaffoldSource, parserSource, PARSER_NAME)
    parseDate = scaffold['parseDate'] as (input: string) => unknown
    DateError = scaffold['DateError'] as new (input: string) => Error
  })

  it('throws DateError (not RDParserException) on invalid input', () => {
    expect(() => parseDate('not-a-date')).toThrow(DateError)
  })

  it('DateError carries the right .name', () => {
    let caught: unknown
    try {
      parseDate('bad')
    } catch (e) {
      caught = e
    }
    expect((caught as Error).name).toBe('DateError')
  })

  it('reaches the not-implemented transform stub on valid input', () => {
    expect(() => parseDate('2024-01-15')).toThrow('not implemented')
  })
})

// ── Scaffold runtime — pipeline ───────────────────────────────────────────────

describe('pipeline scaffold — runtime', () => {
  let parse: (input: string) => { kind: string }
  let validate: (tree: { kind: string }) => { ok: boolean }
  let transform: (tree: { kind: string }) => unknown

  beforeAll(async () => {
    const parserSource = generateParser(DATE_GRAMMAR, { parserName: PARSER_NAME })
    const scaffoldSource = generateScaffold(DATE_GRAMMAR, 'pipeline', { parserName: PARSER_NAME })
    const { scaffold } = await importScaffold(scaffoldSource, parserSource, PARSER_NAME)
    parse = scaffold['parse'] as typeof parse
    validate = scaffold['validate'] as typeof validate
    transform = scaffold['transform'] as typeof transform
  })

  it('parse() returns a DateNode for valid input', () => {
    const tree = parse('2024-01-15')
    expect(tree.kind).toBe('Date')
  })

  it('parse() throws SyntaxError on invalid input', () => {
    expect(() => parse('not-a-date')).toThrow(SyntaxError)
  })

  it('validate() returns ok:true out of the box (no logic yet)', () => {
    const tree = parse('2024-01-15')
    expect(validate(tree)).toEqual({ ok: true, tree })
  })

  it('transform() throws not-implemented', () => {
    const tree = parse('2024-01-15')
    expect(() => transform(tree)).toThrow('not implemented')
  })
})

// ── Scaffold runtime — walker ─────────────────────────────────────────────────

describe('walker scaffold — runtime', () => {
  let walk: (root: { kind: string }, fn: (n: { kind: string }) => void) => void
  let DateParser: { parse(s: string): { kind: string } }

  beforeAll(async () => {
    // Parser must be generated with --walker so it exports childNodes
    const parserSource = generateParser(DATE_GRAMMAR, { parserName: PARSER_NAME, walker: true })
    const scaffoldSource = generateScaffold(DATE_GRAMMAR, 'walker', { parserName: PARSER_NAME })
    const { scaffold, parser } = await importScaffold(scaffoldSource, parserSource, PARSER_NAME)
    walk = scaffold['walk'] as typeof walk
    DateParser = parser[PARSER_NAME] as typeof DateParser
  })

  it('walk() visits every non-terminal node in "2024-01-15"', () => {
    // Date(Year(D,D,D,D), Month(D,D), Day(D,D)) = 1+1+1+1+4+2+2 = 12 nodes
    const tree = DateParser.parse('2024-01-15')
    const visited: string[] = []
    walk(tree, (node) => visited.push(node.kind))
    expect(visited).toHaveLength(12)
    expect(visited[0]).toBe('Date')
  })
})

// ── Init scaffold ─────────────────────────────────────────────────────────────

describe('generateInitScaffold', () => {
  it('emits a plain RDParser subclass by default', () => {
    const output = generateInitScaffold({ className: 'MyParser' })
    expect(output).toContain(`class MyParser extends RDParser`)
    expect(output).toContain(`import { RDParser }`)
    expect(output).not.toContain('ObservableRDParser')
  })

  it('emits an ObservableRDParser subclass when observable is true', () => {
    const output = generateInitScaffold({ className: 'MyParser', observable: true })
    expect(output).toContain(`class MyParser extends ObservableRDParser`)
    expect(output).toContain(`notifyEnter`)
    expect(output).toContain(`notifyExit`)
  })

  it('uses the provided class name throughout', () => {
    const output = generateInitScaffold({ className: 'FooParser' })
    expect(output).toContain(`class FooParser`)
    expect(output).toContain(`new FooParser(`)
  })
})
