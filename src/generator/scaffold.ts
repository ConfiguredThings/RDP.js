/**
 * Scaffold generators — emit one-time starter files for each usage pattern.
 *
 * The scaffold router resolves flags into an ordered stack of independent
 * sections, then composes them: each section declares its own imports, which
 * the composer merges and deduplicates before emitting the final file.
 *
 * Adding a new flag combination means adding a new branch to `planScaffold`
 * and, if needed, a new section generator — not a new monolithic function.
 */

import type { GrammarAST, ProductionRule, RuleBody } from './ast.js'
import { EBNFParser } from './ebnf-parser.js'
import { ABNFParser } from './abnf-parser.js'
import { detectLeftRecursion } from './left-recursion.js'
import { generateParser } from './codegen.js'
import type { GeneratorOptions } from './codegen.js'
import { inferFieldNames, typeForBody, emitTypeDeclarations } from './type-gen.js'

// ── Public enums ──────────────────────────────────────────────────────────────

/** How the generated scaffold traverses the parse tree. */
export const Traversal = {
  /** One typed `eval*` function per rule; evaluates directly from the tree. */
  Interpreter: 'interpreter',
  /** A `walk()` utility + `Visitor` stubs; driven by a depth-first tree walk. */
  TreeWalker: 'tree-walker',
} as const
export type Traversal = (typeof Traversal)[keyof typeof Traversal]

/** Which Transformer scaffold variant to emit. */
export const Transformer = {
  /** `Transformer<ParseTree, unknown>` with one handler stub per rule. */
  Standard: 'standard',
  /** Two-way stubs: `ParseTree → JSONAST` and `JSONAST → string`. */
  JSON: 'json',
} as const
export type Transformer = (typeof Transformer)[keyof typeof Transformer]

/** Tokenisation strategy for the generated parser. */
export const Lexer = {
  /** Characters → AST directly; no separate tokeniser (default). */
  Scannerless: 'scannerless',
  /** Emit a span tokeniser + classifier scaffold alongside the parser. */
  Span: 'span',
} as const
export type Lexer = (typeof Lexer)[keyof typeof Lexer]

// ── Public scaffold flags ─────────────────────────────────────────────────────

/**
 * Orthogonal scaffold configuration flags.
 *
 * Presence of any flag switches `generateScaffold` into scaffold mode.
 * `traversal` and `transformer` are mutually exclusive.
 * `pipeline` requires `traversal: tree-walker` (interpreter has no intermediate tree).
 */
export type ScaffoldFlags = {
  /** Traversal strategy mixed in to the generated scaffold. */
  traversal?: Traversal
  /** Emit a Transformer scaffold. */
  transformer?: Transformer
  /** Wrap the scaffold in a module-as-facade. */
  facade?: boolean
  /** Emit pipeline stages: `parse` / `validate` / `transform`. */
  pipeline?: boolean
  /** Tokenisation strategy for the generated parser. Defaults to `Lexer.Scannerless`. */
  lexer?: Lexer
}

// ── Internal types ────────────────────────────────────────────────────────────

/** Derived names built once from the grammar and generator options. */
type ScaffoldCtx = {
  parserName: string
  parserModule: string
  base: string
  camelBase: string
  treeName: string
  nodeTypes: string[]
  firstNodeType: string
  firstRuleName: string
  errorClass: string
  resultClass: string
  pipelineClass: string
  loadFn: string
  entryFn: string
  /** Import path for the transformer artifact (e.g. `./date-transformer.js`). */
  transformerModule: string
  /** Import path for the pipeline artifact (e.g. `./date-pipeline.js`). */
  pipelineModule: string
}

/** A single import declaration contributed by a section. */
type Import = { from: string; names: string[]; disabled?: true }

/** One logical block of generated code with its import requirements. */
type Section = { header: string | null; imports: Import[]; lines: string[] }

/** The full generation plan produced by `planScaffold`. */
type ScaffoldPlan = { variantLabel: string; stepsLines: string[]; sections: Section[] }

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Generate a one-time scaffold file driven by orthogonal `ScaffoldFlags`.
 *
 * @param source  - EBNF or ABNF grammar source text.
 * @param flags   - Which scaffold dimensions to include (see {@link ScaffoldFlags}).
 * @param options - Generator configuration (same options as `generateParser`).
 * @returns A TypeScript source string ready to write to a `.ts` file.
 * @throws {RDParserException} If the grammar is malformed or left-recursive.
 * @throws {Error} If an invalid flag combination is given.
 */
export function generateScaffold(
  source: string,
  flags: ScaffoldFlags,
  options: GeneratorOptions = {},
): string {
  const { traversal, transformer, pipeline, facade } = flags

  if (traversal && transformer) {
    throw new Error(
      `--traversal and --transformer are mutually exclusive. ` +
        `Use --traversal (interpreter or tree-walker) to walk the parse tree directly, ` +
        `or --transformer to emit a Transformer object — not both in the same scaffold.`,
    )
  }
  if (traversal === Traversal.Interpreter && pipeline) {
    throw new Error(
      '--traversal interpreter cannot be combined with --pipeline. ' +
        'The interpreter evaluates directly during parsing — there is no intermediate tree for ' +
        'the validate stage to inspect. Use --traversal tree-walker --pipeline instead.',
    )
  }

  const format = options.format ?? 'ebnf'
  const parserName = options.parserName ?? 'GeneratedParser'
  const treeName = options.treeName ?? 'ParseTree'

  const ast =
    format === 'abnf'
      ? ABNFParser.parse(source, {
          ...(options.caseSensitiveStrings !== undefined && {
            caseSensitiveStrings: options.caseSensitiveStrings,
          }),
        })
      : EBNFParser.parse(source)
  detectLeftRecursion(ast)

  // No separate scaffold file needed — route directly to the appropriate generator.
  if (!transformer && !facade && !pipeline) {
    if (flags.lexer === Lexer.Span && !traversal) {
      // Span-only: emit the span tokeniser scaffold.
      return generateSpanLexerScaffold(ast, parserName, false, treeName)
    }
    // Plain parser or traversal-mixin (scannerless or span+traversal): mixin stubs
    // land inside the parser class itself. Span tokeniser is a separate CLI concern.
    return generateParser(source, {
      ...options,
      ...(traversal !== undefined && { traversal }),
    })
  }

  if (flags.lexer === Lexer.Span) {
    if (!traversal && !transformer && !pipeline && !facade) {
      // Already handled above, but guard for safety.
      return generateSpanLexerScaffold(ast, parserName, false, treeName)
    }
    // Scaffold flags present — fall through to planScaffold.
    // The scaffold templates reference the parser by name and are lexer-agnostic;
    // the CLI writes the span-lexer parser to a separate file.
  }

  const ctx = buildCtx(ast, parserName, treeName)
  const plan = planScaffold(flags, ast, ctx)
  return compose(plan, ctx)
}

// ── Context builder ───────────────────────────────────────────────────────────

function buildCtx(ast: GrammarAST, parserName: string, treeName: string): ScaffoldCtx {
  const firstRule = ast.rules[0]
  const base = stripParserSuffix(parserName)
  const camelBase = base.charAt(0).toLowerCase() + base.slice(1)
  const nodeTypes = ast.rules.map((r) => `${pascalCase(r.name)}Node`)
  const firstNodeType = firstRule ? `${pascalCase(firstRule.name)}Node` : 'never'
  return {
    parserName,
    parserModule: `./${parserName}.js`,
    base,
    camelBase,
    treeName,
    nodeTypes,
    firstNodeType,
    firstRuleName: firstRule?.name ?? '',
    errorClass: `${base}Error`,
    resultClass: `${base}Result`,
    pipelineClass: `${base}Pipeline`,
    loadFn: `load${base}`,
    entryFn: `parse${base}`,
    transformerModule: `./${camelBase}-transformer.js`,
    pipelineModule: `./${camelBase}-pipeline.js`,
  }
}

// ── Planner ───────────────────────────────────────────────────────────────────

