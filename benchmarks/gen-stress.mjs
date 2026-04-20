// Generates benchmarks/stress.ebnf — a pathological EBNF grammar designed to
// maximise work for scannerless parsers:
//   - 15 large character-class rules (80-94 alternatives each)
//   - 35 production rules using them in repetitions, sequences, and nested structures
//
// Run: node benchmarks/gen-stress.mjs

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dir = dirname(fileURLToPath(import.meta.url))

// ── Helpers ───────────────────────────────────────────────────────────────────

// Produce EBNF alternation for all printable ASCII chars (32-126) minus excludes
function charClass(excludeStr = '') {
  const excl = new Set(excludeStr)
  const alts = []
  for (let c = 32; c <= 126; c++) {
    const ch = String.fromCharCode(c)
    if (excl.has(ch)) continue
    if (ch === '\\') alts.push("'\\\\'")   // EBNF literal for backslash
    else if (ch === "'") alts.push('"' + "'" + '"') // EBNF literal for single-quote
    else alts.push(`'${ch}'`)
  }
  return alts.join(' | ')
}

// Letter and digit classes
const UPPER = Array.from({length:26}, (_,i) => `'${String.fromCharCode(65+i)}'`).join(' | ')
const LOWER = Array.from({length:26}, (_,i) => `'${String.fromCharCode(97+i)}'`).join(' | ')
const DIGIT = Array.from({length:10}, (_,i) => `'${i}'`).join(' | ')

// ── Grammar ───────────────────────────────────────────────────────────────────
const rules = []

const R = (...lines) => rules.push(...lines, '')

R('(* Stress-test EBNF grammar.',
  '   Designed to draw out the performance gap between scannerless and',
  '   lexer-based parsing approaches.',
  '   * 15 large char-class rules (80-94 alternatives each)',
  '   * 35 production rules using them in sequences and nested repetitions *)')

// ── Root and structural rules ─────────────────────────────────────────────────
R('Document = {Block};',
  'Block    = Heading | Para | CodeBlock | Blockquote | List | Table | Metadata | Footnote | Definition | HtmlComment;')

R('Heading     = HeadMark, {HeadChar}, LineEnd;',
  'HeadMark    = \'#\', [\'#\', [\'#\', [\'#\', [\'#\', [\'#\']]]]];')

R('Para        = {Inline}, ParaEnd;',
  'Inline      = Emphasis | Strong | InlineCode | Link | Image | PlainText;',
  'Emphasis    = \'*\', {EmphChar}, \'*\' | \'_\', {EmphChar}, \'_\';',
  'Strong      = \'*\', \'*\', {StrongChar}, \'*\', \'*\' | \'_\', \'_\', {StrongChar}, \'_\', \'_\';',
  'InlineCode  = \'`\', {InlineCodeChar}, \'`\';',
  'Link        = \'[\', {LinkLabelChar}, \']\', \'(\', {UrlChar}, [WspChar, \'"\', {TitleChar}, \'"\'], \')\';',
  'Image       = \'!\', \'[\', {AltChar}, \']\', \'(\', {UrlChar}, [WspChar, \'"\', {TitleChar}, \'"\'], \')\';',
  'PlainText   = {TextChar};')

R('CodeBlock   = FenceMark, [LangId], LineEnd, {CodeLine}, FenceMark;',
  'FenceMark   = \'`\', \'`\', \'`\' | \'~\', \'~\', \'~\';',
  'LangId      = UpperLetter | LowerLetter, {UpperLetter | LowerLetter | Digit | \'-\'};',
  'CodeLine    = {CodeLineChar}, LineEnd;')

R('Blockquote  = \'>\', {QuoteChar}, LineEnd, [{\'>\', {QuoteChar}, LineEnd}];')

R('List        = {ListItem};',
  'ListItem    = ListMark, {Inline}, LineEnd, [List];',
  'ListMark    = Digit, \'.\', WspChar | \'-\', WspChar | \'*\', WspChar | \'+\', WspChar;')

R('Table       = {TableRow};',
  'TableRow    = \'|\', {TableCell, \'|\'}, LineEnd;',
  'TableCell   = {CellChar};')

R('Metadata    = MetaFence, LineEnd, {MetaLine}, MetaFence, LineEnd;',
  'MetaFence   = \'-\', \'-\', \'-\';',
  'MetaLine    = {MetaKeyChar}, \':\', WspChar, {MetaValChar}, LineEnd;')

R('Footnote    = \'[\', \'^\', {NameChar}, \']\', \':\', WspChar, {FootChar};',
  'Definition  = \'[\', {NameChar}, \']\', \':\', WspChar, {UrlChar}, [WspChar, \'"\', {TitleChar}, \'"\'];',
  'HtmlComment = \'<\', \'!\', \'-\', \'-\', {CommentChar}, \'-\', \'-\', \'>\';')

R('LineEnd     = [\'\\r\'], \'\\n\';',
  'ParaEnd     = LineEnd, LineEnd;',
  'WspChar     = \' \' | \'\\t\';',
  'NameChar    = UpperLetter | LowerLetter | Digit | \'-\';',
  'UpperLetter = ' + UPPER + ';',
  'LowerLetter = ' + LOWER + ';',
  'Digit       = ' + DIGIT + ';')

// ── Large character-class rules ───────────────────────────────────────────────
R('(* The lines below are the stress core: each has 80-94 alternatives.',
  '   A scannerless parser tries each in turn; a lexer collapses them to a range check. *)')

R(`HeadChar       = ${charClass('\n')};`)
R(`TextChar       = ${charClass('\n*_`![')};`)
R(`EmphChar       = ${charClass('\n*_')};`)
R(`StrongChar     = ${charClass('\n*_')};`)
R(`InlineCodeChar = ${charClass('\n`')};`)
R(`LinkLabelChar  = ${charClass('\n[]')};`)
R(`AltChar        = ${charClass('\n[]')};`)
R(`UrlChar        = ${charClass('\n() "')};`)
R(`TitleChar      = ${charClass('\n"')};`)
R(`QuoteChar      = ${charClass('\n')};`)
R(`CellChar       = ${charClass('\n|')};`)
R(`CodeLineChar   = ${charClass('\n')};`)
R(`MetaKeyChar    = ${charClass('\n:')};`)
R(`MetaValChar    = ${charClass('\n')};`)
R(`FootChar       = ${charClass('\n')};`)
R(`CommentChar    = ${charClass('\n-')};`)

// ── Extra rules to bulk out the grammar ───────────────────────────────────────
R('(* Additional rules to increase grammar size and rule count *)')
for (let i = 0; i < 8; i++) {
  const cls = ['HeadChar','TextChar','EmphChar','StrongChar','InlineCodeChar','QuoteChar','CellChar','CommentChar'][i]
  R(`Ext${i}Simple = {${cls}};`,
    `Ext${i}Opt    = [${cls}, {${cls}}];`,
    `Ext${i}Nested = ${cls}, [${cls}], [{${cls}}];`,
    `Ext${i}Group  = Ext${i}Simple | Ext${i}Opt | Ext${i}Nested;`)
}

// ── Write ─────────────────────────────────────────────────────────────────────
const grammar = rules.join('\n')
writeFileSync(join(__dir, 'stress.ebnf'), grammar)
console.log(`Written stress.ebnf: ${grammar.length.toLocaleString()} chars, ${grammar.split('\n').length} lines`)
console.log('Validate: node dist/esm/cli/rdp-gen.js benchmarks/stress.ebnf --ast-only > /dev/null')
