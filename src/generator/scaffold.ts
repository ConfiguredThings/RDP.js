/**
 * Scaffold generators — emit one-time starter files for each usage pattern.
 *
 * Unlike the generated parser, scaffold output is intended to be edited by hand
 * and is NOT regenerated. It is a starting point, not a derived artefact.
 */

import type { GrammarAST, ProductionRule, RuleBody } from './ast.js'
import { EBNFParser } from './ebnf-parser.js'
import { ABNFParser } from './abnf-parser.js'
import { detectLeftRecursion } from './left-recursion.js'
import type { GeneratorOptions } from './codegen.js'
import { inferFieldNames, typeForBody } from './type-gen.js'

/**
 * Orthogonal scaffold configuration flags.
 *
 * Presence of any flag switches `generateScaffold` into scaffold mode.
 * All combinations are valid except `--traversal interpreter` with `--pipeline`
 * unless `--facade` is also set (the facade wraps a private pipeline whose
 * `#transform` uses the interpreter, so an intermediate tree is still produced).
 */
export type ScaffoldFlags = {
  /** Traversal strategy used inside the scaffold. */
  traversal?: 'interpreter' | 'tree-walker'
  /** Emit a Transformer scaffold. `'json'` produces the two-way JSON variant. */
  transformer?: 'standard' | 'json'
  /** Wrap the scaffold in a module-as-facade (requires `traversal` or `transformer`). */
  facade?: boolean
  /** Emit pipeline stages: `parse` / `validate` / `transform` (requires `traversal`). */
  pipeline?: boolean
  /** Include a span tokeniser + classifier pipeline. */
  lexer?: 'span'
}