function planScaffold(flags: ScaffoldFlags, ast: GrammarAST, ctx: ScaffoldCtx): ScaffoldPlan {
  const { traversal, transformer, facade, pipeline } = flags

  // ── JSON transformer ────────────────────────────────────────────────────────
  if (transformer === Transformer.JSON) {
    if (facade && pipeline) {
      return {
        variantLabel: 'Facade + pipeline:json',
        stepsLines: [
          `// Steps: 1) fill in ${ctx.camelBase}ToJSON handlers  2) fill in jsonTo${ctx.base} handlers`,
          `//        3) add semantic validation in #validate  4) remove eslint-disable-next-line comments`,
        ],
        sections: [
          jsonTransformerSection(ast, ctx),
          errorSection(ctx),
          jsonPublicApiSection(ctx, true),
          jsonPipelineSection(ast, ctx),
        ],
      }
    }
    return {
      variantLabel: 'JSON transformer',
      stepsLines: [
        `// Steps: 1) fill in ${ctx.camelBase}ToJSON handlers  2) fill in jsonTo${ctx.base} handlers`,
        `//        3) remove eslint-disable-next-line comments — present only to keep stubs lint-clean`,
      ],
      sections: [jsonTransformerSection(ast, ctx), jsonPublicApiSection(ctx, false)],
    }
  }

  // ── Standard transformer ────────────────────────────────────────────────────
  if (transformer === Transformer.Standard) {
    return {
      variantLabel: 'Transformer',
      stepsLines: [
        `// Steps: 1) replace 'unknown' with your concrete return type  2) fill in the handlers`,
        `//        3) remove eslint-disable-next-line comments — present only to keep stubs lint-clean`,
      ],
      sections: [standardTransformerSection(ast, ctx)],
    }
  }

  // ── Interpreter ─────────────────────────────────────────────────────────────
  if (traversal === Traversal.Interpreter) {
    // facade is guaranteed here (pipeline+interpreter is validated out above)
    return {
      variantLabel: 'Facade + interpreter',
      stepsLines: [
        `// Steps: 1) define ${ctx.resultClass} constructor fields  2) fill in eval methods`,
        `//        3) implement static from() using the eval results  4) remove eslint-disable-next-line comments`,
      ],
      sections: [
        domainResultSection(ctx, Traversal.Interpreter),
        errorSection(ctx),
        facadePublicApiSection(ctx, false),
        interpreterPrivateSection(ast, ctx, {
          header:
            '// ── Private ──────────────────────────────────────────────────────────────────',
          withJsdoc: false,
        }),
      ],
    }
  }

  // ── Tree-walker ─────────────────────────────────────────────────────────────
  if (traversal === Traversal.TreeWalker) {
    if (facade && pipeline) {
      return {
        variantLabel: 'Facade + pipeline:tree-walker',
        stepsLines: [
          `// Steps: 1) define ${ctx.resultClass} fields  2) fill in #validate and #transform`,
          `//        3) implement ${ctx.resultClass}.from()  4) remove eslint-disable-next-line comments`,
        ],
        sections: [
          domainResultSection(ctx, Traversal.TreeWalker),
          errorSection(ctx),
          facadePublicApiSection(ctx, true),
          facadePipelineSection(ast, ctx, Traversal.TreeWalker),
          walkerPrivateSection(
            ast,
            ctx,
            '// ── Private walk utilities ───────────────────────────────────────────────────',
          ),
        ],
      }
    }
    if (facade) {
      return {
        variantLabel: 'Facade + tree-walker',
        stepsLines: [
          `// Steps: 1) define ${ctx.resultClass} fields  2) implement static from() using walk()`,
          `//        3) uncomment and fill in the visitor  4) remove eslint-disable-next-line comments`,
        ],
        sections: [
          domainResultSection(ctx, Traversal.TreeWalker),
          errorSection(ctx),
          facadePublicApiSection(ctx, false),
          walkerPrivateSection(
            ast,
            ctx,
            '// ── Private ──────────────────────────────────────────────────────────────────',
          ),
        ],
      }
    }
    if (pipeline) {
      return {
        variantLabel: 'Pipeline + tree-walker',
        stepsLines: [
          `// Steps: 1) define ${ctx.resultClass} fields  2) fill in validate()  3) fill in the visitor inside transform()`,
          `//        4) remove eslint-disable-next-line comments`,
        ],
        sections: [
          pipelineTypesSection(ctx),
          pipelineStagesSection(ast, ctx),
          walkerPrivateSection(
            ast,
            ctx,
            '// ── Private walk utilities ───────────────────────────────────────────────────',
          ),
        ],
      }
    }
  }

  throw new Error('unhandled scaffold flag combination')
}

// ── Composer ──────────────────────────────────────────────────────────────────

function compose(plan: ScaffoldPlan, ctx: ScaffoldCtx): string {
  const { variantLabel, stepsLines, sections } = plan
  const lines: string[] = []

  lines.push(
    `// ${variantLabel} scaffold generated by rdp-gen — this file is not regenerated; edit freely.`,
  )
  for (const l of stepsLines) lines.push(l)
  lines.push('')

  // Merge imports: deduplicate names per module, preserve first-seen module order.
  const importMap = new Map<string, { names: string[]; disabled: boolean }>()
  const importOrder: string[] = []
  for (const section of sections) {
    for (const imp of section.imports) {
      if (!importMap.has(imp.from)) {
        importMap.set(imp.from, { names: [], disabled: imp.disabled === true })
        importOrder.push(imp.from)
      }
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const entry = importMap.get(imp.from)!
      for (const name of imp.names) {
        if (!entry.names.includes(name)) entry.names.push(name)
      }
    }
  }

  for (const from of importOrder) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const { names, disabled } = importMap.get(from)!
    // Within each module: values (no "type " prefix) first, then types.
    const sorted = [
      ...names.filter((n) => !n.startsWith('type ')),
      ...names.filter((n) => n.startsWith('type ')),
    ]
    if (disabled) lines.push(`// eslint-disable-next-line @typescript-eslint/no-unused-vars`)
    // Use multi-line format for the parser module when many names; single-line otherwise.
    if (from === ctx.parserModule && sorted.length > 4) {
      lines.push(`import {`)
      for (const name of sorted) lines.push(`  ${name},`)
      lines.push(`} from '${from}'`)
    } else {
      lines.push(`import { ${sorted.join(', ')} } from '${from}'`)
    }
  }
  if (importOrder.length > 0) lines.push('')

  for (const section of sections) {
    if (section.header) {
      lines.push(section.header)
      lines.push('')
    }
    lines.push(...section.lines)
  }

  return lines.join('\n')
}

// ── Section generators ────────────────────────────────────────────────────────

/** Eval stub functions — one per grammar rule (used by facade+interpreter). */
function interpreterPrivateSection(
  ast: GrammarAST,
  ctx: ScaffoldCtx,
  opts: { header: string | null; withJsdoc: boolean },
): Section {
  const nodeTypeNames = ast.rules.map((r) => `type ${pascalCase(r.name)}Node`)
  const lines: string[] = []

  for (const rule of ast.rules) {
    const nodeType = `${pascalCase(rule.name)}Node`
    lines.push(``)
    if (opts.withJsdoc) {
      lines.push(`/**`)
      lines.push(` * Evaluate a \`${rule.name}\` node.`)
      lines.push(` *`)
      lines.push(` * @param node - The {@link ${nodeType}} to evaluate.`)
      lines.push(` * @returns The evaluated result (replace \`unknown\` with your concrete type).`)
      lines.push(` */`)
    }
    lines.push(`// eslint-disable-next-line @typescript-eslint/no-unused-vars`)
    lines.push(`function eval${pascalCase(rule.name)}(node: ${nodeType}): unknown {`)
    for (const hint of fieldHints(rule)) lines.push(`  // ${hint}`)
    lines.push(`  throw new Error('not implemented')`)
    lines.push(`}`)
  }
  lines.push(``)

  return {
    header: opts.header,
    imports: [{ from: ctx.parserModule, names: nodeTypeNames }],
    lines,
  }
}

/** Private `walk()` + visitor template for facade/pipeline walker cases. */
function walkerPrivateSection(ast: GrammarAST, ctx: ScaffoldCtx, header: string): Section {
  const lines: string[] = [
    `// eslint-disable-next-line @typescript-eslint/no-unused-vars`,
    `function walk(root: ${ctx.treeName}, fn: (node: ${ctx.treeName}) => void): void {`,
    `  fn(root)`,
    `  for (const child of childNodes(root)) walk(child, fn)`,
    `}`,
    ``,
    `// Add handlers for the node kinds you care about.`,
    `// Use Required<Visitor<${ctx.treeName}>> to enforce that every kind is handled.`,
    `//`,
    `// const visitor: Visitor<${ctx.treeName}> = {`,
    ...ast.rules.map((r) => `//   '${r.name}': (node) => { /* ... */ },`),
    `// }`,
    `//`,
    `// walk(tree, (node) => visit(node, visitor))`,
    ``,
  ]
  return {
    header,
    imports: [
      { from: ctx.parserModule, names: ['childNodes', `type ${ctx.treeName}`] },
      { from: '@configuredthings/rdp.js', names: ['visit', `type Visitor`] },
    ],
    lines,
  }
}

