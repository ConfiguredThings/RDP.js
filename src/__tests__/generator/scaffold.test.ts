import { generateScaffold, generateInitScaffold } from '../../generator/scaffold.js'
import { generateParser } from '../../generator/codegen.js'
import { importScaffold } from '../../__testUtils__/generator-runtime.js'
const DATE_GRAMMAR = `Date = Year, '-', Month, '-', Day;\nYear = Digit, Digit, Digit, Digit;\nMonth = Digit, Digit;\nDay = Digit, Digit;\nDigit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';`
const PARSER_NAME = 'DateParser'

// ── Error cases ───────────────────────────────────────────────────────────────

describe('generateScaffold — error cases', () => {
  it('throws when no scaffold flags are provided', () => {
    expect(() => generateScaffold(DATE_GRAMMAR, {}, { parserName: PARSER_NAME })).toThrow(
      /At least one of --traversal, --transformer, or --lexer must be provided/,
    )
  })

  it('throws when --traversal interpreter is combined with --pipeline without --facade', () => {
    expect(() =>
      generateScaffold(
        DATE_GRAMMAR,
        { traversal: 'interpreter', pipeline: true },
        { parserName: PARSER_NAME },
      ),
    ).toThrow(/--traversal interpreter cannot be combined with --pipeline without --facade/)
  })
})

// ── Evaluator scaffold ────────────────────────────────────────────────────────

