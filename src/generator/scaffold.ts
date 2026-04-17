/**
 * Scaffold generators — emit one-time starter files for each usage pattern.
 *
 * Unlike the generated parser, scaffold output is intended to be edited by hand
 * and is NOT regenerated. It is a starting point, not a derived artefact.
 */

import type { GrammarAST, ProductionRule } from './ast.js'
import { EBNFParser } from './ebnf-parser.js'
import { ABNFParser } from './abnf-parser.js'
import { detectLeftRecursion } from './left-recursion.js'
import type { GeneratorOptions } from './codegen.js'
import { inferFieldNames, typeForBody } from './type-gen.js'

/** The usage pattern to scaffold. */
export type ScaffoldPattern = 'interpreter' | 'facade' | 'pipeline' | 'tree-walker'

/**
 * The inner traversal strategy for composable patterns.
 *
 * Required when `pattern` is `'facade'` or `'pipeline'`.
 * - `'interpreter'`         — one recursive eval function per rule
 * - `'tree-walker'`         — `childNodes`-based tree walk with visitor dispatch
 * - `'pipeline:interpreter'` — only valid with `pattern: 'facade'`; wraps a
 *   pipeline (private `XxxPipeline` class) whose `#transform` uses an interpreter
 * - `'pipeline:tree-walker'` — same but `#transform` uses tree-walking
 */
export type ScaffoldInner =
  | 'interpreter'
  | 'tree-walker'
  | 'pipeline:interpreter'
  | 'pipeline:tree-walker'

/**
 * Generate a one-time scaffold file for the given usage pattern.
 *
 * The scaffold is intended as a starting point — edit it freely. Unlike the
 * generated parser it is not designed to be regenerated from the grammar.
 *
 * @param source - EBNF or ABNF grammar source text.
 * @param pattern - The usage pattern to scaffold.
 * @param options - Generator configuration (same options as `generateParser`).
 *   For `'facade'` or `'pipeline'` patterns, `options.inner` is required.
 *   For `'interpreter'` or `'tree-walker'` patterns, `options.inner` is not allowed.
 * @returns A TypeScript source string ready to write to a `.ts` file.
 * @throws {RDParserException} If the grammar is malformed or left-recursive.
 * @throws {Error} If `inner` is missing when required, present when forbidden,
 *   or an invalid combination is given.
 */
export function generateScaffold(
  source: string,
  pattern: ScaffoldPattern,
  options: GeneratorOptions & { inner?: ScaffoldInner } = {},
): string {
  if ((pattern === 'facade' || pattern === 'pipeline') && !options.inner) {
    const validInner =
      pattern === 'facade'
        ? 'interpreter, tree-walker, pipeline:interpreter, or pipeline:tree-walker'
        : 'interpreter or tree-walker'
    throw new Error(`--scaffold ${pattern} requires --inner. Pass --inner ${validInner}.`)
  }
  if ((pattern === 'interpreter' || pattern === 'tree-walker') && options.inner !== undefined) {
    throw new Error(`--inner is not applicable to --scaffold ${pattern}.`)
  }
  if (
    pattern === 'pipeline' &&
    (options.inner === 'pipeline:interpreter' || options.inner === 'pipeline:tree-walker')
  ) {
    throw new Error(
      `--scaffold pipeline does not support --inner pipeline:*. Use --inner interpreter or --inner tree-walker.`,
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

  switch (pattern) {
    case 'interpreter':
      return generateInterpreterScaffold(ast, parserName)
    case 'tree-walker':
      return generateWalkerScaffold(ast, parserName, treeName)
    case 'facade':
      switch (options.inner) {
        case 'interpreter':
          return generateFacadeInterpreterScaffold(ast, parserName)
        case 'tree-walker':
          return generateFacadeWalkerScaffold(ast, parserName, treeName)
        case 'pipeline:interpreter':
          return generateFacadePipelineScaffold(ast, parserName, 'interpreter')
        case 'pipeline:tree-walker':
          return generateFacadePipelineScaffold(ast, parserName, 'tree-walker', treeName)
      }
      break
    case 'pipeline':
      switch (options.inner) {
        case 'interpreter':
          return generatePipelineInterpreterScaffold(ast, parserName)
        case 'tree-walker':
          return generatePipelineWalkerScaffold(ast, parserName, treeName)
      }
      break
  }
  // unreachable after validation above
  throw new Error(`unhandled scaffold combination: ${pattern} / ${options.inner ?? '(none)'}`)
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

// ── Pipeline + interpreter scaffold ──────────────────────────────────────────

function generatePipelineInterpreterScaffold(ast: GrammarAST, parserName: string): string {
  const firstRule = ast.rules[0]
  if (!firstRule) return ''

  const base = stripParserSuffix(parserName)
  const modulePath = `./${parserName}.js`
  const nodeTypes = ast.rules.map((r) => `${pascalCase(r.name)}Node`)
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const firstNodeType = nodeTypes[0]!
  const resultType = `${base}Result`
  const loadFn = `load${base}`
  const lines: string[] = []

  lines.push(
    `// Pipeline + interpreter scaffold generated by rdp-gen — this file is not regenerated; edit freely.`,
  )
  lines.push(
    `// Steps: 1) define ${resultType} fields  2) fill in validate()  3) fill in eval functions`,
  )
  lines.push(`//        4) remove eslint-disable-next-line comments`)
  lines.push(``)
  lines.push(`import {`)
  lines.push(`  ${parserName},`)
  for (const t of nodeTypes) lines.push(`  type ${t},`)
  lines.push(`} from '${modulePath}'`)
  lines.push(`import { RDParserException } from '@configuredthings/rdp.js'`)
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
  lines.push(`  return eval${pascalCase(firstRule.name)}(tree) as unknown as ${resultType}`)
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
import { RDParser } from '@configuredthings/rdp.js'

export class ${className} extends RDParser {
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