/** Domain result class (`XxxResult`) — body differs by traversal strategy. */
function domainResultSection(ctx: ScaffoldCtx, strategy: Traversal): Section {
  const fromBody =
    strategy === Traversal.Interpreter
      ? `    // Call the private eval functions to extract values, then construct.`
      : `    // Use walk() and visitor to extract values, then construct.`
  return {
    header: '// ── Domain type ──────────────────────────────────────────────────────────────',
    imports: [{ from: ctx.parserModule, names: [`type ${ctx.firstNodeType}`] }],
    lines: [
      `/**`,
      ` * Domain representation of a successfully parsed input.`,
      ` *`,
      strategy === Traversal.Interpreter
        ? ` * Replace the constructor stub with the fields that make sense for your domain.`
        : ` * Replace the constructor stub with the fields for your domain.`,
      strategy === Traversal.Interpreter
        ? ` * The private eval functions below produce the raw values; \`from()\` assembles them.`
        : ` * {@link ${ctx.resultClass}.from} walks the tree to build this object.`,
      ` */`,
      `export class ${ctx.resultClass} {`,
      `  // TODO: define constructor fields`,
      `  constructor() {}`,
      ``,
      `  /**`,
      strategy === Traversal.Interpreter
        ? `   * Build a {@link ${ctx.resultClass}} from the raw parse tree.`
        : `   * Build a {@link ${ctx.resultClass}} by walking the parse tree.`,
      `   */`,
      `  // eslint-disable-next-line @typescript-eslint/no-unused-vars`,
      `  static from(tree: ${ctx.firstNodeType}): ${ctx.resultClass} {`,
      fromBody,
      `    throw new Error('not implemented')`,
      `  }`,
      `}`,
      ``,
    ],
  }
}

/** Error class (`XxxError`). */
function errorSection(ctx: ScaffoldCtx): Section {
  return {
    header: null,
    imports: [],
    lines: [
      `/**`,
      ` * Thrown by the public API when \`input\` does not match the grammar`,
      ` * or fails semantic validation.`,
      ` */`,
      `export class ${ctx.errorClass} extends Error {`,
      `  constructor(input: string) {`,
      `    super(\`invalid input: "\${input}"\`)`,
      `    this.name = '${ctx.errorClass}'`,
      `  }`,
      `}`,
      ``,
    ],
  }
}

/**
 * Public API for facade patterns (interpreter and walker).
 * When `hasPipeline` is true the body delegates to `XxxPipeline.run()`;
 * otherwise it parses inline and calls `XxxResult.from()`.
 */
function facadePublicApiSection(ctx: ScaffoldCtx, hasPipeline: boolean): Section {
  const body = hasPipeline
    ? [`  return ${ctx.pipelineClass}.run(input)`]
    : [
        `  let tree: ${ctx.firstNodeType}`,
        `  try {`,
        `    tree = ${ctx.parserName}.parse(input)`,
        `  } catch (e) {`,
        `    if (e instanceof RDParserException) throw new ${ctx.errorClass}(input)`,
        `    throw e`,
        `  }`,
        `  return ${ctx.resultClass}.from(tree)`,
      ]
  return {
    header: '// ── Public API ───────────────────────────────────────────────────────────────',
    imports: [
      { from: ctx.parserModule, names: [ctx.parserName, `type ${ctx.firstNodeType}`] },
      { from: '@configuredthings/rdp.js', names: ['RDParserException'] },
    ],
    lines: [
      `/**`,
      ` * Parse \`input\` and return a domain {@link ${ctx.resultClass}} object.`,
      ` *`,
      ` * @param input - Source string to parse.`,
      ` * @returns A {@link ${ctx.resultClass}} representing the parsed input.`,
      ` * @throws {@link ${ctx.errorClass}} If \`input\` does not match the grammar.`,
      ` */`,
      `export function ${ctx.entryFn}(input: string): ${ctx.resultClass} {`,
      ...body,
      `}`,
      ``,
    ],
  }
}

/**
 * Private `XxxPipeline` class with `#parse` / `#validate` / `#transform` stages.
 * The `#transform` body is a stub for interpreter/walker; for json it calls `fromJSONAST`.
 */
function facadePipelineSection(
  ast: GrammarAST,
  ctx: ScaffoldCtx,
  strategy: typeof Traversal.TreeWalker | typeof Transformer.JSON,
): Section {
  const returnType = strategy === Transformer.JSON ? 'string' : ctx.resultClass

  const transformBody =
    strategy === Transformer.JSON
      ? [`    return fromJSONAST(transform(tree, ${ctx.camelBase}ToJSON))`]
      : [
          `    // Use walk() and visitor to build the result, then return ${ctx.resultClass}.from(tree).`,
          `    throw new Error('not implemented')`,
        ]

  const walkerCommentLines =
    strategy === Traversal.TreeWalker
      ? [
          ``,
          `// Add handlers for the node kinds you care about.`,
          `//`,
          `// const visitor: Visitor<${ctx.treeName}> = {`,
          ...ast.rules.map((r) => `//   '${r.name}': (node) => { /* ... */ },`),
          `// }`,
        ]
      : []

  const rdpjsImports =
    strategy === Transformer.JSON
      ? ['RDParserException', 'transform', 'fromJSONAST']
      : ['RDParserException', 'visit', `type Visitor`]

  const parserImports =
    strategy === Traversal.TreeWalker
      ? [ctx.parserName, `type ${ctx.firstNodeType}`, 'childNodes', `type ${ctx.treeName}`]
      : [ctx.parserName, `type ${ctx.firstNodeType}`]

  return {
    header: '// ── Pipeline (private) ───────────────────────────────────────────────────────',
    imports: [
      { from: ctx.parserModule, names: parserImports },
      { from: '@configuredthings/rdp.js', names: rdpjsImports },
    ],
    lines: [
      `class ${ctx.pipelineClass} {`,
      `  static run(input: string): ${returnType} {`,
      `    const tree   = ${ctx.pipelineClass}.#parse(input)`,
      `    const result = ${ctx.pipelineClass}.#validate(tree)`,
      `    if (!result.ok) throw new ${ctx.errorClass}(input)`,
      `    return ${ctx.pipelineClass}.#transform(result.tree)`,
      `  }`,
      ``,
      `  static #parse(input: string): ${ctx.firstNodeType} {`,
      `    try {`,
      `      return ${ctx.parserName}.parse(input)`,
      `    } catch (e) {`,
      `      if (e instanceof RDParserException) throw new ${ctx.errorClass}(input)`,
      `      throw e`,
      `    }`,
      `  }`,
      ``,
      `  // eslint-disable-next-line @typescript-eslint/no-unused-vars`,
      `  static #validate(`,
      `    tree: ${ctx.firstNodeType},`,
      `  ): { ok: true; tree: ${ctx.firstNodeType} } | { ok: false } {`,
      `    // TODO: add semantic validation; return { ok: false } to reject`,
      `    return { ok: true, tree }`,
      `  }`,
      ``,
      `  // eslint-disable-next-line @typescript-eslint/no-unused-vars`,
      `  static #transform(tree: ${ctx.firstNodeType}): ${returnType} {`,
      ...transformBody,
      `  }`,
      `}`,
      ...walkerCommentLines,
      ``,
    ],
  }
}

/** Result interface + ValidationError interface for the standalone pipeline walker. */
function pipelineTypesSection(ctx: ScaffoldCtx): Section {
  return {
    header: '// ── Types ────────────────────────────────────────────────────────────────────',
    imports: [],
    lines: [
      `/**`,
      ` * Domain representation produced by the final pipeline stage.`,
      ` *`,
      ` * Replace this empty interface with the fields you want {@link transform} to return.`,
      ` */`,
      `// eslint-disable-next-line @typescript-eslint/no-empty-object-type`,
      `export interface ${ctx.resultClass} {`,
      `  // TODO: define your domain type`,
      `}`,
      ``,
      `/**`,
      ` * A single semantic error found during {@link validate}.`,
      ` */`,
      `export interface ValidationError {`,
      `  message: string`,
      `}`,
      ``,
    ],
  }
}

