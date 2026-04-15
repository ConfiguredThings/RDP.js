/**
 * @packageDocumentation
 *
 * Runtime grammar interpreter — execute EBNF or ABNF grammars without a
 * code-generation step.
 *
 * Import from the `\@configuredthings/rdp.js/interpreter` subpath entry point:
 *
 * ```ts
 * import { GrammarInterpreter } from '@configuredthings/rdp.js/interpreter'
 * import { EBNFParser }         from '@configuredthings/rdp.js/generator'
 *
 * const ast    = EBNFParser.parse('Greeting = "hello" | "world";')
 * const bytes  = new TextEncoder().encode('hello')
 * const result = new GrammarInterpreter(ast, new DataView(bytes.buffer)).parse()
 * // → true
 * ```
 *
 * ## Interpreter vs generated parser
 *
 * `GrammarInterpreter` walks the {@link GrammarAST} at runtime, dispatching on
 * each {@link RuleBody} node for every byte of input.  This makes it convenient
 * for tooling, playgrounds, and grammar exploration without requiring a build
 * step.  For production use, {@link generateParser} from
 * `\@configuredthings/rdp.js/generator` emits a fully optimised TypeScript class
 * with static types and zero interpreter overhead.
 *
 * ## Limitations
 *
 * - **ASCII / single-byte codepoints only.**  `charValue` nodes and `terminal`
 *   values are matched byte-for-byte.  Multi-byte UTF-8 sequences are not
 *   re-encoded; if your grammar uses non-ASCII literals the behaviour is
 *   undefined.
 * - **No left-recursion detection.**  A left-recursive grammar will overflow the
 *   call stack.  Pass the AST through `generateParser` first if you need the
 *   guard — it calls `detectLeftRecursion` internally.
 * - **LL(1) semantics.**  The interpreter takes the first matching alternative
 *   in an `alternation` node; it does not backtrack across successful alternatives.
 */

import { ObservableRDParser } from './observable.js'
import type { GrammarAST, RuleBody, CoreRuleName } from './generator/ast.js'

/**
 * A runtime interpreter for grammars expressed as a {@link GrammarAST}.
 *
 * Extends {@link ObservableRDParser} so every rule entry and exit is visible to
 * an attached {@link ObservableRDParser.ParseObserver}, making it suitable as a drop-in replacement
 * for a generated observable parser in debugging and testing contexts.
 *
 * @example
 * ```ts
 * import { GrammarInterpreter } from '@configuredthings/rdp.js/interpreter'
 * import { EBNFParser }          from '@configuredthings/rdp.js/generator'
 * import { TraceObserver }       from '@configuredthings/rdp.js/observable'
 *
 * // Parse an EBNF grammar into an AST once, then reuse the AST for many inputs
 * const ast = EBNFParser.parse(`
 *   Number = Digit, {Digit};
 *   Digit  = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';
 * `)
 *
 * function tryParse(input: string): boolean {
 *   const bytes = new TextEncoder().encode(input)
 *   return new GrammarInterpreter(ast, new DataView(bytes.buffer)).parse()
 * }
 *
 * tryParse('42')   // → true
 * tryParse('abc')  // → false
 *
 * // Attach a trace observer for step-by-step debugging
 * const obs = new TraceObserver()
 * const bytes = new TextEncoder().encode('7')
 * new GrammarInterpreter(ast, new DataView(bytes.buffer))
 *   .withObserver(obs)
 *   .parse()
 * console.log(obs.events) // enter/exit events for Number and Digit
 * ```
 */
export class GrammarInterpreter extends ObservableRDParser {
  /**
   * Index of rule bodies by name, built once from the AST at construction time.
   * Keyed by the production rule name exactly as it appears in the grammar source.
   */
  readonly #ruleMap: Map<string, RuleBody>

  /**
   * The name of the grammar's entry-point rule — the first rule in `ast.rules`.
   * An empty string signals an empty grammar; {@link parse} will return `false`.
   */
  readonly #entryRule: string

  /**
   * Constructs an interpreter for the given grammar, ready to parse `source`.
   *
   * The AST is indexed into a `Map` so rule lookups during parsing are O(1).
   * Constructing a new `GrammarInterpreter` for each input is cheap; the
   * expensive work is {@link Generator.EBNFParser.parse} / {@link Generator.ABNFParser.parse} that produces the AST.
   *
   * @param ast    - A {@link GrammarAST} produced by `EBNFParser.parse` or `ABNFParser.parse`.
   * @param source - The input to parse, wrapped in a `DataView`.
   */
  constructor(ast: GrammarAST, source: DataView) {
    super(source)
    this.#ruleMap = new Map(ast.rules.map((rule) => [rule.name, rule.body]))
    this.#entryRule = ast.rules[0]?.name ?? ''
  }

