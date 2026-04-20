#!/usr/bin/env node
/**
 * rdp-gen — generate a TypeScript RDParser subclass from an EBNF or ABNF grammar file.
 *
 * Compiled by tsc as part of the ESM build. Uses Node's built-in util.parseArgs — no
 * third-party dependencies.
 */

import { parseArgs } from 'node:util'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { generateParser, generateScaffold, generateInitScaffold } from '../generator/index.js'
import type { ScaffoldFlags } from '../generator/index.js'
import { EBNFParser } from '../generator/ebnf-parser.js'
import { ABNFParser } from '../generator/abnf-parser.js'

const require = createRequire(import.meta.url)
const { version } = require('../../../package.json') as { version: string }

const args = process.argv.slice(2)

if (args[0] === '--version' || args[0] === '-v') {
  console.log(version)
  process.exit(0)
}

if (args[0] === 'init') {
  runInit(args.slice(1))
} else {
  runGenerate(args)
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Normalise `--transformer [json]` before passing to parseArgs.
 *
 * Node's parseArgs requires a value for string-type options. `--transformer`
 * with no following value becomes `--transformer=standard`; `--transformer json`
 * becomes `--transformer=json`.
 */
function normalizeTransformerArg(args: string[]): string[] {
  const result: string[] = []
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === undefined) continue
    if (arg === '--transformer') {
      const next = args[i + 1]
      if (next === 'json') {
        result.push('--transformer=json')
        i++
      } else {
        result.push('--transformer=standard')
      }
    } else {
      result.push(arg)
    }
  }
  return result
}

// ── rdp-gen <grammar> ──────────────────────────────────────────────────────────

function runGenerate(rawArgs: string[]): void {
  if (rawArgs[0] === '--help' || rawArgs[0] === '-h' || rawArgs.length === 0) {
    printGenerateHelp()
    process.exit(rawArgs.length === 0 ? 1 : 0)
  }

  // Pre-process args: --transformer [json] — Node's parseArgs requires a value for string
  // options, so we normalise '--transformer' (without value) to '--transformer=standard' before
  // passing to parseArgs.
  const normArgs = normalizeTransformerArg(rawArgs)

  const { values, positionals } = parseArgs({
    args: normArgs,
    options: {
      output: { type: 'string', short: 'o' },
      format: { type: 'string' },
      'parser-name': { type: 'string' },
      'tree-name': { type: 'string' },
      observable: { type: 'boolean' },
      traversal: { type: 'string' },
      transformer: { type: 'string' },
      facade: { type: 'boolean' },
      pipeline: { type: 'boolean' },
      lexer: { type: 'string' },
      'ast-only': { type: 'boolean' },
      'abnf-case-sensitive-strings': { type: 'boolean' },
    },
    allowPositionals: true,
    strict: true,
  })

  const grammarPath = positionals[0]
  if (!grammarPath) {
    console.error('rdp-gen: grammar file path required')
    printGenerateHelp()
    process.exit(1)
  }

  if (!existsSync(grammarPath)) {
    console.error(`rdp-gen: file not found: ${grammarPath}`)
    process.exit(1)
  }

  const format = (values['format'] ?? (grammarPath.endsWith('.abnf') ? 'abnf' : 'ebnf')) as
    | 'ebnf'
    | 'abnf'
  const source = readFileSync(grammarPath, 'utf-8')

  const generatorOptions = {
    format,
    parserName: values['parser-name'] ?? 'GeneratedParser',
    treeName: values['tree-name'] ?? 'ParseTree',
    ...(values['observable'] !== undefined && { observable: values['observable'] }),
    ...(values['abnf-case-sensitive-strings'] !== undefined && {
      caseSensitiveStrings: values['abnf-case-sensitive-strings'],
    }),
  }

  // ── Validate scaffold flag values ──────────────────────────────────────────
  const traversalRaw = values['traversal']
  if (
    traversalRaw !== undefined &&
    traversalRaw !== 'interpreter' &&
    traversalRaw !== 'tree-walker'
  ) {
    console.error(
      `rdp-gen: unknown --traversal value "${traversalRaw}". Valid values: interpreter, tree-walker`,
    )
    process.exit(1)
  }

  const transformerRaw = values['transformer']
  if (transformerRaw !== undefined && transformerRaw !== 'standard' && transformerRaw !== 'json') {
    console.error(
      `rdp-gen: unknown --transformer value "${transformerRaw}". Pass --transformer or --transformer json`,
    )
    process.exit(1)
  }

  const lexerRaw = values['lexer']
  if (lexerRaw !== undefined && lexerRaw !== 'scannerless' && lexerRaw !== 'span') {
    console.error(
      `rdp-gen: unknown --lexer value "${lexerRaw}". Valid values: scannerless (default), span`,
    )
    process.exit(1)
  }

  const isScaffoldMode =
    traversalRaw !== undefined ||
    transformerRaw !== undefined ||
    values['facade'] === true ||
    values['pipeline'] === true

  let output: string
  if (values['ast-only']) {
    const ast = format === 'abnf' ? ABNFParser.parse(source) : EBNFParser.parse(source)
    output = JSON.stringify(ast, null, 2)
  } else if (lexerRaw === 'span') {
    // Span-lexer path — independent of scaffold mode; --traversal interpreter optionally
    // wires evaluation directly into the TokenParser methods.
    const flags: ScaffoldFlags = {
      lexer: 'span',
      ...(traversalRaw === 'interpreter' && { traversal: 'interpreter' }),
    }
    try {
      output = generateScaffold(source, flags, generatorOptions)
    } catch (e) {
      console.error(`rdp-gen: ${e instanceof Error ? e.message : String(e)}`)
      process.exit(1)
    }
  } else if (isScaffoldMode) {
    const flags: ScaffoldFlags = {
      ...(traversalRaw !== undefined && {
        traversal: traversalRaw as 'interpreter' | 'tree-walker',
      }),
      ...(transformerRaw !== undefined && {
        transformer: transformerRaw as 'standard' | 'json',
      }),
      ...(values['facade'] === true && { facade: true }),
      ...(values['pipeline'] === true && { pipeline: true }),
    }
    try {
      output = generateScaffold(source, flags, generatorOptions)
    } catch (e) {
      console.error(`rdp-gen: ${e instanceof Error ? e.message : String(e)}`)
      process.exit(1)
    }
  } else {
    output = generateParser(source, generatorOptions)
  }

  if (values['output']) {
    writeFileSync(values['output'], output, 'utf-8')
  } else {
    process.stdout.write(output)
  }
}