/** Exported `parse` / `validate` / `transform` + `loadXxx` for the standalone pipeline walker. */
function pipelineStagesSection(ast: GrammarAST, ctx: ScaffoldCtx): Section {
  const lines: string[] = [
    `// ── Stage 1: parse ───────────────────────────────────────────────────────────`,
    ``,
    `/**`,
    ` * Stage 1 — parse \`input\` into a typed parse tree.`,
    ` *`,
    ` * @param input - Source string to parse.`,
    ` * @returns The root {@link ${ctx.firstNodeType}} of the parse tree.`,
    ` * @throws {SyntaxError} If \`input\` does not match the grammar.`,
    ` */`,
    `export function parse(input: string): ${ctx.firstNodeType} {`,
    `  try {`,
    `    return ${ctx.parserName}.parse(input)`,
    `  } catch (e) {`,
    `    if (e instanceof RDParserException) throw new SyntaxError(e.message)`,
    `    throw e`,
    `  }`,
    `}`,
    ``,
    `// ── Stage 2: validate ────────────────────────────────────────────────────────`,
    ``,
    `/**`,
    ` * Stage 2 — check the parse tree for semantic errors.`,
    ` *`,
    ` * @param tree - Parse tree returned by {@link parse}.`,
    ` * @returns \`{ ok: true, tree }\` when valid, or \`{ ok: false, errors }\` otherwise.`,
    ` */`,
    `export function validate(`,
    `  tree: ${ctx.firstNodeType},`,
    `): { ok: true; tree: ${ctx.firstNodeType} } | { ok: false; errors: ValidationError[] } {`,
    `  const errors: ValidationError[] = []`,
    `  // TODO: add validation logic`,
    `  return errors.length > 0 ? { ok: false, errors } : { ok: true, tree }`,
    `}`,
    ``,
    `// ── Stage 3: transform ───────────────────────────────────────────────────────`,
    ``,
    `/**`,
    ` * Stage 3 — convert the validated parse tree into a domain {@link ${ctx.resultClass}} object.`,
    ` *`,
    ` * @param tree - Validated parse tree from {@link validate}.`,
    ` * @returns The domain object.`,
    ` */`,
    `// eslint-disable-next-line @typescript-eslint/no-unused-vars`,
    `export function transform(tree: ${ctx.firstNodeType}): ${ctx.resultClass} {`,
    `  // Use walk() and visitor to collect values, then construct ${ctx.resultClass}.`,
    `  throw new Error('not implemented')`,
    `}`,
    ``,
    `// ── Combinator ───────────────────────────────────────────────────────────────`,
    ``,
    `/**`,
    ` * Parse, validate, and transform \`input\` in one call.`,
    ` *`,
    ` * @param input - Source string to load.`,
    ` * @returns The domain object.`,
    ` * @throws {SyntaxError} If \`input\` does not match the grammar.`,
    ` * @throws {AggregateError} If \`input\` fails semantic validation.`,
    ` */`,
    `export function ${ctx.loadFn}(input: string): ${ctx.resultClass} {`,
    `  const tree   = parse(input)`,
    `  const result = validate(tree)`,
    `  if (!result.ok) throw new AggregateError(result.errors, \`invalid ${ctx.base}: "\${input}"\`)`,
    `  return transform(result.tree)`,
    `}`,
    ``,
  ]
  return {
    header: null,
    imports: [
      {
        from: ctx.parserModule,
        names: [ctx.parserName, 'childNodes', `type ${ctx.treeName}`, `type ${ctx.firstNodeType}`],
      },
      { from: '@configuredthings/rdp.js', names: ['RDParserException', 'visit', `type Visitor`] },
    ],
    lines,
  }
}

/** Standard `Transformer<Tree, unknown>` object + `transformXxx()` entry point. */
function standardTransformerSection(ast: GrammarAST, ctx: ScaffoldCtx): Section {
  const lines: string[] = [
    `// eslint-disable-next-line @typescript-eslint/no-unused-vars`,
    `export const ${ctx.camelBase}Transformer: Transformer<${ctx.treeName}, unknown> = {`,
  ]
  for (const rule of ast.rules) {
    const nodeType = `${pascalCase(rule.name)}Node`
    lines.push(``)
    lines.push(`  // eslint-disable-next-line @typescript-eslint/no-unused-vars`)
    lines.push(`  '${rule.name}'(node: ${nodeType}): unknown {`)
    for (const hint of fieldHints(rule)) lines.push(`    // ${hint}`)
    lines.push(`    throw new Error('not implemented')`)
    lines.push(`  },`)
  }
  lines.push(
    `}`,
    ``,
    `/**`,
    ` * Parse \`input\` and transform it in one call.`,
    ` *`,
    ` * @param input - Source string to parse and transform.`,
    ` * @returns The transformed result.`,
    ` */`,
    `// eslint-disable-next-line @typescript-eslint/no-unused-vars`,
    `export function transform${ctx.base}(input: string): unknown {`,
    `  return transform(${ctx.parserName}.parse(input), ${ctx.camelBase}Transformer)`,
    `}`,
    ``,
  )
  return {
    header: null,
    imports: [
      {
        from: ctx.parserModule,
        names: [ctx.parserName, ...ctx.nodeTypes.map((t) => `type ${t}`), `type ${ctx.treeName}`],
      },
      { from: '@configuredthings/rdp.js', names: ['transform', `type Transformer`] },
    ],
    lines,
  }
}

/** Two-way JSON transformer stubs (`xxxToJSON` and `jsonToXxx`). */
function jsonTransformerSection(ast: GrammarAST, ctx: ScaffoldCtx): Section {
  const lines: string[] = [
    `// ── ${ctx.base} → JSON ──────────────────────────────────────────────────────────────`,
    ``,
    `// eslint-disable-next-line @typescript-eslint/no-unused-vars`,
    `export const ${ctx.camelBase}ToJSON: Transformer<${ctx.treeName}, JSONAST> = {`,
  ]
  for (const rule of ast.rules) {
    const nodeType = `${pascalCase(rule.name)}Node`
    lines.push(``)
    lines.push(`  // eslint-disable-next-line @typescript-eslint/no-unused-vars`)
    lines.push(`  '${rule.name}'(node: ${nodeType}): JSONAST {`)
    for (const hint of fieldHints(rule)) lines.push(`    // ${hint}`)
    lines.push(`    throw new Error('not implemented')`)
    lines.push(`  },`)
  }
  lines.push(
    `}`,
    ``,
    `// ── JSON → ${ctx.base} ──────────────────────────────────────────────────────────────`,
    ``,
    `// eslint-disable-next-line @typescript-eslint/no-unused-vars`,
    `export const jsonTo${ctx.base}: Transformer<JSONAST, string> = {`,
    ``,
    `  // eslint-disable-next-line @typescript-eslint/no-unused-vars`,
    `  string(node): string { throw new Error('not implemented') },`,
    ``,
    `  // eslint-disable-next-line @typescript-eslint/no-unused-vars`,
    `  number(node): string { throw new Error('not implemented') },`,
    ``,
    `  // eslint-disable-next-line @typescript-eslint/no-unused-vars`,
    `  boolean(node): string { throw new Error('not implemented') },`,
    ``,
    `  // eslint-disable-next-line @typescript-eslint/no-unused-vars`,
    `  null(node): string { throw new Error('not implemented') },`,
    ``,
    `  // eslint-disable-next-line @typescript-eslint/no-unused-vars`,
    `  array(node): string { throw new Error('not implemented') },`,
    ``,
    `  // eslint-disable-next-line @typescript-eslint/no-unused-vars`,
    `  object(node): string { throw new Error('not implemented') },`,
    `}`,
    ``,
  )
  return {
    header: null,
    imports: [
      {
        from: ctx.parserModule,
        names: [ctx.parserName, ...ctx.nodeTypes.map((t) => `type ${t}`), `type ${ctx.treeName}`],
      },
      {
        from: '@configuredthings/rdp.js',
        names: ['transform', `type Transformer`, 'toJSONAST', 'fromJSONAST', `type JSONAST`],
      },
    ],
    lines,
  }
}

/**
 * Round-trip helper functions for JSON transformer.
 * When `hasPipeline` is true, `xxxToJSONString` delegates to `XxxPipeline.run()`.
 */
function jsonPublicApiSection(ctx: ScaffoldCtx, hasPipeline: boolean): Section {
  const toJSONBody = hasPipeline
    ? `  return ${ctx.pipelineClass}.run(input)`
    : `  return fromJSONAST(transform(${ctx.parserName}.parse(input), ${ctx.camelBase}ToJSON))`

  const toJSONThrows = hasPipeline
    ? [
        ` * @throws {@link ${ctx.errorClass}} If \`input\` does not match the grammar or is invalid.`,
      ]
    : []

  const lines: string[] = [
    `/**`,
    ` * Parse \`input\` as ${ctx.base} format and serialise the result to a JSON string.`,
    ` *`,
    ` * @param input - Source string in ${ctx.base} format.`,
    ` * @returns A JSON string.`,
    ...toJSONThrows,
    ` */`,
    `export function ${ctx.camelBase}ToJSONString(input: string): string {`,
    toJSONBody,
    `}`,
    ``,
    `/**`,
    ` * Parse \`input\` as a JSON string and emit it in ${ctx.base} format.`,
    ` *`,
    ` * @param input - A valid JSON string.`,
    ` * @returns A string in ${ctx.base} format.`,
    ` */`,
    `export function jsonStringTo${ctx.base}(input: string): string {`,
    `  return transform(toJSONAST(input), jsonTo${ctx.base})`,
    `}`,
    ``,
  ]
  return {
    header: hasPipeline
      ? '// ── Public API ───────────────────────────────────────────────────────────────'
      : '// ── Round-trip helpers ───────────────────────────────────────────────────────',
    imports: hasPipeline
      ? [{ from: '@configuredthings/rdp.js', names: ['RDParserException'] }]
      : [],
    lines,
  }
}