  /**
   * Attempts to match the entire `source` against the grammar's first
   * production rule.
   *
   * Returns `true` if and only if the first rule matches **and** all input has
   * been consumed.  Returns `false` if the grammar is empty, the rule fails, or
   * input remains after a successful rule match.
   *
   * @returns `true` on a full match, `false` otherwise.
   */
  parse(): boolean {
    if (this.#entryRule === '') return false
    return this.#matchRule(this.#entryRule) && this.atEnd()
  }

  // ── Rule dispatch ──────────────────────────────────────────────────────────

  /**
   * Looks up `name` in the rule map and attempts to match its body.
   *
   * Fires {@link notifyEnter} and {@link notifyExit} around the attempt so
   * observers receive a complete trace.  Position is restored on failure.
   *
   * If `name` is not in the rule map (i.e. a non-terminal reference points to
   * an undefined rule) the method returns `false` silently without emitting any
   * observer events.
   *
   * @param name - The production rule name to match.
   * @returns `true` if the rule body matched, `false` otherwise.
   */
  #matchRule(name: string): boolean {
    const body = this.#ruleMap.get(name)
    if (body === undefined) return false
    this.notifyEnter(name)
    const savedPosition = this.getPosition()
    const matched = this.#matchBody(body)
    if (!matched) this.restorePosition(savedPosition)
    this.notifyExit(name, matched)
    return matched
  }

  // ── Body dispatch ──────────────────────────────────────────────────────────

