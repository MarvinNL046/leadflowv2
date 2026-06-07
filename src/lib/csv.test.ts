import { describe, it, expect } from 'vitest'
import { parseCsv } from './csv'

describe('parseCsv', () => {
  it('simpele rijen', () => {
    expect(parseCsv('a,b,c\n1,2,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ])
  })
  it('aangehaald veld met komma', () => {
    expect(parseCsv('"a,b",c')).toEqual([['a,b', 'c']])
  })
  it('escaped quote ("")', () => {
    expect(parseCsv('"a""b",c')).toEqual([['a"b', 'c']])
  })
  it('CRLF', () => {
    expect(parseCsv('a,b\r\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })
  it('embedded newline in quotes', () => {
    expect(parseCsv('"a\nb",c')).toEqual([['a\nb', 'c']])
  })
  it('lege regels overslaan', () => {
    expect(parseCsv('a,b\n\n1,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })
})