/** Private `XxxPipeline` class for the facade+pipeline+json pattern. */
function jsonPipelineSection(ast: GrammarAST, ctx: ScaffoldCtx): Section {
  return facadePipelineSection(ast, ctx, 'json')
}

// ── Multi-file split sections ─────────────────────────────────────────────────

/**
 * Exported `XxxPipeline` class for the split facade+pipeline+json pattern.
 * Lives in its own file; imports `xxxToJSON` from the transformer artifact.
 */
function splitJsonPipelineSection(ctx: ScaffoldCtx): Section {
  return {
    header: '// ── Pipeline ────────────────────────────────────────────────────────────────',
    imports: [
      { from: ctx.parserModule, names: [ctx.parserName, `type ${ctx.firstNodeType}`] },
      { from: ctx.transformerModule, names: [`${ctx.camelBase}ToJSON`] },
      {
        from: '@configuredthings/rdp.js',
        names: ['RDParserException', 'transform', 'fromJSONAST'],
      },
    ],
    lines: [
      `export class ${ctx.pipelineClass} {`,
      `  static run(input: string): string {`,
      `    const tree   = ${ctx.pipelineClass}.#parse(input)`,
      `    const result = ${ctx.pipelineClass}.#validate(tree)`,
      `    if (!result.ok) throw new ${ctx.errorClass}(input)`,
      `    return ${ctx.pipelineClass}.#transform(result.tree)`,
      `  }`,
      ``,
      `  static #parse(input: string): ${ctx.firstNodeType} {`,
      `    try {`,
      `      return ${ctx.parserName}.parse(input)`,
      `    } catch (e) {`,
      `      if (e instanceof RDParserException) throw new ${ctx.errorClass}(input)`,
      `      throw e`,
      `    }`,
      `  }`,
      ``,
      `  // eslint-disable-next-line @typescript-eslint/no-unused-vars`,
      `  static #validate(`,
      `    tree: ${ctx.firstNodeType},`,
      `  ): { ok: true; tree: ${ctx.firstNodeType} } | { ok: false } {`,
      `    // TODO: add semantic validation; return { ok: false } to reject`,
      `    return { ok: true, tree }`,
      `  }`,
      ``,
      `  // eslint-disable-next-line @typescript-eslint/no-unused-vars`,
      `  static #transform(tree: ${ctx.firstNodeType}): string {`,
      `    return fromJSONAST(transform(tree, ${ctx.camelBase}ToJSON))`,
      `  }`,
      `}`,
      ``,
    ],
  }
}

/**
 * Facade public API for the split facade+pipeline+json pattern.
 * Re-exports `XxxError` from the pipeline artifact so consumers have a single import point.
 */
function splitFacadeJsonWithPipelineSection(ctx: ScaffoldCtx): Section {
  return {
    header: null,
    imports: [
      { from: ctx.pipelineModule, names: [ctx.pipelineClass] },
      { from: ctx.transformerModule, names: [`jsonTo${ctx.base}`] },
      { from: '@configuredthings/rdp.js', names: ['transform', 'toJSONAST'] },
    ],
    lines: [
      `export { ${ctx.errorClass} } from '${ctx.pipelineModule}'`,
      ``,
      `/**`,
      ` * Parse \`input\` as ${ctx.base} format and serialise the result to a JSON string.`,
      ` *`,
      ` * @param input - Source string in ${ctx.base} format.`,
      ` * @returns A JSON string.`,
      ` * @throws {\`${ctx.errorClass}\`} If \`input\` does not match the grammar or is invalid.`,
      ` */`,
      `export function ${ctx.camelBase}ToJSONString(input: string): string {`,
      `  return ${ctx.pipelineClass}.run(input)`,
      `}`,
      ``,
      `/**`,
      ` * Parse \`input\` as a JSON string and emit it in ${ctx.base} format.`,
      ` *`,
      ` * @param input - A valid JSON string.`,
      ` * @returns A string in ${ctx.base} format.`,
      ` */`,
      `export function jsonStringTo${ctx.base}(input: string): string {`,
      `  return transform(toJSONAST(input), jsonTo${ctx.base})`,
      `}`,
      ``,
    ],
  }
}

/**
 * Facade public API for the split facade+json pattern (no pipeline).
 * Parses inline and wraps `RDParserException` in `XxxError`.
 */
function splitFacadeJsonNoPipelineSection(ctx: ScaffoldCtx): Section {
  return {
    header: null,
    imports: [
      { from: ctx.parserModule, names: [ctx.parserName, `type ${ctx.firstNodeType}`] },
      { from: ctx.transformerModule, names: [`${ctx.camelBase}ToJSON`, `jsonTo${ctx.base}`] },
      {
        from: '@configuredthings/rdp.js',
        names: ['RDParserException', 'transform', 'toJSONAST', 'fromJSONAST'],
      },
    ],
    lines: [
      `export class ${ctx.errorClass} extends Error {`,
      `  constructor(input: string) {`,
      `    super(\`invalid input: "\${input}"\`)`,
      `    this.name = '${ctx.errorClass}'`,
      `  }`,
      `}`,
      ``,
      `/**`,
      ` * Parse \`input\` as ${ctx.base} format and serialise the result to a JSON string.`,
      ` *`,
      ` * @param input - Source string in ${ctx.base} format.`,
      ` * @returns A JSON string.`,
      ` * @throws {\`${ctx.errorClass}\`} If \`input\` does not match the grammar.`,
      ` */`,
      `export function ${ctx.camelBase}ToJSONString(input: string): string {`,
      `  let tree: ${ctx.firstNodeType}`,
      `  try {`,
      `    tree = ${ctx.parserName}.parse(input)`,
      `  } catch (e) {`,
      `    if (e instanceof RDParserException) throw new ${ctx.errorClass}(input)`,
      `    throw e`,
      `  }`,
      `  return fromJSONAST(transform(tree, ${ctx.camelBase}ToJSON))`,
      `}`,
      ``,
      `/**`,
      ` * Parse \`input\` as a JSON string and emit it in ${ctx.base} format.`,
      ` *`,
      ` * @param input - A valid JSON string.`,
      ` * @returns A string in ${ctx.base} format.`,
      ` */`,
      `export function jsonStringTo${ctx.base}(input: string): string {`,
      `  return transform(toJSONAST(input), jsonTo${ctx.base})`,
      `}`,
      ``,
    ],
  }
}

// ── Multi-file public entry point ─────────────────────────────────────────────

/** Derive the output filename for a single-artifact scaffold. */
function scaffoldFilename(flags: ScaffoldFlags, ctx: ScaffoldCtx): string {
  if (flags.facade) return `${ctx.camelBase}-facade.ts`
  if (flags.pipeline) return `${ctx.camelBase}-pipeline.ts`
  if (flags.transformer) return `${ctx.camelBase}-transformer.ts`
  return `${ctx.camelBase}-scaffold.ts`
}

/**
 * Generate all scaffold artifacts for a grammar, returning a map of
 * `filename → TypeScript source`. Use this when writing to a directory
 * (`--outdir`); each entry is written as a sibling file.
 *
 * Span-lexer parser (`{ParserName}.ts`), transformer, pipeline, and facade
 * artifacts are all included when the corresponding flags are set.
 *
 * @param source  - EBNF or ABNF grammar source text.
 * @param flags   - Which scaffold dimensions to include.
 * @param options - Generator configuration (same as `generateParser`).
 * @returns A `Record<filename, content>` with one entry per output file.
 */
