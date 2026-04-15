#!/usr/bin/env node
/**
 * rdp-gen — generate a TypeScript RDParser subclass from an EBNF or ABNF grammar file.
 *
 * Compiled by tsc as part of the ESM build. `commander` is a runtime dependency.
 */

import { Command } from 'commander'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
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
  .description('Scaffold a new RDParser project with package.json and tsconfig.json')
  .option('--name <name>', 'npm package name for the scaffolded project', 'my-parser')
  .action((options: { name: string }) => {
    const pkgPath = 'package.json'
    const tscPath = 'tsconfig.json'

    if (existsSync(pkgPath) || existsSync(tscPath)) {
      console.error(
        `rdp-gen init: ${pkgPath} or ${tscPath} already exists. Aborting to avoid overwriting.`,
      )
      process.exit(1)
    }

    const pkg = {
      name: options.name,
      version: '0.1.0',
      type: 'module',
      scripts: {
        generate:
          'rdp-gen grammar.ebnf --parser-name GeneratedParser --output src/generatedParser.ts',
        build: 'npm run generate && tsc',
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

    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8')
    writeFileSync(tscPath, JSON.stringify(tsconfig, null, 2) + '\n', 'utf-8')
    console.log(`Scaffolded ${pkgPath} and ${tscPath}. Run npm install to get started.`)
  })

program.parse()
