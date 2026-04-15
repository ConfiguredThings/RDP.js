import { RDParserException } from '../exception.js'

describe('RDParserException', () => {
  it('is an instance of Error', () => {
    const e = new RDParserException('something went wrong')
    expect(e).toBeInstanceOf(Error)
  })

  it('is an instance of RDParserException', () => {
    const e = new RDParserException('something went wrong')
    expect(e).toBeInstanceOf(RDParserException)
  })

  it('sets the message', () => {
    const e = new RDParserException('parse failed at position 5')
    expect(e.message).toBe('parse failed at position 5')
  })

  it('sets the name to RDParserException', () => {
    const e = new RDParserException('oops')
    expect(e.name).toBe('RDParserException')
  })
})
