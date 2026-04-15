import { RDParser } from '../rdparser.js'
import { RDParserException } from '../exception.js'

function makeParser(input: string): ConcreteParser {
  const bytes = new TextEncoder().encode(input)
  return new ConcreteParser(new DataView(bytes.buffer))
}

// Minimal concrete subclass that exposes all protected methods for testing
class ConcreteParser extends RDParser {
  public override peek(): number | null {
    return super.peek()
  }
  public override advance(): void {
    super.advance()
  }
  public override consume(): number {
    return super.consume()
  }
  public override atEnd(): boolean {
    return super.atEnd()
  }
  public override matchChar(c: number): boolean {
    return super.matchChar(c)
  }
  public override readChar(c: number): string | null {
    return super.readChar(c)
  }
  public override readCharRange(lo: number, hi: number): string | null {
    return super.readCharRange(lo, hi)
  }
  public override expectChar(c: number, desc?: string): void {
    super.expectChar(c, desc)
  }
  public override captureSlice(from: number, to: number): DataView {
    return super.captureSlice(from, to)
  }
  public override error(msg: string): never {
    return super.error(msg)
  }
  public override getPosition(): number {
    return super.getPosition()
  }
  public override getFurthestFailPosition(): number {
    return super.getFurthestFailPosition()
  }
  public override errorAtFurthest(): never {
    return super.errorAtFurthest()
  }
  public override restorePosition(pos: number): void {
    super.restorePosition(pos)
  }
}

