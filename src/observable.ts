/**
 * Opt-in observer infrastructure for parse tracing and debugging.
 *
 * Import from the `\@configuredthings/rdp.js/observable` subpath entry point.
 * Parsers that do not import this subpath carry zero observer overhead.
 */

import { RDParser } from './rdparser.js'

/**
 * A single event emitted during a parse trace.
 *
 * - `enter` — the parser entered a production method
 * - `exit`  — the parser returned from a production method
 * - `error` — the parser threw a parse error
 */
export type ParseEvent =
  | { kind: 'enter'; production: string; position: number }
  | { kind: 'exit'; production: string; position: number; matched: boolean }
  | { kind: 'error'; message: string; position: number }

/**
 * Implement this interface to receive parse events from an {@link ObservableRDParser}.
 */
export interface ParseObserver {
  /**
   * Called when the parser enters a production method.
   * @param production - Name of the production rule.
   * @param position - Current byte offset in the source.
   */
  onEnterProduction(production: string, position: number): void

  /**
   * Called when the parser exits a production method.
   * @param production - Name of the production rule.
   * @param position - Current byte offset in the source after the attempt.
   * @param matched - Whether the production successfully matched input.
   */
  onExitProduction(production: string, position: number, matched: boolean): void

  /**
   * Called when the parser throws a parse error.
   * @param message - The error message.
   * @param position - Current byte offset in the source at the time of failure.
   */
  onError(message: string, position: number): void
}

/**
 * Accumulates a full parse trace as an array of {@link ParseEvent} objects.
 *
 * Attach to an {@link ObservableRDParser} via `withObserver(new TraceObserver())`,
 * then inspect `observer.events` after parsing.
 */
export class TraceObserver implements ParseObserver {
  /** All events emitted during parsing, in order. */
  readonly events: ParseEvent[] = []

  onEnterProduction(production: string, position: number): void {
    this.events.push({ kind: 'enter', production, position })
  }

  onExitProduction(production: string, position: number, matched: boolean): void {
    this.events.push({ kind: 'exit', production, position, matched })
  }

  onError(message: string, position: number): void {
    this.events.push({ kind: 'error', message, position })
  }
}

/**
 * Formats parse events as an indented call tree and writes each line to a sink.
 *
 * Defaults to writing to `console.error`. Pass a custom sink to redirect output:
 *
 * ```ts
 * const lines: string[] = []
 * const obs = new DebugObserver(line => lines.push(line))
 * ```
 *
 * Output example:
 * ```
 * → expr  pos:0
 *   → term  pos:0
 *   ← term  matched  pos:1
 * ← expr  matched  pos:1
 * ```
 */
export class DebugObserver implements ParseObserver {
  #depth = 0
  readonly #sink: (line: string) => void

  /**
   * @param sink - Optional line writer. Defaults to `console.error`.
   */
  constructor(sink?: (line: string) => void) {
    this.#sink = sink ?? ((line): void => console.error(line))
  }

  onEnterProduction(production: string, position: number): void {
    this.#sink(`${'  '.repeat(this.#depth)}→ ${production}  pos:${position}`)
    this.#depth++
  }

  onExitProduction(production: string, position: number, matched: boolean): void {
    this.#depth--
    this.#sink(
      `${'  '.repeat(this.#depth)}← ${production}  ${matched ? 'matched' : 'failed'}  pos:${position}`,
    )
  }

  onError(message: string, position: number): void {
    this.#sink(`${'  '.repeat(this.#depth)}✗ ERROR: ${message}  pos:${position}`)
  }
}

/**
 * An `RDParser` subclass that adds opt-in observer support for tracing and debugging.
 *
 * Extend `ObservableRDParser` instead of `RDParser` when parse tracing is needed.
 * Call `withObserver()` to attach a {@link ParseObserver} before parsing.
 * Production parsers that extend the lean `RDParser` directly carry zero observer overhead.
 *
 * Generated parsers use this base class when `rdp-gen` is run with `--observable`.
 */
export class ObservableRDParser extends RDParser {
  #observer?: ParseObserver

  /**
   * Attaches an observer that will receive parse events during parsing.
   * Returns `this` for chaining: `new MyParser(source).withObserver(obs).parse()`.
   *
   * @param observer - The observer to attach.
   */
  withObserver(observer: ParseObserver): this {
    this.#observer = observer
    return this
  }

  /**
   * Call at the entry of each production method to notify the observer.
   *
   * @param production - Name of the production rule being entered.
   */
  protected notifyEnter(production: string): void {
    this.#observer?.onEnterProduction(production, this.getPosition())
  }

  /**
   * Call before each `return` in a production method to notify the observer.
   *
   * @param production - Name of the production rule being exited.
   * @param matched - Whether the production successfully matched input.
   */
  protected notifyExit(production: string, matched: boolean): void {
    this.#observer?.onExitProduction(production, this.getPosition(), matched)
  }

  /**
   * Notifies the observer of the error before re-throwing via the base class.
   *
   * @param message - Description of the parse failure.
   * @throws {RDParserException} Always.
   */
  protected override error(message: string): never {
    this.#observer?.onError(message, this.getPosition())
    return super.error(message)
  }
}
