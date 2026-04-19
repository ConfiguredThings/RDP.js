import { toJSONAST, fromJSONAST, type JSONAST } from '../json-ast.js'

describe('toJSONAST', () => {
  it('converts a JSON string value', () => {
    expect(toJSONAST('"hello"')).toEqual({ kind: 'string', value: 'hello' })
  })

  it('converts a JSON number', () => {
    expect(toJSONAST('42')).toEqual({ kind: 'number', value: 42 })
  })

  it('converts a JSON boolean', () => {
    expect(toJSONAST('true')).toEqual({ kind: 'boolean', value: true })
    expect(toJSONAST('false')).toEqual({ kind: 'boolean', value: false })
  })

  it('converts JSON null', () => {
    expect(toJSONAST('null')).toEqual({ kind: 'null' })
  })

  it('converts a JSON array', () => {
    expect(toJSONAST('[1, "two"]')).toEqual({
      kind: 'array',
      items: [
        { kind: 'number', value: 1 },
        { kind: 'string', value: 'two' },
      ],
    })
  })

  it('converts a JSON object', () => {
    expect(toJSONAST('{"a":1,"b":true}')).toEqual({
      kind: 'object',
      entries: [
        { key: 'a', value: { kind: 'number', value: 1 } },
        { key: 'b', value: { kind: 'boolean', value: true } },
      ],
    })
  })

  it('converts nested structures', () => {
    expect(toJSONAST('{"items":[1,null]}')).toEqual({
      kind: 'object',
      entries: [
        {
          key: 'items',
          value: {
            kind: 'array',
            items: [{ kind: 'number', value: 1 }, { kind: 'null' }],
          },
        },
      ],
    })
  })

  it('throws SyntaxError on invalid JSON', () => {
    expect(() => toJSONAST('{')).toThrow(SyntaxError)
  })
})

describe('fromJSONAST', () => {
  it('serialises a string node', () => {
    const ast: JSONAST = { kind: 'string', value: 'hello' }
    expect(fromJSONAST(ast)).toBe('"hello"')
  })

  it('serialises a number node', () => {
    expect(fromJSONAST({ kind: 'number', value: 42 })).toBe('42')
  })

  it('serialises a boolean node', () => {
    expect(fromJSONAST({ kind: 'boolean', value: true })).toBe('true')
  })

  it('serialises a null node', () => {
    expect(fromJSONAST({ kind: 'null' })).toBe('null')
  })

  it('serialises an array node', () => {
    const ast: JSONAST = {
      kind: 'array',
      items: [
        { kind: 'number', value: 1 },
        { kind: 'string', value: 'two' },
      ],
    }
    expect(fromJSONAST(ast)).toBe('[1,"two"]')
  })

  it('serialises an object node', () => {
    const ast: JSONAST = {
      kind: 'object',
      entries: [
        { key: 'a', value: { kind: 'number', value: 1 } },
        { key: 'b', value: { kind: 'boolean', value: false } },
      ],
    }
    expect(fromJSONAST(ast)).toBe('{"a":1,"b":false}')
  })
})

describe('toJSONAST / fromJSONAST round-trip', () => {
  const cases = [
    '"hello"',
    '42',
    'true',
    'false',
    'null',
    '[1,2,3]',
    '{"a":1,"b":[2,3]}',
    '[{"x":null},true]',
  ]

  for (const json of cases) {
    it(`round-trips ${json}`, () => {
      expect(fromJSONAST(toJSONAST(json))).toBe(json)
    })
  }
})