describe('RDParser', () => {
  describe('peek()', () => {
    it('returns the first byte of input', () => {
      expect(makeParser('A').peek()).toBe(0x41)
    })

    it('returns null on empty input', () => {
      expect(makeParser('').peek()).toBeNull()
    })

    it('does not advance position', () => {
      const p = makeParser('AB')
      p.peek()
      expect(p.getPosition()).toBe(0)
    })
  })

  describe('advance()', () => {
    it('moves position forward by one', () => {
      const p = makeParser('AB')
      p.advance()
      expect(p.getPosition()).toBe(1)
    })

    it('does not advance past end of input', () => {
      const p = makeParser('A')
      p.advance()
      p.advance()
      expect(p.getPosition()).toBe(1)
    })
  })

  describe('consume()', () => {
    it('returns the current byte and advances', () => {
      const p = makeParser('AB')
      expect(p.consume()).toBe(0x41)
      expect(p.getPosition()).toBe(1)
    })

    it('throws at end of input', () => {
      expect(() => makeParser('').consume()).toThrow(RDParserException)
    })
  })

  describe('atEnd()', () => {
    it('returns false when there is remaining input', () => {
      expect(makeParser('A').atEnd()).toBe(false)
    })

    it('returns true on empty input', () => {
      expect(makeParser('').atEnd()).toBe(true)
    })

    it('returns true after consuming all input', () => {
      const p = makeParser('A')
      p.advance()
      expect(p.atEnd()).toBe(true)
    })
  })

  describe('matchChar()', () => {
    it('consumes and returns true when byte matches', () => {
      const p = makeParser('A')
      expect(p.matchChar(0x41)).toBe(true)
      expect(p.atEnd()).toBe(true)
    })

    it('does not consume and returns false when byte does not match', () => {
      const p = makeParser('A')
      expect(p.matchChar(0x42)).toBe(false)
      expect(p.getPosition()).toBe(0)
    })
  })

  describe('readChar()', () => {
    it('returns the character as a string when byte matches', () => {
      expect(makeParser('A').readChar(0x41)).toBe('A')
    })

    it('advances position on a successful match', () => {
      const p = makeParser('A')
      p.readChar(0x41)
      expect(p.getPosition()).toBe(1)
    })

    it('returns null when byte does not match', () => {
      expect(makeParser('A').readChar(0x42)).toBeNull()
    })

    it('does not advance position on a failed match', () => {
      const p = makeParser('A')
      p.readChar(0x42)
      expect(p.getPosition()).toBe(0)
    })

    it('returns null at end of input', () => {
      expect(makeParser('').readChar(0x41)).toBeNull()
    })
  })

  describe('readCharRange()', () => {
    it('returns the character as a string when byte is within range', () => {
      expect(makeParser('M').readCharRange(0x41, 0x5a)).toBe('M')
    })

    it('advances position on a successful match', () => {
      const p = makeParser('A')
      p.readCharRange(0x41, 0x5a)
      expect(p.getPosition()).toBe(1)
    })

    it('returns null when byte is below the range', () => {
      expect(makeParser('A').readCharRange(0x42, 0x5a)).toBeNull()
    })

    it('returns null when byte is above the range', () => {
      expect(makeParser('Z').readCharRange(0x41, 0x58)).toBeNull()
    })

    it('returns null at end of input', () => {
      expect(makeParser('').readCharRange(0x41, 0x5a)).toBeNull()
    })

    it('does not advance position on a failed match', () => {
      const p = makeParser('A')
      p.readCharRange(0x42, 0x5a)
      expect(p.getPosition()).toBe(0)
    })

    it('updates furthestFailPosition when failing beyond the current furthest', () => {
      const p = makeParser('AB')
      p.advance() // position = 1
      p.readCharRange(0x43, 0x5a) // 'B' = 0x42 < 0x43, fails at position 1; 1 > 0 → updates furthest
      expect(p.getFurthestFailPosition()).toBe(1)
    })
  })

  describe('expectChar()', () => {
    it('consumes the byte when it matches', () => {
      const p = makeParser('A')
      p.expectChar(0x41)
      expect(p.atEnd()).toBe(true)
    })

    it('throws when byte does not match', () => {
      expect(() => makeParser('A').expectChar(0x42)).toThrow(RDParserException)
    })

    it('includes the description in the error message when provided', () => {
      expect(() => makeParser('A').expectChar(0x42, "'B'")).toThrow("'B'")
    })

    it('includes "end of input" in the error message when at end of input', () => {
      expect(() => makeParser('').expectChar(0x41)).toThrow('end of input')
    })
  })

  describe('captureSlice()', () => {
    it('returns a DataView over the specified byte range', () => {
      const p = makeParser('ABCD')
      const slice = p.captureSlice(1, 3)
      expect(slice.byteLength).toBe(2)
      expect(slice.getUint8(0)).toBe(0x42) // B
      expect(slice.getUint8(1)).toBe(0x43) // C
    })
  })

  describe('error()', () => {
    it('throws RDParserException', () => {
      expect(() => makeParser('').error('oops')).toThrow(RDParserException)
    })

    it('includes the message and position in the exception', () => {
      const p = makeParser('AB')
      p.advance()
      expect(() => p.error('bad input')).toThrow('bad input')
      expect(() => p.error('bad input')).toThrow('position 1')
    })
  })

  describe('getPosition()', () => {
    it('starts at 0', () => {
      expect(makeParser('hello').getPosition()).toBe(0)
    })

    it('advances with consume', () => {
      const p = makeParser('hello')
      p.consume()
      p.consume()
      expect(p.getPosition()).toBe(2)
    })
  })

  describe('getFurthestFailPosition()', () => {
    it('starts at 0', () => {
      expect(makeParser('hello').getFurthestFailPosition()).toBe(0)
    })

    it('updates when a match fails at a position beyond the current furthest', () => {
      const p = makeParser('AB')
      p.advance() // position = 1
      p.matchChar(0x43) // fails at position 1; 1 > 0 so furthest is updated
      expect(p.getFurthestFailPosition()).toBe(1)
    })

    it('does not decrease when a later match fails closer to the start', () => {
      const p = makeParser('ABC')
      p.advance()
      p.advance() // position = 2
      p.matchChar(0x58) // fails at position 2; furthest = 2
      p.restorePosition(0)
      p.matchChar(0x58) // fails at position 0; 0 > 2 is false, furthest stays 2
      expect(p.getFurthestFailPosition()).toBe(2)
    })
  })

  describe('errorAtFurthest()', () => {
    it('throws RDParserException naming the byte at the furthest position', () => {
      const p = makeParser('AB')
      p.advance() // position = 1
      p.matchChar(0x43) // fails at position 1; furthest = 1; byte at 1 = 'B'
      expect(() => p.errorAtFurthest()).toThrow(RDParserException)
      expect(() => p.errorAtFurthest()).toThrow("'B'")
    })

    it('throws naming end of input when furthest position is at end', () => {
      const p = makeParser('A')
      p.advance() // position = 1 = byteLength
      p.readChar(0x42) // fails at end; furthest = 1
      expect(() => p.errorAtFurthest()).toThrow('end of input')
    })
  })

  describe('restorePosition()', () => {
    it('resets the current position to a previously saved value', () => {
      const p = makeParser('ABCD')
      p.advance()
      p.advance()
      expect(p.getPosition()).toBe(2)
      p.restorePosition(0)
      expect(p.getPosition()).toBe(0)
    })

    it('allows re-reading bytes after backtracking', () => {
      const p = makeParser('AB')
      p.advance()
      p.restorePosition(0)
      expect(p.peek()).toBe(0x41) // back to 'A'
    })
  })
})