export function generateScaffoldFiles(
  source: string,
  flags: ScaffoldFlags,
  options: GeneratorOptions = {},
): Record<string, string> {
  const { traversal, transformer, facade, pipeline } = flags

  if (traversal && transformer) {
    throw new Error(
      `--traversal and --transformer are mutually exclusive. ` +
        `Use --traversal (interpreter or tree-walker) to walk the parse tree directly, ` +
        `or --transformer to emit a Transformer object — not both in the same scaffold.`,
    )
  }
  if (traversal === Traversal.Interpreter && pipeline) {
    throw new Error(
      '--traversal interpreter cannot be combined with --pipeline. ' +
        'The interpreter evaluates directly during parsing — there is no intermediate tree for ' +
        'the validate stage to inspect. Use --traversal tree-walker --pipeline instead.',
    )
  }

  const format = options.format ?? 'ebnf'
  const parserName = options.parserName ?? 'GeneratedParser'
  const treeName = options.treeName ?? 'ParseTree'

  const ast =
    format === 'abnf'
      ? ABNFParser.parse(source, {
          ...(options.caseSensitiveStrings !== undefined && {
            caseSensitiveStrings: options.caseSensitiveStrings,
          }),
        })
      : EBNFParser.parse(source)
  detectLeftRecursion(ast)

  const result: Record<string, string> = {}

  // Span-lexer parser always goes to its own file.
  if (flags.lexer === Lexer.Span) {
    result[`${parserName}.ts`] = generateSpanLexerScaffold(ast, parserName, false, treeName)
  }

  // No transformer/facade/pipeline → parser only (scannerless or span already added).
  if (!transformer && !facade && !pipeline) {
    if (flags.lexer !== Lexer.Span) {
      result[`${parserName}.ts`] = generateParser(source, {
        ...options,
        ...(traversal !== undefined && { traversal }),
      })
    }
    return result
  }

  const ctx = buildCtx(ast, parserName, treeName)

  // ── JSON + facade + pipeline → 3 files ──────────────────────────────────────
  if (transformer === Transformer.JSON && facade && pipeline) {
    result[`${ctx.camelBase}-transformer.ts`] = compose(
      {
        variantLabel: 'JSON transformer',
        stepsLines: [
          `// Steps: 1) fill in ${ctx.camelBase}ToJSON handlers  2) fill in jsonTo${ctx.base} handlers`,
          `//        3) remove eslint-disable-next-line comments`,
        ],
        sections: [jsonTransformerSection(ast, ctx)],
      },
      ctx,
    )
    result[`${ctx.camelBase}-pipeline.ts`] = compose(
      {
        variantLabel: 'Pipeline:json',
        stepsLines: [
          `// Steps: 1) add semantic validation in #validate  2) remove eslint-disable-next-line comments`,
        ],
        sections: [errorSection(ctx), splitJsonPipelineSection(ctx)],
      },
      ctx,
    )
    result[`${ctx.camelBase}-facade.ts`] = compose(
      {
        variantLabel: 'Facade:json',
        stepsLines: [],
        sections: [splitFacadeJsonWithPipelineSection(ctx)],
      },
      ctx,
    )
    return result
  }

  // ── JSON + facade (no pipeline) → 2 files ───────────────────────────────────
  if (transformer === Transformer.JSON && facade) {
    result[`${ctx.camelBase}-transformer.ts`] = compose(
      {
        variantLabel: 'JSON transformer',
        stepsLines: [
          `// Steps: 1) fill in ${ctx.camelBase}ToJSON handlers  2) fill in jsonTo${ctx.base} handlers`,
          `//        3) remove eslint-disable-next-line comments`,
        ],
        sections: [jsonTransformerSection(ast, ctx)],
      },
      ctx,
    )
    result[`${ctx.camelBase}-facade.ts`] = compose(
      {
        variantLabel: 'Facade:json',
        stepsLines: [
          `// Steps: 1) fill in stubs in ${ctx.camelBase}-transformer.ts  2) remove eslint-disable-next-line comments`,
        ],
        sections: [splitFacadeJsonNoPipelineSection(ctx)],
      },
      ctx,
    )
    return result
  }

  // ── All other scaffold combinations → single file ────────────────────────────
  const plan = planScaffold(flags, ast, ctx)
  result[scaffoldFilename(flags, ctx)] = compose(plan, ctx)
  return result
}

// ── Init scaffold ─────────────────────────────────────────────────────────────

/** Options for the `init` project scaffold. */
export type InitScaffoldOptions = {
  /** Class name for the hand-written parser (e.g. `MyParser`). */
  className: string
  /** When true, extends `ObservableRDParser` with `notifyEnter`/`notifyExit` stubs. */
  observable?: boolean
}

/**
 * Generate the starter parser file content for `rdp-gen init`.
 *
 * @param options - Class name and observable flag.
 * @returns A TypeScript source string for the initial parser file.
 */
export function generateInitScaffold(options: InitScaffoldOptions): string {
  const { className, observable } = options

  if (observable) {
    return `\
import { ObservableRDParser, ParseObserver } from '@configuredthings/rdp.js/observable'

export class ${className} extends ObservableRDParser {
  private constructor(source: DataView) {
    super(source)
  }

  static parse(input: string, observer?: ParseObserver): unknown {
    const bytes = new TextEncoder().encode(input)
    const parser = new ${className}(new DataView(bytes.buffer))
    if (observer !== undefined) parser.withObserver(observer)
    return parser.#parseRoot()
  }

  #parseRoot(): unknown {
    this.notifyEnter('root')
    // TODO: implement your top-level production rule.
    // Add private methods for each grammar rule, e.g. #parseExpression(), #parseTerm().
    // Use this.peek(), this.matchChar(), this.expectChar(), this.readChar(), this.atEnd(), etc.
    // Call this.error() to signal a parse failure at the current position.
    // Call this.notifyEnter(name) at the top and this.notifyExit(name, matched) before each return.
    if (!this.atEnd()) this.error('unexpected input')
    this.notifyExit('root', false)
    throw new Error('not implemented')
  }
}
`
  }

  return `\
import { ScannerlessRDParser } from '@configuredthings/rdp.js'

export class ${className} extends ScannerlessRDParser {
  private constructor(source: DataView) {
    super(source)
  }

  static parse(input: string): unknown {
    const bytes = new TextEncoder().encode(input)
    return new ${className}(new DataView(bytes.buffer)).#parseRoot()
  }

  #parseRoot(): unknown {
    // TODO: implement your top-level production rule.
    // Add private methods for each grammar rule, e.g. #parseExpression(), #parseTerm().
    // Use this.peek(), this.matchChar(), this.expectChar(), this.readChar(), this.atEnd(), etc.
    // Call this.error() to signal a parse failure at the current position.
    if (!this.atEnd()) this.error('unexpected input')
    throw new Error('not implemented')
  }
}
`
}

// ── Span-lexer scaffold ───────────────────────────────────────────────────────

/** Known readable names for single-character punctuation terminals. */
const PUNCT_NAMES: Record<string, string> = {
  '=': 'EQ',
  ';': 'SEMI',
  '|': 'PIPE',
  ',': 'COMMA',
  '{': 'LBRACE',
  '}': 'RBRACE',
  '[': 'LBRACKET',
  ']': 'RBRACKET',
  '(': 'LPAREN',
  ')': 'RPAREN',
  '*': 'STAR',
  '-': 'MINUS',
  '+': 'PLUS',
  '/': 'SLASH',
  '<': 'LT',
  '>': 'GT',
  '.': 'DOT',
  ':': 'COLON',
  '!': 'BANG',
  '@': 'AT',
  '#': 'HASH',
  '&': 'AMP',
  '^': 'CARET',
  '~': 'TILDE',
  '?': 'QUEST',
  '%': 'PERCE',
  '\\': 'BSLASH',
  '`': 'BTICK',
  $: 'DOLLAR',
  _: 'UNDER',
  "'": 'SQUOTE',
  '"': 'DQUOTE',
}

function punctName(ch: string): string {
  return PUNCT_NAMES[ch] ?? `CH${ch.charCodeAt(0)}`
}

/** Collect every unique terminal value reachable from `body`. */
function collectTerminals(body: RuleBody, out: Set<string>): void {
  switch (body.kind) {
    case 'terminal':
      out.add(body.value)
      break
    case 'sequence':
    case 'alternation':
      for (const item of body.items) collectTerminals(item, out)
      break
    case 'optional':
    case 'zeroOrMore':
    case 'oneOrMore':
      collectTerminals(body.item, out)
      break
    case 'exception':
      collectTerminals(body.item, out)
      collectTerminals(body.except, out)
      break
    case 'repetition':
      collectTerminals(body.item, out)
      break
    // nonTerminal, charValue, coreRule → no string literals
  }
}

/**
 * Classify a terminal value into lexical categories for scaffold generation.
 *
 * - `'punct'`     — single printable ASCII symbol (not a letter or digit); maps to a PUNCT span
 * - `'keyword'`   — multi-char, all ASCII letters; maps to a WORD span matched against a keyword table
 * - `'whitespace'`— space / tab / CR / LF; silently skipped by the span tokeniser
 * - `'word-char'` — single ASCII letter or digit; consumed by WORD/NUMBER spans, not a standalone token
 * - `'complex'`   — anything else (multi-char with punct, control chars, etc.); requires manual handling
 */
function classifyTerminal(
  value: string,
): 'punct' | 'keyword' | 'whitespace' | 'word-char' | 'complex' {
  if (value.length === 0) return 'complex'
  if (value.length === 1) {
    const c = value.charCodeAt(0)
    if (c === 32 || c === 9 || c === 10 || c === 13) return 'whitespace'
    // Letters and digits will be part of WORD / NUMBER spans — not standalone PUNCT tokens.
    if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57)) return 'word-char'
    if (c >= 33 && c <= 126) return 'punct'
    return 'complex'
  }
  if (/^[A-Za-z]+$/.test(value)) return 'keyword'
  return 'complex'
}

