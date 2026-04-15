/**
 * @packageDocumentation
 * Exception type thrown by {@link RDParser} and all subclasses on parse failure.
 */

/**
 * Thrown when a parser encounters input that does not match the expected grammar.
 * Carries the error message and byte position at which the failure occurred.
 */
export class RDParserException extends Error {
  /**
   * @param msg - Human-readable description of the parse failure, including position information.
   */
  constructor(msg: string) {
    super(msg)
    this.name = 'RDParserException'
  }
}