  /**
   * Dispatches on the `kind` discriminant of `body` and attempts to match the
   * corresponding construct against the current input position.
   *
   * Position is restored by the caller (`#matchRule`, `alternation`, etc.) on
   * any failure path that requires backtracking; individual `#matchBody`
   * branches do not all guarantee a clean rollback on their own.
   *
   * @param body - The rule body node to interpret.
   * @returns `true` if the body matched, `false` otherwise.
   */
  #matchBody(body: RuleBody): boolean {
    switch (body.kind) {
      // ── Structural combinators ─────────────────────────────────────────────

      case 'sequence': {
        const savedPosition = this.getPosition()
        for (const item of body.items) {
          if (!this.#matchBody(item)) {
            this.restorePosition(savedPosition)
            return false
          }
        }
        return true
      }

      case 'alternation': {
        const savedPosition = this.getPosition()
        for (const item of body.items) {
          if (this.#matchBody(item)) return true
          this.restorePosition(savedPosition)
        }
        return false
      }

      case 'optional': {
        const savedPosition = this.getPosition()
        if (!this.#matchBody(body.item)) this.restorePosition(savedPosition)
        return true
      }

      case 'zeroOrMore': {
        while (true) {
          const savedPosition = this.getPosition()
          if (!this.#matchBody(body.item)) {
            this.restorePosition(savedPosition)
            break
          }
        }
        return true
      }

      case 'oneOrMore': {
        if (!this.#matchBody(body.item)) return false
        while (true) {
          const savedPosition = this.getPosition()
          if (!this.#matchBody(body.item)) {
            this.restorePosition(savedPosition)
            break
          }
        }
        return true
      }

      case 'repetition': {
        // First match the mandatory minimum.
        for (let i = 0; i < body.min; i++) {
          if (!this.#matchBody(body.item)) return false
        }
        // Then greedily match optional occurrences up to `max` (null = unbounded).
        let count = body.min
        while (body.max === null || count < body.max) {
          const savedPosition = this.getPosition()
          if (!this.#matchBody(body.item)) {
            this.restorePosition(savedPosition)
            break
          }
          count++
        }
        return true
      }

      // ── Terminals ─────────────────────────────────────────────────────────

      case 'terminal':
        return this.#matchBytes(new TextEncoder().encode(body.value))

      case 'nonTerminal':
        return this.#matchRule(body.name)

      case 'charValue': {
        if (body.range !== undefined) {
          const [rangeMin, rangeMax] = body.range
          const currentByte = this.peek()
          if (currentByte === null || currentByte < rangeMin || currentByte > rangeMax) return false
          this.advance()
          return true
        }
        return this.#matchBytes(new Uint8Array(body.codepoints))
      }

      case 'coreRule':
        return this.#matchCoreRule(body.name)

      case 'exception': {
        const savedPosition = this.getPosition()
        if (!this.#matchBody(body.item)) return false
        const positionAfterItem = this.getPosition()
        this.restorePosition(savedPosition)
        if (this.#matchBody(body.except)) {
          this.restorePosition(savedPosition)
          return false
        }
        this.restorePosition(positionAfterItem)
        return true
      }

      default: {
        const _exhaustive: never = body
        return _exhaustive
      }
    }
  }

  // ── Byte-level helpers ─────────────────────────────────────────────────────

  /**
   * Attempts to match `bytes` exactly at the current position.
   *
   * Restores position and returns `false` if any byte fails to match.
   * Returns `true` immediately for an empty array.
   *
   * @param bytes - The byte sequence to match.
   * @returns `true` if all bytes matched, `false` otherwise.
   */
  #matchBytes(bytes: Uint8Array): boolean {
    if (bytes.length === 0) return true
    const savedPosition = this.getPosition()
    for (const byte of bytes) {
      if (!this.matchChar(byte)) {
        this.restorePosition(savedPosition)
        return false
      }
    }
    return true
  }

  // ── RFC 5234 core rules ────────────────────────────────────────────────────

  /**
   * Matches a single byte against one of the RFC 5234 core rules.
   *
   * `LWSP` is handled before the null-peek guard because it matches zero or
   * more characters and must succeed even at end of input.  All other rules
   * require at least one byte and return `false` immediately when `peek()`
   * returns `null`.
   *
   * @param name - The RFC 5234 core rule name to match.
   * @returns `true` if the rule matched and the position was advanced,
   *   `false` otherwise (position unchanged).
   */
  #matchCoreRule(name: CoreRuleName): boolean {
    // LWSP = *( WSP / CRLF WSP ) — matches zero occurrences, so succeeds at EOF.
    if (name === 'LWSP') return this.#matchLWSP()

    const currentByte = this.peek()
    if (currentByte === null) return false

    switch (name) {
      case 'ALPHA':
        if (
          (currentByte >= 0x41 && currentByte <= 0x5a) ||
          (currentByte >= 0x61 && currentByte <= 0x7a)
        ) {
          this.advance()
          return true
        }
        return false

      case 'BIT':
        if (currentByte === 0x30 || currentByte === 0x31) {
          this.advance()
          return true
        }
        return false

      case 'CHAR':
        if (currentByte >= 0x01 && currentByte <= 0x7f) {
          this.advance()
          return true
        }
        return false

      case 'CR':
        if (currentByte === 0x0d) {
          this.advance()
          return true
        }
        return false

      case 'CRLF': {
        if (currentByte !== 0x0d) return false
        const savedPosition = this.getPosition()
        this.advance()
        if (this.peek() === 0x0a) {
          this.advance()
          return true
        }
        this.restorePosition(savedPosition)
        return false
      }

      case 'CTL':
        if (currentByte <= 0x1f || currentByte === 0x7f) {
          this.advance()
          return true
        }
        return false

      case 'DIGIT':
        if (currentByte >= 0x30 && currentByte <= 0x39) {
          this.advance()
          return true
        }
        return false

      case 'DQUOTE':
        if (currentByte === 0x22) {
          this.advance()
          return true
        }
        return false

      case 'HEXDIG':
        if (
          (currentByte >= 0x30 && currentByte <= 0x39) ||
          (currentByte >= 0x41 && currentByte <= 0x46) ||
          (currentByte >= 0x61 && currentByte <= 0x66)
        ) {
          this.advance()
          return true
        }
        return false

      case 'HTAB':
        if (currentByte === 0x09) {
          this.advance()
          return true
        }
        return false

      case 'LF':
        if (currentByte === 0x0a) {
          this.advance()
          return true
        }
        return false

      case 'OCTET':
        this.advance()
        return true

      case 'SP':
        if (currentByte === 0x20) {
          this.advance()
          return true
        }
        return false

      case 'VCHAR':
        if (currentByte >= 0x21 && currentByte <= 0x7e) {
          this.advance()
          return true
        }
        return false

      case 'WSP':
        if (currentByte === 0x20 || currentByte === 0x09) {
          this.advance()
          return true
        }
        return false
    }
  }

  /**
   * Matches `LWSP = *( WSP / CRLF WSP )` (RFC 5234 §B.1).
   *
   * Always returns `true` — LWSP matches zero or more linear whitespace
   * characters.  The loop advances greedily:
   *
   * - A plain space (0x20) or horizontal tab (0x09) is consumed as WSP.
   * - A CR (0x0d) followed immediately by LF (0x0a) and then a WSP character
   *   is consumed as a folded-whitespace sequence (CRLF WSP).
   * - Any other sequence terminates the match; position is restored to before
   *   the start of the last attempted sequence.
   *
   * @returns Always `true`.
   */
  #matchLWSP(): boolean {
    while (true) {
      const saved = this.getPosition()
      const ch = this.peek()

      if (ch === 0x20 || ch === 0x09) {
        this.advance()
        continue
      }

      if (ch === 0x0d) {
        this.advance()
        if (this.peek() === 0x0a) {
          this.advance()
          const wsp = this.peek()
          if (wsp === 0x20 || wsp === 0x09) {
            this.advance()
            continue
          }
        }
        this.restorePosition(saved)
        break
      }

      break // null (EOF) or any non-LWSP character
    }
    return true
  }
}