describe('generateScaffold — interpreter', () => {
  let output: string

  beforeAll(() => {
    output = generateScaffold(
      DATE_GRAMMAR,
      { traversal: 'interpreter' },
      { parserName: PARSER_NAME },
    )
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

// ── Walker scaffold ───────────────────────────────────────────────────────────

describe('generateScaffold — tree-walker', () => {
  let output: string

  beforeAll(() => {
    output = generateScaffold(
      DATE_GRAMMAR,
      { traversal: 'tree-walker' },
      { parserName: PARSER_NAME },
    )
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

// ── Facade + interpreter scaffold ───────────────────────────────────────────────

describe('generateScaffold — facade + interpreter', () => {
  let output: string

  beforeAll(() => {
    output = generateScaffold(
      DATE_GRAMMAR,
      { traversal: 'interpreter', facade: true },
      { parserName: PARSER_NAME },
    )
  })

  it('imports the parser class and every node type', () => {
    expect(output).toContain(`  ${PARSER_NAME},`)
    expect(output).toContain(`  type DateNode,`)
    expect(output).toContain(`  type YearNode,`)
    expect(output).toContain(`  type DigitNode,`)
    expect(output).toContain(`} from './${PARSER_NAME}.js'`)
  })

  it('emits a DateResult class with static from()', () => {
    expect(output).toContain(`export class DateResult`)
    expect(output).toContain(`static from(tree: DateNode): DateResult`)
  })

  it('emits a DateError class', () => {
    expect(output).toContain(`export class DateError extends Error`)
    expect(output).toContain(`this.name = 'DateError'`)
  })

  it('emits a parseDate() entry point that delegates to DateResult.from()', () => {
    expect(output).toContain(`export function parseDate(input: string): DateResult`)
    expect(output).toContain(`DateResult.from(tree)`)
  })

  it('wraps RDParserException in DateError', () => {
    expect(output).toContain(`throw new DateError(input)`)
    expect(output).toContain(`RDParserException`)
  })

  it('emits private eval functions for every rule', () => {
    expect(output).toContain(`function evalDate(node: DateNode): unknown`)
    expect(output).toContain(`function evalYear(node: YearNode): unknown`)
    expect(output).toContain(`function evalDigit(node: DigitNode): unknown`)
  })
})

// ── Facade + tree-walker scaffold ────────────────────────────────────────────

describe('generateScaffold — facade + tree-walker', () => {
  let output: string

  beforeAll(() => {
    output = generateScaffold(
      DATE_GRAMMAR,
      { traversal: 'tree-walker', facade: true },
      { parserName: PARSER_NAME },
    )
  })

  it('imports childNodes, ParseTree, root node type, visit, and Visitor', () => {
    expect(output).toContain(`childNodes`)
    expect(output).toContain(`type ParseTree`)
    expect(output).toContain(`type DateNode`)
    expect(output).toContain(`visit`)
    expect(output).toContain(`type Visitor`)
  })

  it('emits a DateResult class with static from()', () => {
    expect(output).toContain(`export class DateResult`)
    expect(output).toContain(`static from(tree: DateNode): DateResult`)
  })

  it('emits a DateError class', () => {
    expect(output).toContain(`export class DateError extends Error`)
  })

  it('emits a parseDate() entry point', () => {
    expect(output).toContain(`export function parseDate(input: string): DateResult`)
    expect(output).toContain(`DateResult.from(tree)`)
  })

  it('emits a private walk() utility', () => {
    expect(output).toContain(`function walk(root: ParseTree`)
    expect(output).toContain(`for (const child of childNodes(root)) walk(child, fn)`)
  })

  it('includes a commented visitor stub for every rule', () => {
    for (const rule of ['Date', 'Year', 'Month', 'Day', 'Digit']) {
      expect(output).toContain(`'${rule}':`)
    }
  })

  it('does not export walk', () => {
    expect(output).not.toContain(`export function walk`)
  })
})

// ── Facade + pipeline:interpreter scaffold ──────────────────────────────────────

describe('generateScaffold — facade + pipeline:interpreter', () => {
  let output: string

  beforeAll(() => {
    output = generateScaffold(
      DATE_GRAMMAR,
      { traversal: 'interpreter', pipeline: true, facade: true },
      { parserName: PARSER_NAME },
    )
  })

  it('imports all node types (needed by private eval functions)', () => {
    expect(output).toContain(`  type DateNode,`)
    expect(output).toContain(`  type YearNode,`)
    expect(output).toContain(`  type DigitNode,`)
  })

  it('emits a DateResult class with static from()', () => {
    expect(output).toContain(`export class DateResult`)
    expect(output).toContain(`static from(tree: DateNode): DateResult`)
  })

  it('emits a DateError class', () => {
    expect(output).toContain(`export class DateError extends Error`)
  })

  it('emits a parseDate() entry function that delegates to DatePipeline.run()', () => {
    expect(output).toContain(`export function parseDate(input: string): DateResult`)
    expect(output).toContain(`DatePipeline.run(input)`)
  })

  it('emits a private DatePipeline class with static private stages', () => {
    expect(output).toContain(`class DatePipeline`)
    expect(output).toContain(`static run(input: string): DateResult`)
    expect(output).toContain(`static #parse(input: string): DateNode`)
    expect(output).toContain(`static #validate(`)
    expect(output).toContain(`static #transform(tree: DateNode): DateResult`)
  })

  it('#validate returns a discriminated union with no errors array', () => {
    expect(output).toContain(`ok: true; tree: DateNode`)
    expect(output).toContain(`ok: false }`)
    expect(output).not.toContain(`errors: ValidationError`)
  })

  it('pipeline throws DateError on parse failure', () => {
    expect(output).toContain(`throw new DateError(input)`)
  })

  it('emits private eval functions for every rule', () => {
    expect(output).toContain(`function evalDate(node: DateNode): unknown`)
    expect(output).toContain(`function evalYear(node: YearNode): unknown`)
  })
})

// ── Facade + pipeline:tree-walker scaffold ─────────────────────────────────────────

describe('generateScaffold — facade + pipeline:tree-walker', () => {
  let output: string

  beforeAll(() => {
    output = generateScaffold(
      DATE_GRAMMAR,
      { traversal: 'tree-walker', pipeline: true, facade: true },
      { parserName: PARSER_NAME, treeName: 'ParseTree' },
    )
  })

  it('imports childNodes, ParseTree, root node type, visit, and Visitor', () => {
    expect(output).toContain(`childNodes`)
    expect(output).toContain(`type ParseTree`)
    expect(output).toContain(`type DateNode`)
    expect(output).toContain(`visit`)
    expect(output).toContain(`type Visitor`)
  })

  it('emits a DateResult class with static from()', () => {
    expect(output).toContain(`export class DateResult`)
    expect(output).toContain(`static from(tree: DateNode): DateResult`)
  })

  it('emits a DateError class', () => {
    expect(output).toContain(`export class DateError extends Error`)
  })

  it('emits a DatePipeline class with static private stages', () => {
    expect(output).toContain(`class DatePipeline`)
    expect(output).toContain(`static run(input: string): DateResult`)
    expect(output).toContain(`static #transform(tree: DateNode): DateResult`)
  })

  it('emits a private walk() utility (not exported)', () => {
    expect(output).toContain(`function walk(root: ParseTree`)
    expect(output).not.toContain(`export function walk`)
  })

  it('includes a commented visitor stub for every rule', () => {
    for (const rule of ['Date', 'Year', 'Month', 'Day', 'Digit']) {
      expect(output).toContain(`'${rule}':`)
    }
  })

  it('does not emit eval functions', () => {
    expect(output).not.toContain(`function evalDate`)
  })
})

// ── Pipeline + tree-walker scaffold ──────────────────────────────────────────

describe('generateScaffold — pipeline + tree-walker', () => {
  let output: string

  beforeAll(() => {
    output = generateScaffold(
      DATE_GRAMMAR,
      { traversal: 'tree-walker', pipeline: true },
      { parserName: PARSER_NAME, treeName: 'ParseTree' },
    )
  })

  it('imports childNodes, ParseTree, root node type, visit, and Visitor', () => {
    expect(output).toContain(`childNodes`)
    expect(output).toContain(`type ParseTree`)
    expect(output).toContain(`type DateNode`)
    expect(output).toContain(`visit`)
    expect(output).toContain(`type Visitor`)
  })

  it('emits a DateResult interface and ValidationError interface', () => {
    expect(output).toContain(`export interface DateResult`)
    expect(output).toContain(`export interface ValidationError`)
  })

  it('emits all three exported stage functions', () => {
    expect(output).toContain(`export function parse(input: string): DateNode`)
    expect(output).toContain(`export function validate(`)
    expect(output).toContain(`export function transform(tree: DateNode): DateResult`)
  })

  it('emits a loadDate() combinator', () => {
    expect(output).toContain(`export function loadDate(input: string): DateResult`)
    expect(output).toContain(`AggregateError`)
  })

  it('emits a private walk() utility (not exported)', () => {
    expect(output).toContain(`function walk(root: ParseTree`)
    expect(output).not.toContain(`export function walk`)
  })

  it('includes a commented visitor stub for every rule', () => {
    for (const rule of ['Date', 'Year', 'Month', 'Day', 'Digit']) {
      expect(output).toContain(`'${rule}':`)
    }
  })

  it('does not emit eval functions', () => {
    expect(output).not.toContain(`function evalDate`)
  })
})

// ── Scaffold runtime — interpreter ──────────────────────────────────────────────

describe('interpreter scaffold — runtime', () => {
  let evaluate: (input: string) => unknown

  beforeAll(async () => {
    const parserSource = generateParser(DATE_GRAMMAR, { parserName: PARSER_NAME })
    const scaffoldSource = generateScaffold(
      DATE_GRAMMAR,
      { traversal: 'interpreter' },
      {
        parserName: PARSER_NAME,
      },
    )
    const { scaffold } = await importScaffold(scaffoldSource, parserSource, PARSER_NAME)
    evaluate = scaffold['evaluate'] as (input: string) => unknown
  })

  it('wraps a parse failure in a plain Error (not RDParserException)', () => {
    expect(() => evaluate('not-a-date')).toThrow(Error)
    expect(() => evaluate('not-a-date')).not.toThrow('RDParserException')
  })

  it('reaches the not-implemented stub on valid input', () => {
    expect(() => evaluate('2024-01-15')).toThrow('not implemented')
  })
})

// ── Scaffold runtime — tree-walker ───────────────────────────────────────────

describe('tree-walker scaffold — runtime', () => {
  let walk: (root: { kind: string }, fn: (n: { kind: string }) => void) => void
  let DateParser: { parse(s: string): { kind: string } }

  beforeAll(async () => {
    const parserSource = generateParser(DATE_GRAMMAR, { parserName: PARSER_NAME })
    const scaffoldSource = generateScaffold(
      DATE_GRAMMAR,
      { traversal: 'tree-walker' },
      {
        parserName: PARSER_NAME,
      },
    )
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

// ── Scaffold runtime — facade + interpreter ────────────────────────────────────

describe('facade + interpreter scaffold — runtime', () => {
  let parseDate: (input: string) => unknown
  let DateError: new (input: string) => Error
  let DateResult: { from(tree: unknown): unknown }

  beforeAll(async () => {
    const parserSource = generateParser(DATE_GRAMMAR, { parserName: PARSER_NAME })
    const scaffoldSource = generateScaffold(
      DATE_GRAMMAR,
      { traversal: 'interpreter', facade: true },
      { parserName: PARSER_NAME },
    )
    const { scaffold } = await importScaffold(scaffoldSource, parserSource, PARSER_NAME)
    parseDate = scaffold['parseDate'] as (input: string) => unknown
    DateError = scaffold['DateError'] as new (input: string) => Error
    DateResult = scaffold['DateResult'] as typeof DateResult
  })

  it('throws DateError on invalid input', () => {
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

  it('reaches the not-implemented from() stub on valid input', () => {
    expect(() => parseDate('2024-01-15')).toThrow('not implemented')
  })

  it('DateResult.from() throws not-implemented directly', () => {
    expect(() => DateResult.from({})).toThrow('not implemented')
  })
})

// ── Scaffold runtime — facade + tree-walker ──────────────────────────────────

describe('facade + tree-walker scaffold — runtime', () => {
  let parseDate: (input: string) => unknown
  let DateError: new (input: string) => Error

  beforeAll(async () => {
    const parserSource = generateParser(DATE_GRAMMAR, { parserName: PARSER_NAME })
    const scaffoldSource = generateScaffold(
      DATE_GRAMMAR,
      { traversal: 'tree-walker', facade: true },
      { parserName: PARSER_NAME },
    )
    const { scaffold } = await importScaffold(scaffoldSource, parserSource, PARSER_NAME)
    parseDate = scaffold['parseDate'] as (input: string) => unknown
    DateError = scaffold['DateError'] as new (input: string) => Error
  })

  it('throws DateError on invalid input', () => {
    expect(() => parseDate('not-a-date')).toThrow(DateError)
  })

  it('reaches the not-implemented from() stub on valid input', () => {
    expect(() => parseDate('2024-01-15')).toThrow('not implemented')
  })
})

// ── Scaffold runtime — facade + pipeline:interpreter ────────────────────────────

describe('facade + pipeline:interpreter scaffold — runtime', () => {
  let parseDate: (input: string) => unknown
  let DateError: new (input: string) => Error

  beforeAll(async () => {
    const parserSource = generateParser(DATE_GRAMMAR, { parserName: PARSER_NAME })
    const scaffoldSource = generateScaffold(
      DATE_GRAMMAR,
      { traversal: 'interpreter', pipeline: true, facade: true },
      { parserName: PARSER_NAME },
    )
    const { scaffold } = await importScaffold(scaffoldSource, parserSource, PARSER_NAME)
    parseDate = scaffold['parseDate'] as (input: string) => unknown
    DateError = scaffold['DateError'] as new (input: string) => Error
  })

  it('throws DateError on invalid input (from #parse stage)', () => {
    expect(() => parseDate('not-a-date')).toThrow(DateError)
  })

  it('reaches not-implemented on valid input (from #transform)', () => {
    expect(() => parseDate('2024-01-15')).toThrow('not implemented')
  })
})

// ── Scaffold runtime — facade + pipeline:tree-walker ───────────────────────────────

describe('facade + pipeline:tree-walker scaffold — runtime', () => {
  let parseDate: (input: string) => unknown
  let DateError: new (input: string) => Error

  beforeAll(async () => {
    const parserSource = generateParser(DATE_GRAMMAR, { parserName: PARSER_NAME })
    const scaffoldSource = generateScaffold(
      DATE_GRAMMAR,
      { traversal: 'tree-walker', pipeline: true, facade: true },
      { parserName: PARSER_NAME, treeName: 'ParseTree' },
    )
    const { scaffold } = await importScaffold(scaffoldSource, parserSource, PARSER_NAME)
    parseDate = scaffold['parseDate'] as (input: string) => unknown
    DateError = scaffold['DateError'] as new (input: string) => Error
  })

  it('throws DateError on invalid input', () => {
    expect(() => parseDate('not-a-date')).toThrow(DateError)
  })

  it('reaches not-implemented on valid input', () => {
    expect(() => parseDate('2024-01-15')).toThrow('not implemented')
  })
})

// ── Scaffold runtime — pipeline + tree-walker ────────────────────────────────

describe('pipeline + tree-walker scaffold — runtime', () => {
  let parse: (input: string) => { kind: string }
  let validate: (tree: { kind: string }) => { ok: boolean }
  let transform: (tree: { kind: string }) => unknown
  let loadDate: (input: string) => unknown

  beforeAll(async () => {
    const parserSource = generateParser(DATE_GRAMMAR, { parserName: PARSER_NAME })
    const scaffoldSource = generateScaffold(
      DATE_GRAMMAR,
      { traversal: 'tree-walker', pipeline: true },
      { parserName: PARSER_NAME, treeName: 'ParseTree' },
    )
    const { scaffold } = await importScaffold(scaffoldSource, parserSource, PARSER_NAME)
    parse = scaffold['parse'] as typeof parse
    validate = scaffold['validate'] as typeof validate
    transform = scaffold['transform'] as typeof transform
    loadDate = scaffold['loadDate'] as typeof loadDate
  })

  it('parse() returns a DateNode for valid input', () => {
    expect(parse('2024-01-15').kind).toBe('Date')
  })

  it('parse() throws SyntaxError on invalid input', () => {
    expect(() => parse('not-a-date')).toThrow(SyntaxError)
  })

  it('validate() returns ok:true out of the box', () => {
    const tree = parse('2024-01-15')
    expect(validate(tree)).toEqual({ ok: true, tree })
  })

  it('transform() throws not-implemented', () => {
    const tree = parse('2024-01-15')
    expect(() => transform(tree)).toThrow('not implemented')
  })

  it('loadDate() throws SyntaxError on malformed input', () => {
    expect(() => loadDate('not-a-date')).toThrow(SyntaxError)
  })
})

// ── Transformer scaffold ──────────────────────────────────────────────────────

describe('generateScaffold — transformer', () => {
  let output: string

  beforeAll(() => {
    output = generateScaffold(
      DATE_GRAMMAR,
      { transformer: 'standard' },
      { parserName: PARSER_NAME },
    )
  })

  it('imports the parser, all node types, and ParseTree', () => {
    expect(output).toContain(`  ${PARSER_NAME},`)
    expect(output).toContain(`  type DateNode,`)
    expect(output).toContain(`  type YearNode,`)
    expect(output).toContain(`  type DigitNode,`)
    expect(output).toContain(`  type ParseTree,`)
    expect(output).toContain(`} from './${PARSER_NAME}.js'`)
  })

  it('imports transform and Transformer from the runtime', () => {
    expect(output).toContain(`transform`)
    expect(output).toContain(`type Transformer`)
    expect(output).toContain(`'@configuredthings/rdp.js'`)
  })

  it('emits an exported Transformer<ParseTree, unknown> object', () => {
    expect(output).toContain(`export const dateTransformer: Transformer<ParseTree, unknown>`)
  })

  it('has a handler stub for every grammar rule', () => {
    for (const rule of ['Date', 'Year', 'Month', 'Day', 'Digit']) {
      expect(output).toContain(`'${rule}'(node: ${rule}Node): unknown`)
    }
  })

  it('emits a transformDate() entry point', () => {
    expect(output).toContain(`export function transformDate(input: string): unknown`)
    expect(output).toContain(`transform(${PARSER_NAME}.parse(input), dateTransformer)`)
  })
})

// ── JSON transformer scaffold ─────────────────────────────────────────────────

describe('generateScaffold — json-transformer', () => {
  let output: string

  beforeAll(() => {
    output = generateScaffold(DATE_GRAMMAR, { transformer: 'json' }, { parserName: PARSER_NAME })
  })

  it('imports the parser, all node types, and ParseTree', () => {
    expect(output).toContain(`  ${PARSER_NAME},`)
    expect(output).toContain(`  type DateNode,`)
    expect(output).toContain(`  type DigitNode,`)
    expect(output).toContain(`  type ParseTree,`)
  })

  it('imports transform, Transformer, toJSONAST, fromJSONAST, and JSONAST from the runtime', () => {
    expect(output).toContain(`transform`)
    expect(output).toContain(`type Transformer`)
    expect(output).toContain(`toJSONAST`)
    expect(output).toContain(`fromJSONAST`)
    expect(output).toContain(`type JSONAST`)
    expect(output).toContain(`'@configuredthings/rdp.js'`)
  })

  it('emits a dateToJSON Transformer<ParseTree, JSONAST>', () => {
    expect(output).toContain(`export const dateToJSON: Transformer<ParseTree, JSONAST>`)
  })

  it('has a JSONAST handler stub for every grammar rule', () => {
    for (const rule of ['Date', 'Year', 'Month', 'Day', 'Digit']) {
      expect(output).toContain(`'${rule}'(node: ${rule}Node): JSONAST`)
    }
  })

  it('emits a jsonToDate Transformer<JSONAST, string> with all six JSON kinds', () => {
    expect(output).toContain(`export const jsonToDate: Transformer<JSONAST, string>`)
    for (const kind of ['string', 'number', 'boolean', 'null', 'array', 'object']) {
      expect(output).toContain(`${kind}(node`)
    }
  })

  it('emits dateToJSONString() and jsonStringToDate() round-trip helpers', () => {
    expect(output).toContain(`export function dateToJSONString(input: string): string`)
    expect(output).toContain(`fromJSONAST(transform(${PARSER_NAME}.parse(input), dateToJSON))`)
    expect(output).toContain(`export function jsonStringToDate(input: string): string`)
    expect(output).toContain(`transform(toJSONAST(input), jsonToDate)`)
  })
})

// ── Scaffold runtime — transformer ────────────────────────────────────────────

describe('transformer scaffold — runtime', () => {
  let transformDate: (input: string) => unknown

  beforeAll(async () => {
    const parserSource = generateParser(DATE_GRAMMAR, { parserName: PARSER_NAME })
    const scaffoldSource = generateScaffold(
      DATE_GRAMMAR,
      { transformer: 'standard' },
      {
        parserName: PARSER_NAME,
      },
    )
    const { scaffold } = await importScaffold(scaffoldSource, parserSource, PARSER_NAME)
    transformDate = scaffold['transformDate'] as (input: string) => unknown
  })

  it('reaches the not-implemented stub on valid input', () => {
    expect(() => transformDate('2024-01-15')).toThrow('not implemented')
  })
})

// ── Scaffold runtime — json-transformer ──────────────────────────────────────

describe('json-transformer scaffold — runtime', () => {
  let dateToJSONString: (input: string) => string
  let jsonStringToDate: (input: string) => string

  beforeAll(async () => {
    const parserSource = generateParser(DATE_GRAMMAR, { parserName: PARSER_NAME })
    const scaffoldSource = generateScaffold(
      DATE_GRAMMAR,
      { transformer: 'json' },
      {
        parserName: PARSER_NAME,
      },
    )
    const { scaffold } = await importScaffold(scaffoldSource, parserSource, PARSER_NAME)
    dateToJSONString = scaffold['dateToJSONString'] as (input: string) => string
    jsonStringToDate = scaffold['jsonStringToDate'] as (input: string) => string
  })

  it('dateToJSONString() reaches the not-implemented stub on valid input', () => {
    expect(() => dateToJSONString('2024-01-15')).toThrow('not implemented')
  })

  it('jsonStringToDate() reaches the not-implemented stub on valid JSON', () => {
    expect(() => jsonStringToDate('"2024-01-15"')).toThrow('not implemented')
  })
})

// ── Init scaffold ─────────────────────────────────────────────────────────────

describe('generateInitScaffold', () => {
  it('emits a plain ScannerlessRDParser subclass by default', () => {
    const output = generateInitScaffold({ className: 'MyParser' })
    expect(output).toContain(`class MyParser extends ScannerlessRDParser`)
    expect(output).toContain(`import { ScannerlessRDParser }`)
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
