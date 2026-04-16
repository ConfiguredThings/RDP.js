#!/usr/bin/env node
/**
 * rdp-gen — generate a TypeScript RDParser subclass from an EBNF or ABNF grammar file.
 *
 * Compiled by tsc as part of the ESM build. `commander` is a runtime dependency.
 */

import { Command } from 'commander'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { generateParser } from '../generator/index.js'
import { EBNFParser } from '../generator/ebnf-parser.js'
import { ABNFParser } from '../generator/abnf-parser.js'

const require = createRequire(import.meta.url)
const { version } = require('../../../package.json') as { version: string }

const program = new Command()

program
  .name('rdp-gen')
  .description('Generate a TypeScript RDParser subclass from an EBNF or ABNF grammar file')
  .version(version)
  .argument('<grammar>', 'path to grammar file (.ebnf or .abnf)')
  .option('-o, --output <file>', 'write output to file instead of stdout')
  .option('--format <fmt>', 'grammar format: ebnf or abnf (default: inferred from file extension)')
  .option('--parser-name <name>', 'class name for the generated parser', 'GeneratedParser')
  .option('--tree-name <name>', 'type name for the generated parse tree', 'ParseTree')
  .option(
    '--observable',
    'extend ObservableRDParser; generated methods include notifyEnter/notifyExit calls',
  )
  .option(
    '--ast-only',
    'emit the grammar AST as JSON instead of a TypeScript parser (used by playground)',
  )
  .option(
    '--abnf-case-sensitive-strings',
    'match ABNF quoted string literals case-sensitively (preserves exact chars as written); RFC 5234 default is case-insensitive',
  )
  .action(
    (
      grammarPath: string,
      options: {
        format?: string
        output?: string
        parserName: string
        treeName: string
        observable?: boolean
        astOnly?: boolean
        abnfCaseSensitiveStrings?: boolean
      },
    ) => {
      if (!existsSync(grammarPath)) {
        console.error(`rdp-gen: file not found: ${grammarPath}`)
        process.exit(1)
      }

      const format = (options.format ?? (grammarPath.endsWith('.abnf') ? 'abnf' : 'ebnf')) as
        | 'ebnf'
        | 'abnf'
      const source = readFileSync(grammarPath, 'utf-8')

      let output: string
      if (options.astOnly) {
        const ast = format === 'abnf' ? ABNFParser.parse(source) : EBNFParser.parse(source)
        output = JSON.stringify(ast, null, 2)
      } else {
        output = generateParser(source, {
          format,
          parserName: options.parserName,
          treeName: options.treeName,
          ...(options.observable !== undefined && { observable: options.observable }),
          ...(options.abnfCaseSensitiveStrings !== undefined && {
            caseSensitiveStrings: options.abnfCaseSensitiveStrings,
          }),
        })
      }

      if (options.output) {
        writeFileSync(options.output, output, 'utf-8')
      } else {
        process.stdout.write(output)
      }
    },
  )

// rdp-gen init — scaffold a new parser project
program
  .command('init')
  .description(
    'Scaffold a new RDParser project with package.json, tsconfig.json, and a starter parser',
  )
  .option('--name <name>', 'npm package name for the scaffolded project', 'my-parser')
  .option(
    '--observable',
    'extend ObservableRDParser; starter includes notifyEnter/notifyExit calls',
  )
  .action((options: { name: string; observable?: boolean }) => {
    const className = options.name
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
      name: options.name,
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

    const parserTemplate = options.observable
      ? `\
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
      : `\
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

    mkdirSync('src', { recursive: true })
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8')
    writeFileSync(tscPath, JSON.stringify(tsconfig, null, 2) + '\n', 'utf-8')
    writeFileSync(srcFile, parserTemplate, 'utf-8')
    console.log(
      `Scaffolded ${pkgPath}, ${tscPath}, and ${srcFile}. Run npm install to get started.`,
    )
  })

program.parse()