function generateSpanLexerScaffold(
  ast: GrammarAST,
  parserName: string,
  evaluating: boolean,
  treeName: string = 'ParseTree',
): string {
  const firstRule = ast.rules[0]
  if (!firstRule) return ''

  // ── Terminal analysis ─────────────────────────────────────────────────────
  const allTerminals = new Set<string>()
  for (const rule of ast.rules) collectTerminals(rule.body, allTerminals)

  const punctChars: string[] = []
  const keywords: string[] = []
  for (const t of allTerminals) {
    const kind = classifyTerminal(t)
    // 'whitespace' and 'word-char' terminals are handled transparently by the span
    // tokeniser (skipped or folded into WORD/NUMBER spans) — no TT entry needed.
    // 'complex' terminals (multi-char with punct, control chars) need manual handling.
    if (kind === 'punct') punctChars.push(t)
    else if (kind === 'keyword') keywords.push(t)
  }
  punctChars.sort()
  keywords.sort()

  // Deduplicate punct names (two chars could share a generated name).
  const ttPunctNames: Array<{ ch: string; name: string }> = []
  const usedNames = new Set<string>(['NAME', 'LIT', 'INT', 'EOF'])
  for (const ch of punctChars) {
    const base = punctName(ch)
    let name = base
    let n = 2
    while (usedNames.has(name)) name = `${base}_${n++}`
    usedNames.add(name)
    ttPunctNames.push({ ch, name })
  }
  const ttKeywordNames: Array<{ kw: string; name: string }> = []
  for (const kw of keywords) {
    const base = kw.toUpperCase()
    let name = base
    let n = 2
    while (usedNames.has(name)) name = `${base}_${n++}`
    usedNames.add(name)
    ttKeywordNames.push({ kw, name })
  }

  // Assign numeric values
  let ttIdx = 0
  const ttEntries: Array<{ name: string; value: number; comment: string }> = []
  ttEntries.push({ name: 'NAME', value: ttIdx++, comment: 'identifier (unrecognised word)' })
  ttEntries.push({ name: 'LIT', value: ttIdx++, comment: 'quoted string literal' })
  ttEntries.push({ name: 'INT', value: ttIdx++, comment: 'integer literal' })
  for (const { ch, name } of ttPunctNames)
    ttEntries.push({ name, value: ttIdx++, comment: `'${ch === "'" ? "\\'" : ch}'` })
  for (const { kw, name } of ttKeywordNames)
    ttEntries.push({ name, value: ttIdx++, comment: `keyword '${kw}'` })
  ttEntries.push({ name: 'EOF', value: ttIdx, comment: 'end of input' })

  // ── Code generation ───────────────────────────────────────────────────────
  const lines: string[] = []
  const nameWidth = Math.max(...ttEntries.map((e) => e.name.length))

  const scaffoldVariant = evaluating ? 'Span-lexer + interpreter' : 'Span-lexer'
  lines.push(
    `// ${scaffoldVariant} scaffold generated by rdp-gen — this file is not regenerated; edit freely.`,
  )
  lines.push(`import { TokenRDParser, type TokenStream } from '@configuredthings/rdp.js'`)
  lines.push(``)
  lines.push(`// ── Parse tree types ───────────────────────────────────────────────────────────`)
  lines.push(``)
  lines.push(...emitTypeDeclarations(ast, treeName))
  lines.push(`// Steps to complete:`)
  lines.push(
    `//   1) Review TT — add keyword constants if your grammar distinguishes reserved words`,
  )
  lines.push(`//   2) Adjust SPAN_OPTS if your grammar uses different comment or string delimiters`)
  lines.push(`//   3) Fill in each #parse<Rule> method in TokenParser (all throw by default)`)
  lines.push(
    `//   4) Change the return type of parse() from 'unknown' to your concrete result type`,
  )
  lines.push(``)

  // ── TT enum ────────────────────────────────────────────────────────────
  lines.push(`// ── Token types ───────────────────────────────────────────────────────────────`)
  lines.push(``)
  lines.push(`/** All token types produced by {@link classify} for this grammar. */`)
  lines.push(`export const TT = {`)
  for (const e of ttEntries) {
    const pad = ' '.repeat(nameWidth - e.name.length)
    lines.push(`  ${e.name}:${pad} ${e.value},  // ${e.comment}`)
  }
  lines.push(`} as const`)
  lines.push(``)
  lines.push(`export type TT = (typeof TT)[keyof typeof TT]`)
  lines.push(``)

  // ── Raw kinds ──────────────────────────────────────────────────────────
  lines.push(`// ── Raw span kinds (grammar-agnostic) ────────────────────────────────────────`)
  lines.push(``)
  lines.push(`const RK = { WORD: 0, NUMBER: 1, STRING: 2, PUNCT: 3 } as const`)
  lines.push(``)

  // ── SPAN_OPTS ──────────────────────────────────────────────────────────
  lines.push(`// ── Span tokeniser ────────────────────────────────────────────────────────────`)
  lines.push(``)
  lines.push(`// Lexical parameters — adjust to match your grammar's lexical structure.`)
  lines.push(`// identStart / identCont use char codes for performance (avoids regex per char).`)
  lines.push(`const SPAN_OPTS = {`)
  lines.push(`  identStart: (c: number) =>`)
  lines.push(`    (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95,  // [A-Za-z_]`)
  lines.push(`  identCont: (c: number) =>`)
  lines.push(`    (c >= 65 && c <= 90) || (c >= 97 && c <= 122) ||`)
  lines.push(`    (c >= 48 && c <= 57) || c === 95 || c === 45,  // [A-Za-z0-9_-]`)
  lines.push(`  stringDelims: new Set<number>([39, 34]),  // 39 = single-quote, 34 = double-quote`)
  lines.push(`  blockCommentOpen:  '(*',`)
  lines.push(`  blockCommentClose: '*)',`)
  lines.push(`  // lineComment: '//',  // uncomment if your grammar has line comments`)
  lines.push(`}`)
  lines.push(``)
  lines.push(`export interface SpanBuffer { buf: Int32Array; count: number }`)
  lines.push(``)
  lines.push(`/**`)
  lines.push(` * Stage 1 — identify token boundaries.`)
  lines.push(` *`)
  lines.push(` * Produces a flat {@link Int32Array} of [start, end, rawKind] triples.`)
  lines.push(` * No string allocation; whitespace and block comments are silently skipped.`)
  lines.push(` */`)
  lines.push(`export function spanTokenize(input: string): SpanBuffer {`)
  lines.push(`  const buf = new Int32Array(input.length * 3 + 3)`)
  lines.push(`  let count = 0`)
  lines.push(`  let i = 0`)
  lines.push(`  const n = input.length`)
  lines.push(
    `  const { identStart, identCont, stringDelims, blockCommentOpen, blockCommentClose } = SPAN_OPTS`,
  )
  lines.push(`  const co0 = blockCommentOpen.charCodeAt(0), co1 = blockCommentOpen.charCodeAt(1)`)
  lines.push(`  const cc0 = blockCommentClose.charCodeAt(0), cc1 = blockCommentClose.charCodeAt(1)`)
  lines.push(``)
  lines.push(`  while (i < n) {`)
  lines.push(`    const c = input.charCodeAt(i)`)
  lines.push(``)
  lines.push(`    // Whitespace`)
  lines.push(`    if (c === 32 || c === 9 || c === 10 || c === 13) { i++; continue }`)
  lines.push(``)
  lines.push(`    // Block comment (nesting-aware)`)
  lines.push(`    if (c === co0 && input.charCodeAt(i + 1) === co1) {`)
  lines.push(`      let depth = 1; i += 2`)
  lines.push(`      while (i < n && depth > 0) {`)
  lines.push(
    `        if (input.charCodeAt(i) === co0 && input.charCodeAt(i + 1) === co1) { depth++; i += 2 }`,
  )
  lines.push(
    `        else if (input.charCodeAt(i) === cc0 && input.charCodeAt(i + 1) === cc1) { depth--; i += 2 }`,
  )
  lines.push(`        else i++`)
  lines.push(`      }`)
  lines.push(`      continue`)
  lines.push(`    }`)
  lines.push(``)
  lines.push(`    // Quoted string literal`)
  lines.push(`    if (stringDelims.has(c)) {`)
  lines.push(`      const start = i++`)
  lines.push(`      while (i < n && input.charCodeAt(i) !== c) {`)
  lines.push(`        if (input.charCodeAt(i) === 92) i++  // skip past escape char`)
  lines.push(`        i++`)
  lines.push(`      }`)
  lines.push(`      i++  // closing delimiter`)
  lines.push(
    `      buf[count * 3] = start; buf[count * 3 + 1] = i; buf[count * 3 + 2] = RK.STRING; count++`,
  )
  lines.push(`      continue`)
  lines.push(`    }`)
  lines.push(``)
  lines.push(`    // Integer literal`)
  lines.push(`    if (c >= 48 && c <= 57) {`)
  lines.push(`      const start = i++`)
  lines.push(`      while (i < n && input.charCodeAt(i) >= 48 && input.charCodeAt(i) <= 57) i++`)
  lines.push(
    `      buf[count * 3] = start; buf[count * 3 + 1] = i; buf[count * 3 + 2] = RK.NUMBER; count++`,
  )
  lines.push(`      continue`)
  lines.push(`    }`)
  lines.push(``)
  lines.push(`    // Identifier or keyword`)
  lines.push(`    if (identStart(c)) {`)
  lines.push(`      const start = i++`)
  lines.push(`      while (i < n && identCont(input.charCodeAt(i))) i++`)
  lines.push(
    `      buf[count * 3] = start; buf[count * 3 + 1] = i; buf[count * 3 + 2] = RK.WORD; count++`,
  )
  lines.push(`      continue`)
  lines.push(`    }`)
  lines.push(``)
  lines.push(`    // Single-character punctuation`)
  lines.push(
    `    buf[count * 3] = i; buf[count * 3 + 1] = i + 1; buf[count * 3 + 2] = RK.PUNCT; count++; i++`,
  )
  lines.push(`  }`)
  lines.push(``)
  lines.push(`  return { buf, count }`)
  lines.push(`}`)
  lines.push(``)

  // ── classify ──────────────────────────────────────────────────────────
  lines.push(`// ── Classifier ────────────────────────────────────────────────────────────────`)
  lines.push(``)
  if (keywords.length > 0) {
    lines.push(`// Reserved words in this grammar. Extend as needed.`)
    lines.push(`const KEYWORDS: Readonly<Record<string, TT>> = {`)
    for (const { kw, name } of ttKeywordNames) lines.push(`  '${kw}': TT.${name},`)
    lines.push(`}`)
  } else {
    lines.push(`// No keyword terminals were found in this grammar.`)
    lines.push(`// Add entries here if you distinguish reserved words, e.g. { 'true': TT.TRUE }.`)
    lines.push(`const KEYWORDS: Readonly<Record<string, TT>> = {}`)
  }
  lines.push(``)
  lines.push(`/**`)
  lines.push(` * Stage 2 — classify raw spans as typed tokens.`)
  lines.push(` *`)
  lines.push(` * - WORD   → NAME (or a keyword type if the word appears in {@link KEYWORDS})`)
  lines.push(` * - NUMBER → INT`)
  lines.push(` * - STRING → LIT (delimiters stripped, basic escapes decoded)`)
  lines.push(` * - PUNCT  → specific token type by char code`)
  lines.push(` */`)
  lines.push(`export function classify(input: string, { buf, count }: SpanBuffer): TokenStream {`)
  lines.push(`  const types  = new Int32Array(count + 1)`)
  lines.push(
    `  const values: (string | number | null)[] = new Array(count + 1).fill(null) as (string | number | null)[]`,
  )
  lines.push(``)
  lines.push(`  for (let i = 0; i < count; i++) {`)
  lines.push(`    const start = buf[i * 3]!`)
  lines.push(`    const end   = buf[i * 3 + 1]!`)
  lines.push(`    const kind  = buf[i * 3 + 2]!`)
  lines.push(``)
  lines.push(`    switch (kind) {`)
  lines.push(`      case RK.WORD: {`)
  lines.push(`        const word = input.slice(start, end)`)
  lines.push(`        const kw = KEYWORDS[word]`)
  lines.push(`        types[i] = kw !== undefined ? kw : TT.NAME`)
  lines.push(`        values[i] = word`)
  lines.push(`        break`)
  lines.push(`      }`)
  lines.push(`      case RK.NUMBER:`)
  lines.push(`        types[i] = TT.INT`)
  lines.push(`        values[i] = Number(input.slice(start, end))`)
  lines.push(`        break`)
  lines.push(`      case RK.STRING:`)
  lines.push(`        types[i] = TT.LIT`)
  lines.push(`        values[i] = input`)
  lines.push(`          .slice(start + 1, end - 1)`)
  lines.push(
    `          .replace(/\\\\([\\s\\S])/g, (_, e: string) => e === 'n' ? '\\n' : e === 't' ? '\\t' : e === 'r' ? '\\r' : e)`,
  )
  lines.push(`        break`)
  lines.push(`      case RK.PUNCT:`)
  lines.push(`        switch (input.charCodeAt(start)) {`)
  for (const { ch, name } of ttPunctNames) {
    const code = ch.charCodeAt(0)
    const display = ch === "'" ? "\\'" : ch
    lines.push(
      `          case ${String(code).padStart(3)}: types[i] = TT.${name}; break  // '${display}'`,
    )
  }
  lines.push(
    `          default: throw new Error(\`Unexpected character '\${input[start]}' at position \${start}\`)`,
  )
  lines.push(`        }`)
  lines.push(`        break`)
  lines.push(`    }`)
  lines.push(`  }`)
  lines.push(``)
  lines.push(`  types[count] = TT.EOF`)
  lines.push(`  return { types, values, len: count }`)
  lines.push(`}`)
  lines.push(``)

  // ── TokenParser ───────────────────────────────────────────────────────
  lines.push(`// ── Token parser ──────────────────────────────────────────────────────────────`)
  lines.push(``)
  lines.push(`/**`)
  lines.push(` * Recursive-descent parser on the classified token stream.`)
  lines.push(` *`)
  lines.push(` * Each \`#parse<Rule>\` method corresponds to a production rule in the grammar.`)
  lines.push(
    ` * Use \`this.peekToken()\` for one-token lookahead and \`this.eatToken(TT.X)\` to consume`,
  )
  lines.push(` * and return the associated value (throws on type mismatch).`)
  lines.push(` *`)
  if (evaluating) {
    lines.push(` * Each method evaluates directly during descent — no intermediate tree is built.`)
    lines.push(` * Return your concrete evaluated type from each method.`)
  } else {
    lines.push(` * Change the return type of \`parse()\` from \`unknown\` to your concrete result.`)
  }
  lines.push(` */`)
  lines.push(`export class ${parserName} extends TokenRDParser {`)
  lines.push(`  private constructor(stream: TokenStream) {`)
  lines.push(`    super(stream)`)
  lines.push(`  }`)
  lines.push(``)
  lines.push(`  static parse(input: string): unknown {`)
  lines.push(`    const spans  = spanTokenize(input)`)
  lines.push(`    const stream = classify(input, spans)`)
  lines.push(`    return new ${parserName}(stream).#parse${pascalCase(firstRule.name)}()`)
  lines.push(`  }`)
  lines.push(``)
  lines.push(`  // ── Production rules ───────────────────────────────────────────────────────`)
  lines.push(`  //`)
  lines.push(`  // One method per grammar rule.  Implement each in terms of #peek() / #eat().`)
  lines.push(`  // For alternations: switch on this.#peek() to choose a branch.`)
  lines.push(`  // For repetitions:  use while (this.#peek() !== TT.EOF) { ... }.`)
  lines.push(``)

  for (const rule of ast.rules) {
    lines.push(`  // eslint-disable-next-line @typescript-eslint/no-unused-vars`)
    lines.push(`  #parse${pascalCase(rule.name)}(): unknown {`)
    lines.push(`    throw new Error('not implemented: ${rule.name}')`)
    lines.push(`  }`)
    lines.push(``)
  }

  lines.push(`}`)
  lines.push(``)
  lines.push(
    `// peekToken(), eatToken(), matchToken() and error reporting are inherited from TokenRDParser.`,
  )
  lines.push(
    `// Cast TT values to \`number\` when passing to these methods, e.g. this.eatToken(TT.EQ as number).`,
  )
  lines.push(``)

  return lines.join('\n')
}

// ── Utilities ─────────────────────────────────────────────────────────────────

/** Strip a trailing `Parser` suffix to derive a base name for domain types. */
function stripParserSuffix(parserName: string): string {
  return parserName.endsWith('Parser') ? parserName.slice(0, -6) : parserName
}

function pascalCase(name: string): string {
  return name.replace(/(^|[-_])([a-zA-Z])/g, (_, __, c: string) => c.toUpperCase())
}

/**
 * Generate `node.field: Type` hint strings for a production rule's fields,
 * mirroring the shape of the emitted `XxxNode` type. Used as inline comments
 * in interpreter stub functions so users can see the available fields without
 * cross-referencing the generated types file.
 */
function fieldHints(rule: ProductionRule): string[] {
  const bodyItems = rule.body.kind === 'sequence' ? rule.body.items : [rule.body]
  const names = inferFieldNames(bodyItems)
  return bodyItems.map((item, i) => `node.${names[i]}: ${typeForBody(item)}`)
}
