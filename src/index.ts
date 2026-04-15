/**
 * @packageDocumentation
 *
 * `\@configuredthings/rdp.js` — a minimal typed base class for writing recursive
 * descent parsers in TypeScript.
 *
 * This entry point exports the lean runtime only. Observer infrastructure is
 * available separately via the `\@configuredthings/rdp.js/observable` subpath.
 * The code generator is available via `\@configuredthings/rdp.js/generator`.
 */

export { RDParser } from './rdparser.js'
export { RDParserException } from './exception.js'