/**
 * Generate a one-time scaffold file driven by orthogonal `ScaffoldFlags`.
 *
 * The scaffold is intended as a starting point — edit it freely. Unlike the
 * generated parser it is not designed to be regenerated from the grammar.
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
  const { traversal, transformer, facade, pipeline, lexer } = flags

  // ── Validate combinations ──────────────────────────────────────────────────
  if (traversal === 'interpreter' && pipeline && !facade) {
    throw new Error(
      '--traversal interpreter cannot be combined with --pipeline without --facade. ' +
        'The standalone pipeline pattern requires an intermediate tree for its validate stage. ' +
        'Use --traversal tree-walker --pipeline, or add --facade to wrap the pipeline.',
    )
  }
  if (!traversal && !transformer && !lexer) {
    throw new Error(
      'At least one of --traversal, --transformer, or --lexer must be provided to generate a scaffold.',
    )
  }

  // ── Parse grammar ──────────────────────────────────────────────────────────
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

  // ── Route to generator ─────────────────────────────────────────────────────

  // Transformer path (mutually exclusive with traversal-based paths)
  if (transformer) {
    return transformer === 'json'
      ? generateJsonTransformerScaffold(ast, parserName, treeName)
      : generateTransformerScaffold(ast, parserName, treeName)
  }

  // Lexer path — may optionally wire up a traversal
  if (lexer === 'span') {
    if (traversal === 'interpreter') return generateSpanLexerScaffold(ast, parserName, true)
    if (!traversal) return generateSpanLexerScaffold(ast, parserName, false)
    throw new Error(`--lexer span --traversal ${traversal} is not yet implemented.`)
  }

  // Pure traversal path
  if (traversal === 'interpreter') {
    if (facade && pipeline) return generateFacadePipelineScaffold(ast, parserName, 'interpreter')
    if (facade) return generateFacadeInterpreterScaffold(ast, parserName)
    return generateInterpreterScaffold(ast, parserName)
  }

  if (traversal === 'tree-walker') {
    if (facade && pipeline)
      return generateFacadePipelineScaffold(ast, parserName, 'tree-walker', treeName)
    if (facade) return generateFacadeWalkerScaffold(ast, parserName, treeName)
    if (pipeline) return generatePipelineWalkerScaffold(ast, parserName, treeName)
    return generateWalkerScaffold(ast, parserName, treeName)
  }

  throw new Error('unhandled scaffold flag combination')
}

// ── Interpreter scaffold ──────────────────────────────────────────────────────

function generateInterpreterScaffold(ast: GrammarAST, parserName: string): string {
  const firstRule = ast.rules[0]
  if (!firstRule) return ''

  const modulePath = `./${parserName}.js`
  const nodeTypes = ast.rules.map((r) => `${pascalCase(r.name)}Node`)
  const lines: string[] = []

  lines.push(
    `// Interpreter scaffold generated by rdp-gen — this file is not regenerated; edit freely.`,
  )
  lines.push(
    `// Steps: 1) replace 'unknown' with your concrete return types  2) fill in the function bodies`,
  )
  lines.push(
    `//        3) remove eslint-disable-next-line comments — present only to keep stubs lint-clean`,
  )
  lines.push(``)
  lines.push(`import {`)
  lines.push(`  ${parserName},`)
  for (const t of nodeTypes) lines.push(`  type ${t},`)
  lines.push(`} from '${modulePath}'`)
  lines.push(`import { RDParserException } from '@configuredthings/rdp.js'`)
  lines.push(``)
  lines.push(`/**`)
  lines.push(` * Parse \`input\` and evaluate it to a result.`)
  lines.push(` *`)
  lines.push(` * Replace the \`unknown\` return type with your concrete result type once`)
  lines.push(` * you have filled in the \`eval*\` functions below.`)
  lines.push(` *`)
  lines.push(` * @param input - Source string to parse and evaluate.`)
  lines.push(` * @returns The evaluated result (narrowed once implemented).`)
  lines.push(` * @throws {Error} If \`input\` does not match the grammar.`)
  lines.push(` */`)
  lines.push(`export function evaluate(input: string): unknown {`)
  lines.push(`  try {`)
  lines.push(`    return eval${pascalCase(firstRule.name)}(${parserName}.parse(input))`)
  lines.push(`  } catch (e) {`)
  lines.push(
    `    if (e instanceof RDParserException) throw new Error(\`parse error: "\${input}"\`)`,
  )
  lines.push(`    throw e`)
  lines.push(`  }`)
  lines.push(`}`)

  for (const rule of ast.rules) {
    const nodeType = `${pascalCase(rule.name)}Node`
    lines.push(``)
    lines.push(`/**`)
    lines.push(` * Evaluate a \`${rule.name}\` node.`)
    lines.push(` *`)
    lines.push(` * @param node - The {@link ${nodeType}} to evaluate.`)
    lines.push(` * @returns The evaluated result (replace \`unknown\` with your concrete type).`)
    lines.push(` */`)
    lines.push(`// eslint-disable-next-line @typescript-eslint/no-unused-vars`)
    lines.push(`function eval${pascalCase(rule.name)}(node: ${nodeType}): unknown {`)
    for (const hint of fieldHints(rule)) lines.push(`  // ${hint}`)
    lines.push(`  throw new Error('not implemented')`)
    lines.push(`}`)
  }

  lines.push(``)
  return lines.join('\n')
}

// ── Walker scaffold ───────────────────────────────────────────────────────────

function generateWalkerScaffold(ast: GrammarAST, parserName: string, treeName: string): string {
  const firstRule = ast.rules[0]
  if (!firstRule) return ''

  const modulePath = `./${parserName}.js`
  const lines: string[] = []

  lines.push(
    `// Tree-walking scaffold generated by rdp-gen — this file is not regenerated; edit freely.`,
  )
  lines.push(`// childNodes() is always present in the generated parser file.`)
  lines.push(
    `// Once you uncomment the walk call below, remove the eslint-disable-next-line comments.`,
  )
  lines.push(``)
  lines.push(`// eslint-disable-next-line @typescript-eslint/no-unused-vars`)
  lines.push(`import { ${parserName}, childNodes, type ${treeName} } from '${modulePath}'`)
  lines.push(`// eslint-disable-next-line @typescript-eslint/no-unused-vars`)
  lines.push(`import { visit, type Visitor } from '@configuredthings/rdp.js'`)
  lines.push(``)
  lines.push(`/**`)
  lines.push(` * Walk \`root\` depth-first (pre-order), calling \`fn\` on every node.`)
  lines.push(` *`)
  lines.push(` * @param root - The tree node to start from.`)
  lines.push(` * @param fn - Called once per node visited, before its children.`)
  lines.push(` */`)
  lines.push(`export function walk(root: ${treeName}, fn: (node: ${treeName}) => void): void {`)
  lines.push(`  fn(root)`)
  lines.push(`  for (const child of childNodes(root)) walk(child, fn)`)
  lines.push(`}`)
  lines.push(``)
  lines.push(`// Add handlers for the node kinds you care about.`)
  lines.push(`// Use Required<Visitor<${treeName}>> to enforce that every kind is handled.`)
  lines.push(`//`)
  lines.push(`// const visitor: Visitor<${treeName}> = {`)
  for (const rule of ast.rules) {
    lines.push(`//   '${rule.name}': (node) => { /* ... */ },`)
  }
  lines.push(`// }`)
  lines.push(`//`)
  lines.push(`// walk(${parserName}.parse(input), (node) => visit(node, visitor))`)
  lines.push(``)

  return lines.join('\n')
}

// ── Facade + interpreter scaffold ─────────────────────────────────────────────

function generateFacadeInterpreterScaffold(ast: GrammarAST, parserName: string): string {
  const firstRule = ast.rules[0]
  if (!firstRule) return ''

  const base = stripParserSuffix(parserName)
  const modulePath = `./${parserName}.js`
  const nodeTypes = ast.rules.map((r) => `${pascalCase(r.name)}Node`)
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const firstNodeType = nodeTypes[0]!
  const resultClass = `${base}Result`
  const errorClass = `${base}Error`
  const entryFn = `parse${base}`
  const lines: string[] = []

  lines.push(
    `// Facade + interpreter scaffold generated by rdp-gen — this file is not regenerated; edit freely.`,
  )
  lines.push(`// Steps: 1) define ${resultClass} constructor fields  2) fill in eval functions`)
  lines.push(
    `//        3) implement static from() using the eval results  4) remove eslint-disable-next-line comments`,
  )
  lines.push(``)
  lines.push(`import {`)
  lines.push(`  ${parserName},`)
  for (const t of nodeTypes) lines.push(`  type ${t},`)
  lines.push(`} from '${modulePath}'`)
  lines.push(`import { RDParserException } from '@configuredthings/rdp.js'`)
  lines.push(``)
  lines.push(`// ── Domain type ──────────────────────────────────────────────────────────────`)
  lines.push(``)
  lines.push(`/**`)
  lines.push(` * Domain representation of a successfully parsed input.`)
  lines.push(` *`)
  lines.push(` * Replace the constructor stub with the fields that make sense for your domain.`)
  lines.push(
    ` * The private eval functions below produce the raw values; \`from()\` assembles them.`,
  )
  lines.push(` */`)
  lines.push(`export class ${resultClass} {`)
  lines.push(`  // TODO: define constructor fields`)
  lines.push(`  constructor() {}`)
  lines.push(``)
  lines.push(`  /**`)
  lines.push(`   * Build a {@link ${resultClass}} from the raw parse tree.`)
  lines.push(`   *`)
  lines.push(`   * Call the private eval functions to extract values, then construct.`)
  lines.push(`   */`)
  lines.push(`  // eslint-disable-next-line @typescript-eslint/no-unused-vars`)
  lines.push(`  static from(tree: ${firstNodeType}): ${resultClass} {`)
  lines.push(`    throw new Error('not implemented')`)
  lines.push(`  }`)
  lines.push(`}`)
  lines.push(``)
  lines.push(`/**`)
  lines.push(` * Thrown by {@link ${entryFn}} when \`input\` does not match the grammar.`)
  lines.push(` */`)
  lines.push(`export class ${errorClass} extends Error {`)
  lines.push(`  constructor(input: string) {`)
  lines.push(`    super(\`invalid input: "\${input}"\`)`)
  lines.push(`    this.name = '${errorClass}'`)
  lines.push(`  }`)
  lines.push(`}`)
  lines.push(``)
  lines.push(`// ── Public API ───────────────────────────────────────────────────────────────`)
  lines.push(``)
  lines.push(`/**`)
  lines.push(` * Parse \`input\` and return a domain {@link ${resultClass}} object.`)
  lines.push(` *`)
  lines.push(` * @param input - Source string to parse.`)
  lines.push(` * @returns A {@link ${resultClass}} representing the parsed input.`)
  lines.push(` * @throws {@link ${errorClass}} If \`input\` does not match the grammar.`)
  lines.push(` */`)
  lines.push(`export function ${entryFn}(input: string): ${resultClass} {`)
  lines.push(`  let tree: ${firstNodeType}`)
  lines.push(`  try {`)
  lines.push(`    tree = ${parserName}.parse(input)`)
  lines.push(`  } catch (e) {`)
  lines.push(`    if (e instanceof RDParserException) throw new ${errorClass}(input)`)
  lines.push(`    throw e`)
  lines.push(`  }`)
  lines.push(`  return ${resultClass}.from(tree)`)
  lines.push(`}`)
  lines.push(``)
  lines.push(`// ── Private ──────────────────────────────────────────────────────────────────`)

  for (const rule of ast.rules) {
    const nodeType = `${pascalCase(rule.name)}Node`
    lines.push(``)
    lines.push(`// eslint-disable-next-line @typescript-eslint/no-unused-vars`)
    lines.push(`function eval${pascalCase(rule.name)}(node: ${nodeType}): unknown {`)
    for (const hint of fieldHints(rule)) lines.push(`  // ${hint}`)
    lines.push(`  throw new Error('not implemented')`)
    lines.push(`}`)
  }

  lines.push(``)
  return lines.join('\n')
}

// ── Facade + tree-walker scaffold ────────────────────────────────────────────

function generateFacadeWalkerScaffold(
  ast: GrammarAST,
  parserName: string,
  treeName: string,
): string {
  const firstRule = ast.rules[0]
  if (!firstRule) return ''

  const base = stripParserSuffix(parserName)
  const modulePath = `./${parserName}.js`
  const firstNodeType = `${pascalCase(firstRule.name)}Node`
  const resultClass = `${base}Result`
  const errorClass = `${base}Error`
  const entryFn = `parse${base}`
  const lines: string[] = []

  lines.push(
    `// Facade + tree-walker scaffold generated by rdp-gen — this file is not regenerated; edit freely.`,
  )
  lines.push(`// Steps: 1) define ${resultClass} fields  2) implement static from() using walk()`)
  lines.push(
    `//        3) uncomment and fill in the visitor  4) remove eslint-disable-next-line comments`,
  )
  lines.push(``)
  lines.push(
    `import { ${parserName}, childNodes, type ${treeName}, type ${firstNodeType} } from '${modulePath}'`,
  )
  lines.push(`import { RDParserException, visit, type Visitor } from '@configuredthings/rdp.js'`)
  lines.push(``)
  lines.push(`// ── Domain type ──────────────────────────────────────────────────────────────`)
  lines.push(``)
  lines.push(`/**`)
  lines.push(` * Domain representation of a successfully parsed input.`)
  lines.push(` *`)
  lines.push(` * Replace the constructor stub with the fields for your domain.`)
  lines.push(` * {@link ${resultClass}.from} walks the tree to build this object.`)
  lines.push(` */`)
  lines.push(`export class ${resultClass} {`)
  lines.push(`  // TODO: define constructor fields`)
  lines.push(`  constructor() {}`)
  lines.push(``)
  lines.push(`  /**`)
  lines.push(`   * Build a {@link ${resultClass}} by walking the parse tree.`)
  lines.push(`   */`)
  lines.push(`  // eslint-disable-next-line @typescript-eslint/no-unused-vars`)
  lines.push(`  static from(tree: ${firstNodeType}): ${resultClass} {`)
  lines.push(`    // Use walk() and visitor to extract values, then construct.`)
  lines.push(`    throw new Error('not implemented')`)
  lines.push(`  }`)
  lines.push(`}`)
  lines.push(``)
  lines.push(`/**`)
  lines.push(` * Thrown by {@link ${entryFn}} when \`input\` does not match the grammar.`)
  lines.push(` */`)
  lines.push(`export class ${errorClass} extends Error {`)
  lines.push(`  constructor(input: string) {`)
  lines.push(`    super(\`invalid input: "\${input}"\`)`)
  lines.push(`    this.name = '${errorClass}'`)
  lines.push(`  }`)
  lines.push(`}`)
  lines.push(``)
  lines.push(`// ── Public API ───────────────────────────────────────────────────────────────`)
  lines.push(``)
  lines.push(`/**`)
  lines.push(` * Parse \`input\` and return a domain {@link ${resultClass}} object.`)
  lines.push(` *`)
  lines.push(` * @param input - Source string to parse.`)
  lines.push(` * @returns A {@link ${resultClass}} representing the parsed input.`)
  lines.push(` * @throws {@link ${errorClass}} If \`input\` does not match the grammar.`)
  lines.push(` */`)
  lines.push(`export function ${entryFn}(input: string): ${resultClass} {`)
  lines.push(`  let tree: ${firstNodeType}`)
  lines.push(`  try {`)
  lines.push(`    tree = ${parserName}.parse(input)`)
  lines.push(`  } catch (e) {`)
  lines.push(`    if (e instanceof RDParserException) throw new ${errorClass}(input)`)
  lines.push(`    throw e`)
  lines.push(`  }`)
  lines.push(`  return ${resultClass}.from(tree)`)
  lines.push(`}`)
  lines.push(``)
  lines.push(`// ── Private ──────────────────────────────────────────────────────────────────`)
  lines.push(``)
  lines.push(`// eslint-disable-next-line @typescript-eslint/no-unused-vars`)
  lines.push(`function walk(root: ${treeName}, fn: (node: ${treeName}) => void): void {`)
  lines.push(`  fn(root)`)
  lines.push(`  for (const child of childNodes(root)) walk(child, fn)`)
  lines.push(`}`)
  lines.push(``)
  lines.push(`// Add handlers for the node kinds you care about.`)
  lines.push(`// Use Required<Visitor<${treeName}>> to enforce that every kind is handled.`)
  lines.push(`//`)
  lines.push(`// const visitor: Visitor<${treeName}> = {`)
  for (const rule of ast.rules) {
    lines.push(`//   '${rule.name}': (node) => { /* ... */ },`)
  }
  lines.push(`// }`)
  lines.push(`//`)
  lines.push(`// walk(tree, (node) => visit(node, visitor))`)
  lines.push(``)

  return lines.join('\n')
}

// ── Facade + pipeline scaffold ────────────────────────────────────────────────

function generateFacadePipelineScaffold(
  ast: GrammarAST,
  parserName: string,
  transformInner: 'interpreter' | 'tree-walker',
  treeName?: string,
): string {
  const firstRule = ast.rules[0]
  if (!firstRule) return ''

  const base = stripParserSuffix(parserName)
  const modulePath = `./${parserName}.js`
  const nodeTypes = ast.rules.map((r) => `${pascalCase(r.name)}Node`)
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const firstNodeType = nodeTypes[0]!
  const resultClass = `${base}Result`
  const errorClass = `${base}Error`
  const pipelineClass = `${base}Pipeline`
  const entryFn = `parse${base}`
  const resolvedTreeName = treeName ?? 'ParseTree'
  const lines: string[] = []

  const innerLabel =
    transformInner === 'interpreter' ? 'pipeline:interpreter' : 'pipeline:tree-walker'
  lines.push(
    `// Facade + ${innerLabel} scaffold generated by rdp-gen — this file is not regenerated; edit freely.`,
  )
  lines.push(`// Steps: 1) define ${resultClass} fields  2) fill in #validate and #transform`)
  lines.push(
    `//        3) implement ${resultClass}.from()  4) remove eslint-disable-next-line comments`,
  )
  lines.push(``)

  // Imports: interpreter needs all node types for the private eval functions;
  // tree-walker only needs the root node type plus childNodes/ParseTree.
  if (transformInner === 'interpreter') {
    lines.push(`import {`)
    lines.push(`  ${parserName},`)
    for (const t of nodeTypes) lines.push(`  type ${t},`)
    lines.push(`} from '${modulePath}'`)
    lines.push(`import { RDParserException } from '@configuredthings/rdp.js'`)
  } else {
    lines.push(
      `import { ${parserName}, childNodes, type ${resolvedTreeName}, type ${firstNodeType} } from '${modulePath}'`,
    )
    lines.push(`import { RDParserException, visit, type Visitor } from '@configuredthings/rdp.js'`)
  }

  lines.push(``)
  lines.push(`// ── Domain type ──────────────────────────────────────────────────────────────`)
  lines.push(``)
  lines.push(`/**`)
  lines.push(` * Domain representation of a successfully parsed input.`)
  lines.push(` *`)
  lines.push(` * Replace the constructor stub with your domain fields.`)
  lines.push(` * {@link ${pipelineClass}} builds this via \`from()\`.`)
  lines.push(` */`)
  lines.push(`export class ${resultClass} {`)
  lines.push(`  // TODO: define constructor fields`)
  lines.push(`  constructor() {}`)
  lines.push(``)
  lines.push(`  /**`)
  lines.push(`   * Build a {@link ${resultClass}} from the validated parse tree.`)
  lines.push(`   */`)
  lines.push(`  // eslint-disable-next-line @typescript-eslint/no-unused-vars`)
  lines.push(`  static from(tree: ${firstNodeType}): ${resultClass} {`)
  lines.push(`    throw new Error('not implemented')`)
  lines.push(`  }`)
  lines.push(`}`)
  lines.push(``)
  lines.push(`/**`)
  lines.push(` * Thrown by {@link ${entryFn}} when \`input\` does not match the grammar`)
  lines.push(` * or fails semantic validation.`)
  lines.push(` */`)
  lines.push(`export class ${errorClass} extends Error {`)
  lines.push(`  constructor(input: string) {`)
  lines.push(`    super(\`invalid input: "\${input}"\`)`)
  lines.push(`    this.name = '${errorClass}'`)
  lines.push(`  }`)
  lines.push(`}`)
  lines.push(``)
  lines.push(`// ── Public API ───────────────────────────────────────────────────────────────`)
  lines.push(``)
  lines.push(`/**`)
  lines.push(` * Parse \`input\` and return a domain {@link ${resultClass}} object.`)
  lines.push(` *`)
  lines.push(` * @param input - Source string to parse.`)
  lines.push(` * @returns A {@link ${resultClass}} representing the parsed input.`)
  lines.push(
    ` * @throws {@link ${errorClass}} If \`input\` does not match the grammar or is invalid.`,
  )
  lines.push(` */`)
  lines.push(`export function ${entryFn}(input: string): ${resultClass} {`)
  lines.push(`  return ${pipelineClass}.run(input)`)
  lines.push(`}`)
  lines.push(``)
  lines.push(`// ── Pipeline (private) ───────────────────────────────────────────────────────`)
  lines.push(``)
  lines.push(`class ${pipelineClass} {`)
  lines.push(`  static run(input: string): ${resultClass} {`)
  lines.push(`    const tree   = ${pipelineClass}.#parse(input)`)
  lines.push(`    const result = ${pipelineClass}.#validate(tree)`)
  lines.push(`    if (!result.ok) throw new ${errorClass}(input)`)
  lines.push(`    return ${pipelineClass}.#transform(result.tree)`)
  lines.push(`  }`)
  lines.push(``)
  lines.push(`  static #parse(input: string): ${firstNodeType} {`)
  lines.push(`    try {`)
  lines.push(`      return ${parserName}.parse(input)`)
  lines.push(`    } catch (e) {`)
  lines.push(`      if (e instanceof RDParserException) throw new ${errorClass}(input)`)
  lines.push(`      throw e`)
  lines.push(`    }`)
  lines.push(`  }`)
  lines.push(``)
  lines.push(`  // eslint-disable-next-line @typescript-eslint/no-unused-vars`)
  lines.push(`  static #validate(`)
  lines.push(`    tree: ${firstNodeType},`)
  lines.push(`  ): { ok: true; tree: ${firstNodeType} } | { ok: false } {`)
  lines.push(`    // TODO: add semantic validation; return { ok: false } to reject`)
  lines.push(`    return { ok: true, tree }`)
  lines.push(`  }`)
  lines.push(``)
  lines.push(`  // eslint-disable-next-line @typescript-eslint/no-unused-vars`)
  lines.push(`  static #transform(tree: ${firstNodeType}): ${resultClass} {`)

  if (transformInner === 'interpreter') {
    lines.push(`    // Call ${resultClass}.from(tree) once from() is implemented, or`)
    lines.push(`    // use the private eval functions below to assemble the result.`)
    lines.push(`    throw new Error('not implemented')`)
  } else {
    lines.push(
      `    // Use walk() and visitor to build the result, then return ${resultClass}.from(tree).`,
    )
    lines.push(`    throw new Error('not implemented')`)
  }

  lines.push(`  }`)
  lines.push(`}`)

  if (transformInner === 'interpreter') {
    lines.push(``)
    lines.push(`// ── Private eval functions ───────────────────────────────────────────────────`)
    for (const rule of ast.rules) {
      const nodeType = `${pascalCase(rule.name)}Node`
      lines.push(``)
      lines.push(`// eslint-disable-next-line @typescript-eslint/no-unused-vars`)
      lines.push(`function eval${pascalCase(rule.name)}(node: ${nodeType}): unknown {`)
      for (const hint of fieldHints(rule)) lines.push(`  // ${hint}`)
      lines.push(`  throw new Error('not implemented')`)
      lines.push(`}`)
    }
  } else {
    lines.push(``)
    lines.push(`// ── Private walk utilities ───────────────────────────────────────────────────`)
    lines.push(``)
    lines.push(`// eslint-disable-next-line @typescript-eslint/no-unused-vars`)
    lines.push(
      `function walk(root: ${resolvedTreeName}, fn: (node: ${resolvedTreeName}) => void): void {`,
    )
    lines.push(`  fn(root)`)
    lines.push(`  for (const child of childNodes(root)) walk(child, fn)`)
    lines.push(`}`)
    lines.push(``)
    lines.push(`// Add handlers for the node kinds you care about.`)
    lines.push(`//`)
    lines.push(`// const visitor: Visitor<${resolvedTreeName}> = {`)
    for (const rule of ast.rules) {
      lines.push(`//   '${rule.name}': (node) => { /* ... */ },`)
    }
    lines.push(`// }`)
  }

  lines.push(``)
  return lines.join('\n')
}

// ── Pipeline + tree-walker scaffold ──────────────────────────────────────────

function generatePipelineWalkerScaffold(
  ast: GrammarAST,
  parserName: string,
  treeName: string,
): string {
  const firstRule = ast.rules[0]
  if (!firstRule) return ''

  const base = stripParserSuffix(parserName)
  const modulePath = `./${parserName}.js`
  const firstNodeType = `${pascalCase(firstRule.name)}Node`
  const resultType = `${base}Result`
  const loadFn = `load${base}`
  const lines: string[] = []

  lines.push(
    `// Pipeline + tree-walker scaffold generated by rdp-gen — this file is not regenerated; edit freely.`,
  )
  lines.push(
    `// Steps: 1) define ${resultType} fields  2) fill in validate()  3) fill in the visitor inside transform()`,
  )
  lines.push(`//        4) remove eslint-disable-next-line comments`)
  lines.push(``)
  lines.push(
    `import { ${parserName}, childNodes, type ${treeName}, type ${firstNodeType} } from '${modulePath}'`,
  )
  lines.push(`import { RDParserException, visit, type Visitor } from '@configuredthings/rdp.js'`)
  lines.push(``)
  lines.push(`// ── Types ────────────────────────────────────────────────────────────────────`)
  lines.push(``)
  lines.push(`/**`)
  lines.push(` * Domain representation produced by the final pipeline stage.`)
  lines.push(` *`)
  lines.push(
    ` * Replace this empty interface with the fields you want {@link transform} to return.`,
  )
  lines.push(` */`)
  lines.push(`// eslint-disable-next-line @typescript-eslint/no-empty-object-type`)
  lines.push(`export interface ${resultType} {`)
  lines.push(`  // TODO: define your domain type`)
  lines.push(`}`)
  lines.push(``)
  lines.push(`/**`)
  lines.push(` * A single semantic error found during {@link validate}.`)
  lines.push(` */`)
  lines.push(`export interface ValidationError {`)
  lines.push(`  message: string`)
  lines.push(`}`)
  lines.push(``)
  lines.push(`// ── Stage 1: parse ───────────────────────────────────────────────────────────`)
  lines.push(``)
  lines.push(`/**`)
  lines.push(` * Stage 1 — parse \`input\` into a typed parse tree.`)
  lines.push(` *`)
  lines.push(` * @param input - Source string to parse.`)
  lines.push(` * @returns The root {@link ${firstNodeType}} of the parse tree.`)
  lines.push(` * @throws {SyntaxError} If \`input\` does not match the grammar.`)
  lines.push(` */`)
  lines.push(`export function parse(input: string): ${firstNodeType} {`)
  lines.push(`  try {`)
  lines.push(`    return ${parserName}.parse(input)`)
  lines.push(`  } catch (e) {`)
  lines.push(`    if (e instanceof RDParserException) throw new SyntaxError(e.message)`)
  lines.push(`    throw e`)
  lines.push(`  }`)
  lines.push(`}`)
  lines.push(``)
  lines.push(`// ── Stage 2: validate ────────────────────────────────────────────────────────`)
  lines.push(``)
  lines.push(`/**`)
  lines.push(` * Stage 2 — check the parse tree for semantic errors.`)
  lines.push(` *`)
  lines.push(` * @param tree - Parse tree returned by {@link parse}.`)
  lines.push(
    ` * @returns \`{ ok: true, tree }\` when valid, or \`{ ok: false, errors }\` otherwise.`,
  )
  lines.push(` */`)
  lines.push(`export function validate(`)
  lines.push(`  tree: ${firstNodeType},`)
  lines.push(`): { ok: true; tree: ${firstNodeType} } | { ok: false; errors: ValidationError[] } {`)
  lines.push(`  const errors: ValidationError[] = []`)
  lines.push(`  // TODO: add validation logic`)
  lines.push(`  return errors.length > 0 ? { ok: false, errors } : { ok: true, tree }`)
  lines.push(`}`)
  lines.push(``)
  lines.push(`// ── Stage 3: transform ───────────────────────────────────────────────────────`)
  lines.push(``)
  lines.push(`/**`)
  lines.push(
    ` * Stage 3 — convert the validated parse tree into a domain {@link ${resultType}} object.`,
  )
  lines.push(` *`)
  lines.push(` * @param tree - Validated parse tree from {@link validate}.`)
  lines.push(` * @returns The domain object.`)
  lines.push(` */`)
  lines.push(`// eslint-disable-next-line @typescript-eslint/no-unused-vars`)
  lines.push(`export function transform(tree: ${firstNodeType}): ${resultType} {`)
  lines.push(`  // Use walk() and visitor to collect values, then construct ${resultType}.`)
  lines.push(`  throw new Error('not implemented')`)
  lines.push(`}`)
  lines.push(``)
  lines.push(`// ── Combinator ───────────────────────────────────────────────────────────────`)
  lines.push(``)
  lines.push(`/**`)
  lines.push(` * Parse, validate, and transform \`input\` in one call.`)
  lines.push(` *`)
  lines.push(` * @param input - Source string to load.`)
  lines.push(` * @returns The domain object.`)
  lines.push(` * @throws {SyntaxError} If \`input\` does not match the grammar.`)
  lines.push(` * @throws {AggregateError} If \`input\` fails semantic validation.`)
  lines.push(` */`)
  lines.push(`export function ${loadFn}(input: string): ${resultType} {`)
  lines.push(`  const tree   = parse(input)`)
  lines.push(`  const result = validate(tree)`)
  lines.push(
    `  if (!result.ok) throw new AggregateError(result.errors, \`invalid ${base}: "\${input}"\`)`,
  )
  lines.push(`  return transform(result.tree)`)
  lines.push(`}`)
  lines.push(``)
  lines.push(`// ── Private walk utilities ───────────────────────────────────────────────────`)
  lines.push(``)
  lines.push(`// eslint-disable-next-line @typescript-eslint/no-unused-vars`)
  lines.push(`function walk(root: ${treeName}, fn: (node: ${treeName}) => void): void {`)
  lines.push(`  fn(root)`)
  lines.push(`  for (const child of childNodes(root)) walk(child, fn)`)
  lines.push(`}`)
  lines.push(``)
  lines.push(`// Add handlers for the node kinds you care about.`)
  lines.push(`//`)
  lines.push(`// const visitor: Visitor<${treeName}> = {`)
  for (const rule of ast.rules) {
    lines.push(`//   '${rule.name}': (node) => { /* ... */ },`)
  }
  lines.push(`// }`)
  lines.push(``)

  return lines.join('\n')
}

// ── Transformer scaffold ──────────────────────────────────────────────────────

function generateTransformerScaffold(
  ast: GrammarAST,
  parserName: string,
  treeName: string,
): string {
  const firstRule = ast.rules[0]
  if (!firstRule) return ''

  const base = stripParserSuffix(parserName)
  const camelBase = base.charAt(0).toLowerCase() + base.slice(1)
  const modulePath = `./${parserName}.js`
  const nodeTypes = ast.rules.map((r) => `${pascalCase(r.name)}Node`)
  const lines: string[] = []

  lines.push(
    `// Transformer scaffold generated by rdp-gen — this file is not regenerated; edit freely.`,
  )
  lines.push(
    `// Steps: 1) replace 'unknown' with your concrete return type  2) fill in the handlers`,
  )
  lines.push(
    `//        3) remove eslint-disable-next-line comments — present only to keep stubs lint-clean`,
  )
  lines.push(``)
  lines.push(`import {`)
  lines.push(`  ${parserName},`)
  for (const t of nodeTypes) lines.push(`  type ${t},`)
  lines.push(`  type ${treeName},`)
  lines.push(`} from '${modulePath}'`)
  lines.push(`import { transform, type Transformer } from '@configuredthings/rdp.js'`)
  lines.push(``)
  lines.push(`// eslint-disable-next-line @typescript-eslint/no-unused-vars`)
  lines.push(`export const ${camelBase}Transformer: Transformer<${treeName}, unknown> = {`)

  for (const rule of ast.rules) {
    const nodeType = `${pascalCase(rule.name)}Node`
    lines.push(``)
    lines.push(`  // eslint-disable-next-line @typescript-eslint/no-unused-vars`)
    lines.push(`  '${rule.name}'(node: ${nodeType}): unknown {`)
    for (const hint of fieldHints(rule)) lines.push(`    // ${hint}`)
    lines.push(`    throw new Error('not implemented')`)
    lines.push(`  },`)
  }

  lines.push(`}`)
  lines.push(``)
  lines.push(`/**`)
  lines.push(` * Parse \`input\` and transform it in one call.`)
  lines.push(` *`)
  lines.push(` * @param input - Source string to parse and transform.`)
  lines.push(` * @returns The transformed result.`)
  lines.push(` */`)
  lines.push(`// eslint-disable-next-line @typescript-eslint/no-unused-vars`)
  lines.push(`export function transform${base}(input: string): unknown {`)
  lines.push(`  return transform(${parserName}.parse(input), ${camelBase}Transformer)`)
  lines.push(`}`)
  lines.push(``)

  return lines.join('\n')
}

// ── JSON transformer scaffold ─────────────────────────────────────────────────

function generateJsonTransformerScaffold(
  ast: GrammarAST,
  parserName: string,
  treeName: string,
): string {
  const firstRule = ast.rules[0]
  if (!firstRule) return ''

  const base = stripParserSuffix(parserName)
  const camelBase = base.charAt(0).toLowerCase() + base.slice(1)
  const modulePath = `./${parserName}.js`
  const nodeTypes = ast.rules.map((r) => `${pascalCase(r.name)}Node`)
  const lines: string[] = []

  lines.push(
    `// JSON transformer scaffold generated by rdp-gen — this file is not regenerated; edit freely.`,
  )
  lines.push(`// Steps: 1) fill in ${camelBase}ToJSON handlers  2) fill in jsonTo${base} handlers`)
  lines.push(
    `//        3) remove eslint-disable-next-line comments — present only to keep stubs lint-clean`,
  )
  lines.push(``)
  lines.push(`import {`)
  lines.push(`  ${parserName},`)
  for (const t of nodeTypes) lines.push(`  type ${t},`)
  lines.push(`  type ${treeName},`)
  lines.push(`} from '${modulePath}'`)
  lines.push(
    `import { transform, type Transformer, toJSONAST, fromJSONAST, type JSONAST } from '@configuredthings/rdp.js'`,
  )
  lines.push(``)
  lines.push(`// ── ${base} → JSON ──────────────────────────────────────────────────────────────`)
  lines.push(``)
  lines.push(`// eslint-disable-next-line @typescript-eslint/no-unused-vars`)
  lines.push(`export const ${camelBase}ToJSON: Transformer<${treeName}, JSONAST> = {`)

  for (const rule of ast.rules) {
    const nodeType = `${pascalCase(rule.name)}Node`
    lines.push(``)
    lines.push(`  // eslint-disable-next-line @typescript-eslint/no-unused-vars`)
    lines.push(`  '${rule.name}'(node: ${nodeType}): JSONAST {`)
    for (const hint of fieldHints(rule)) lines.push(`    // ${hint}`)
    lines.push(`    throw new Error('not implemented')`)
    lines.push(`  },`)
  }

  lines.push(`}`)
  lines.push(``)
  lines.push(`// ── JSON → ${base} ──────────────────────────────────────────────────────────────`)
  lines.push(``)
  lines.push(`// eslint-disable-next-line @typescript-eslint/no-unused-vars`)
  lines.push(`export const jsonTo${base}: Transformer<JSONAST, string> = {`)
  lines.push(``)
  lines.push(`  // eslint-disable-next-line @typescript-eslint/no-unused-vars`)
  lines.push(`  string(node): string { throw new Error('not implemented') },`)
  lines.push(``)
  lines.push(`  // eslint-disable-next-line @typescript-eslint/no-unused-vars`)
  lines.push(`  number(node): string { throw new Error('not implemented') },`)
  lines.push(``)
  lines.push(`  // eslint-disable-next-line @typescript-eslint/no-unused-vars`)
  lines.push(`  boolean(node): string { throw new Error('not implemented') },`)
  lines.push(``)
  lines.push(`  // eslint-disable-next-line @typescript-eslint/no-unused-vars`)
  lines.push(`  null(node): string { throw new Error('not implemented') },`)
  lines.push(``)
  lines.push(`  // eslint-disable-next-line @typescript-eslint/no-unused-vars`)
  lines.push(`  array(node): string { throw new Error('not implemented') },`)
  lines.push(``)
  lines.push(`  // eslint-disable-next-line @typescript-eslint/no-unused-vars`)
  lines.push(`  object(node): string { throw new Error('not implemented') },`)
  lines.push(`}`)
  lines.push(``)
  lines.push(`// ── Round-trip helpers ───────────────────────────────────────────────────────`)
  lines.push(``)
  lines.push(`/**`)
  lines.push(` * Parse \`input\` as ${base} format and serialise the result to a JSON string.`)
  lines.push(` *`)
  lines.push(` * @param input - Source string in ${base} format.`)
  lines.push(` * @returns A JSON string.`)
  lines.push(` */`)
  lines.push(`export function ${camelBase}ToJSONString(input: string): string {`)
  lines.push(`  return fromJSONAST(transform(${parserName}.parse(input), ${camelBase}ToJSON))`)
  lines.push(`}`)
  lines.push(``)
  lines.push(`/**`)
  lines.push(` * Parse \`input\` as a JSON string and emit it in ${base} format.`)
  lines.push(` *`)
  lines.push(` * @param input - A valid JSON string.`)
  lines.push(` * @returns A string in ${base} format.`)
  lines.push(` */`)
  lines.push(`export function jsonStringTo${base}(input: string): string {`)
  lines.push(`  return transform(toJSONAST(input), jsonTo${base})`)
  lines.push(`}`)
  lines.push(``)

  return lines.join('\n')
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
  lines.push(`//`)
  lines.push(`// A two-stage tokeniser pipeline for ${parserName}:`)
  lines.push(
    `//   Stage 1 — spanTokenize(input)  : identifies token boundaries without string allocation`,
  )
  lines.push(
    `//   Stage 2 — classify(input, spans): maps raw spans to typed tokens for this grammar`,
  )
  if (evaluating) {
    lines.push(
      `//   Stage 3 — TokenParser.parse()   : recursive descent that evaluates directly during descent`,
    )
    lines.push(`//                                     (no intermediate tree is materialised)`)
  } else {
    lines.push(`//   Stage 3 — TokenParser.parse()   : recursive descent on the typed token stream`)
  }
  lines.push(`//`)
  lines.push(
    `// Why? A scannerless parser tries every terminal alternative at each character position.`,
  )
  lines.push(
    `// For grammars with large character-class rules this creates significant repeated work.`,
  )
  lines.push(
    `// A span tokeniser collapses those checks into one forward scan; the classifier then`,
  )
  lines.push(
    `// applies grammar-specific typing as a second pass. Result: 3–5× faster on real grammars,`,
  )
  lines.push(`// and the whole pipeline is fully mechanisable from the grammar.`)
  lines.push(`//`)
  lines.push(`// Steps to complete:`)
  lines.push(
    `//   1) Review TT — add keyword constants if your grammar distinguishes reserved words`,
  )
  lines.push(`//   2) Adjust SPAN_OPTS if your grammar uses different comment or string delimiters`)
  if (evaluating) {
    lines.push(
      `//   3) Fill in each #parse<Rule> method to evaluate directly and return your concrete type`,
    )
    lines.push(
      `//   4) Change the return type of parse() from 'unknown' to your concrete result type`,
    )
  } else {
    lines.push(`//   3) Fill in each #parse<Rule> method in TokenParser (all throw by default)`)
    lines.push(
      `//   4) Change the return type of parse() from 'unknown' to your concrete result type`,
    )
  }
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
  const tokenParserName = `${stripParserSuffix(parserName)}TokenParser`
  lines.push(`export class ${tokenParserName} extends TokenRDParser {`)
  lines.push(`  private constructor(stream: TokenStream) {`)
  lines.push(`    super(stream)`)
  lines.push(`  }`)
  lines.push(``)
  lines.push(`  static parse(input: string): unknown {`)
  lines.push(`    const spans  = spanTokenize(input)`)
  lines.push(`    const stream = classify(input, spans)`)
  lines.push(`    return new ${tokenParserName}(stream).#parse${pascalCase(firstRule.name)}()`)
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