// ── rdp-gen init ───────────────────────────────────────────────────────────────

function runInit(rawArgs: string[]): void {
  if (rawArgs[0] === '--help' || rawArgs[0] === '-h') {
    printInitHelp()
    process.exit(0)
  }

  const { values } = parseArgs({
    args: rawArgs,
    options: {
      name: { type: 'string' },
      observable: { type: 'boolean' },
    },
    allowPositionals: false,
    strict: true,
  })

  const name = values['name'] ?? 'my-parser'
  const className = name
    .split('-')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('')
  const srcFile = `src/${className}.ts`
  const pkgPath = 'package.json'
  const tscPath = 'tsconfig.json'

  if (existsSync(pkgPath) || existsSync(tscPath) || existsSync(srcFile)) {
    console.error(
      `rdp-gen init: ${pkgPath}, ${tscPath}, or ${srcFile} already exists. Aborting to avoid overwriting.`,
    )
    process.exit(1)
  }

  const pkg = {
    name,
    version: '0.1.0',
    type: 'module',
    scripts: {
      build: 'tsc',
    },
    dependencies: {
      '@configuredthings/rdp.js': `^${version}`,
    },
  }

  const tsconfig = {
    compilerOptions: {
      target: 'ES2022',
      strict: true,
      noUncheckedIndexedAccess: true,
      moduleResolution: 'node16',
      module: 'node16',
      outDir: 'dist',
      declaration: true,
      sourceMap: true,
    },
    include: ['src/**/*.ts'],
    exclude: ['node_modules', 'dist'],
  }

  const parserTemplate = generateInitScaffold({
    className,
    ...(values['observable'] !== undefined && { observable: values['observable'] }),
  })

  mkdirSync('src', { recursive: true })
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8')
  writeFileSync(tscPath, JSON.stringify(tsconfig, null, 2) + '\n', 'utf-8')
  writeFileSync(srcFile, parserTemplate, 'utf-8')
  console.log(`Scaffolded ${pkgPath}, ${tscPath}, and ${srcFile}. Run npm install to get started.`)
}

// ── Help text ──────────────────────────────────────────────────────────────────

function printGenerateHelp(): void {
  console.log(`\
Usage: rdp-gen <grammar> [options]

Generate a TypeScript parser from an EBNF or ABNF grammar file.
Passing any scaffold flag emits a one-time starter file instead of the parser.

Arguments:
  <grammar>                      path to grammar file (.ebnf or .abnf)

Options:
  -o, --output <file>            write output to file instead of stdout
  --format <fmt>                 grammar format: ebnf or abnf (default: inferred from extension)
  --parser-name <name>           class name for the generated parser (default: GeneratedParser)
  --tree-name <name>             type name for the generated parse tree (default: ParseTree)
  --observable                   extend ObservableRDParser; adds notifyEnter/notifyExit calls
  --lexer <strategy>             lexer strategy to use (default: scannerless)
                                   scannerless  characters → AST directly; no separate tokeniser
                                   span         emit a span tokeniser + classifier scaffold instead
  --ast-only                     emit grammar AST as JSON instead of TypeScript
  --abnf-case-sensitive-strings  match ABNF string literals case-sensitively
  -v, --version                  print version number
  -h, --help                     show this help

Scaffold flags (any combination switches to scaffold mode):
  --traversal <strategy>         emit a traversal scaffold
                                   interpreter    one typed eval function per rule
                                   tree-walker    walk() utility + visitor stubs
  --transformer [json]           emit a Transformer scaffold
                                   (no value)     Transformer<ParseTree, T> with stubs per rule
                                   json           two-way stubs: ParseTree→JSONAST and JSONAST→string
  --facade                       wrap the scaffold in a module-as-facade (requires --traversal)
  --pipeline                     emit parse/validate/transform stages (requires --traversal tree-walker,
                                   or --traversal interpreter combined with --facade)

Commands:
  init [options]                 scaffold a new parser project (run rdp-gen init --help)`)
}

function printInitHelp(): void {
  console.log(`\
Usage: rdp-gen init [options]

Scaffold a new RDParser project with package.json, tsconfig.json, and a starter parser.

Options:
  --name <name>    npm package name; determines the class name (default: my-parser)
  --observable     extend ObservableRDParser; starter includes notifyEnter/notifyExit calls
  -h, --help       show this help`)
}
