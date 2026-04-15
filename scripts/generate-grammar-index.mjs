#!/usr/bin/env node
/**
 * Generates src/grammars/index.ts from the four canonical grammar files.
 * Run via: npm run generate:grammars
 * Called automatically as part of: npm run build
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const grammarsDir = resolve(root, 'src/grammars')

function read(filename){
  return readFileSync(resolve(grammarsDir, filename), 'utf8').trimEnd()
}

const ebnfMetaEBNF = read('ebnf-meta.ebnf')
const ebnfMetaABNF = read('ebnf-meta.abnf')
const abnfMetaEBNF = read('abnf-meta.ebnf')
const abnfMetaABNF = read('abnf-meta.abnf')

// Escape backticks and ${} so the strings are safe inside template literals.
function escape(s) {
  return s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')
}

const output = `\
/**
 * Canonical meta-grammar strings for the rdp.js EBNF and ABNF formats.
 *
 * THIS FILE IS GENERATED — do not edit by hand.
 * Regenerate with: npm run generate:grammars
 *
 * Source files (edit these instead):
 *   src/grammars/ebnf-meta.ebnf
 *   src/grammars/ebnf-meta.abnf
 *   src/grammars/abnf-meta.ebnf
 *   src/grammars/abnf-meta.abnf
 *
 * Four grammars are provided:
 *
 *   ebnfMetaEBNF  — EBNF grammar describing the EBNF format (limited: no string
 *                   literals in test input, because EBNF can't express ' in EBNF)
 *   ebnfMetaABNF  — ABNF grammar describing the EBNF format (full coverage,
 *                   including single-quoted literals via char ranges)
 *   abnfMetaEBNF  — EBNF grammar describing the ABNF format (limited: no %x ranges)
 *   abnfMetaABNF  — ABNF grammar describing the ABNF format (self-describing)
 */

/** EBNF meta-grammar written in EBNF (mirrors ebnf-meta.ebnf). */
export const ebnfMetaEBNF = \`${escape(ebnfMetaEBNF)}\`

/** EBNF meta-grammar written in ABNF (mirrors ebnf-meta.abnf). */
export const ebnfMetaABNF = \`${escape(ebnfMetaABNF)}\`

/** ABNF meta-grammar written in EBNF (mirrors abnf-meta.ebnf). */
export const abnfMetaEBNF = \`${escape(abnfMetaEBNF)}\`

/** ABNF meta-grammar written in ABNF — self-describing (mirrors abnf-meta.abnf). */
export const abnfMetaABNF = \`${escape(abnfMetaABNF)}\`
`

const outPath = resolve(grammarsDir, 'index.ts')
writeFileSync(outPath, output)
console.log(`wrote ${outPath}`)
