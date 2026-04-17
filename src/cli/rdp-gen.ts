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
import type { ScaffoldPattern, ScaffoldInner } from '../generator/index.js'
import { EBNFParser } from '../generator/ebnf-parser.js'
import { ABNFParser } from '../generator/abnf-parser.js'

const SCAFFOLD_PATTERNS: ScaffoldPattern[] = ['interpreter', 'facade', 'pipeline', 'tree-walker']
const SCAFFOLD_INNER_VALUES: ScaffoldInner[] = [
  'interpreter',
  'tree-walker',
  'pipeline:interpreter',
  'pipeline:tree-walker',
]

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

// ── rdp-gen <grammar> ──────────────────────────────────────────────────────────

function runGenerate(rawArgs: string[]): void {
  if (rawArgs[0] === '--help' || rawArgs[0] === '-h' || rawArgs.length === 0) {
    printGenerateHelp()
    process.exit(rawArgs.length === 0 ? 1 : 0)
  }

  const { values, positionals } = parseArgs({
    args: rawArgs,
    options: {
      output: { type: 'string', short: 'o' },
      format: { type: 'string' },
      'parser-name': { type: 'string' },
      'tree-name': { type: 'string' },
      observable: { type: 'boolean' },
      walker: { type: 'boolean' },
      scaffold: { type: 'string' },
      inner: { type: 'string' },
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

  let output: string
  if (values['ast-only']) {
    const ast = format === 'abnf' ? ABNFParser.parse(source) : EBNFParser.parse(source)
    output = JSON.stringify(ast, null, 2)
  } else if (values['scaffold']) {
    const pattern = values['scaffold']
    if (!SCAFFOLD_PATTERNS.includes(pattern as ScaffoldPattern)) {
      console.error(
        `rdp-gen: unknown scaffold pattern "${pattern}". Valid patterns: ${SCAFFOLD_PATTERNS.join(', ')}`,
      )
      process.exit(1)
    }

    const innerRaw = values['inner']
    if (innerRaw !== undefined && !SCAFFOLD_INNER_VALUES.includes(innerRaw as ScaffoldInner)) {
      console.error(
        `rdp-gen: unknown --inner value "${innerRaw}". Valid values: ${SCAFFOLD_INNER_VALUES.join(', ')}`,
      )
      process.exit(1)
    }

    // Validate combinations — generateScaffold also checks, but give a cleaner CLI error.
    if ((pattern === 'facade' || pattern === 'pipeline') && !innerRaw) {
      const validInner =
        pattern === 'facade'
          ? 'interpreter, tree-walker, pipeline:interpreter, or pipeline:tree-walker'
          : 'interpreter or tree-walker'
      console.error(`rdp-gen: --scaffold ${pattern} requires --inner. Pass --inner ${validInner}.`)
      process.exit(1)
    }
    if ((pattern === 'interpreter' || pattern === 'tree-walker') && innerRaw) {
      console.error(`rdp-gen: --inner is not applicable to --scaffold ${pattern}.`)
      process.exit(1)
    }
    if (
      pattern === 'pipeline' &&
      (innerRaw === 'pipeline:interpreter' || innerRaw === 'pipeline:tree-walker')
    ) {
      console.error(
        `rdp-gen: --scaffold pipeline does not support --inner pipeline:*. Use --inner interpreter or --inner tree-walker.`,
      )
      process.exit(1)
    }

    output = generateScaffold(source, pattern as ScaffoldPattern, {
      ...generatorOptions,
      ...(innerRaw !== undefined && { inner: innerRaw as ScaffoldInner }),
    })
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

Generate a TypeScript RDParser subclass from an EBNF or ABNF grammar file.

Arguments:
  <grammar>                          path to grammar file (.ebnf or .abnf)

Options:
  -o, --output <file>                write output to file instead of stdout
  --format <fmt>                     grammar format: ebnf or abnf (default: inferred from extension)
  --parser-name <name>               class name for the generated parser (default: GeneratedParser)
  --tree-name <name>                 type name for the generated parse tree (default: ParseTree)
  --observable                       extend ObservableRDParser; adds notifyEnter/notifyExit calls
  --scaffold <pattern>               emit a one-time usage scaffold instead of the parser
                                     interpreter  one typed function per rule, ready to fill in
                                     facade       module-as-facade with domain class and error type (requires --inner)
                                     pipeline     parse / validate / transform stages (requires --inner)
                                     tree-walker  walk() utility using childNodes with visitor stubs
  --inner <strategy>                 inner traversal strategy for facade and pipeline scaffolds
                                     interpreter          recursive eval functions
                                     tree-walker          childNodes-based tree walker with visitor stubs
                                     pipeline:interpreter pipeline class with eval inside #transform (facade only)
                                     pipeline:tree-walker pipeline class with tree-walker inside #transform (facade only)
  --ast-only                         emit grammar AST as JSON instead of TypeScript
  --abnf-case-sensitive-strings      match ABNF string literals case-sensitively
  -v, --version                      print version number
  -h, --help                         show this help

Commands:
  init [options]                     scaffold a new parser project (run rdp-gen init --help)`)
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
