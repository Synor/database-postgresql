import fs from 'fs'
import { getConfig } from './get-config'

describe('utils:getConfig', () => {
  let uri: Parameters<typeof getConfig>[0]

  beforeEach(() => {
    uri = 'postgresql://postgres:postgres@127.0.0.1:5432/synor'
  })

  test('accepts postgresql uri', () => {
    expect(getConfig(uri)).toMatchSnapshot()
  })

  test.each(['postgres:', 'mysql:'])(
    `throws if uri protocol is not 'postgresql:'`,
    protocol => {
      uri = uri.replace('postgresql:', protocol)
      expect(() => getConfig(uri)).toThrow()
    }
  )

  test('throws if protocol is missing', () => {
    uri = uri.replace('postgresql:', '')
    expect(() => getConfig(uri)).toThrow()
  })

  test('throws if database is missing', () => {
    uri = uri.replace('/synor', '')
    expect(() => getConfig(uri)).toThrow()
  })

  test('throws if uri is malformed', () => {
    uri = 'postgresql://@ _ @/synor'
    expect(() => getConfig(uri)).toThrow()
  })

  test('accepts custom migration record table name', () => {
    const tableName = 'migration_history'
    uri = `${uri}?synor_migration_record_table=${tableName}`
    expect(getConfig(uri)[1].migrationRecordTable).toBe(tableName)
  })

  test('accepts schema name', () => {
    const schemaName = 'jest'
    uri = `${uri}?schema=${schemaName}`
    expect(getConfig(uri)[1].schema).toBe(schemaName)
  })

  describe('ssl config', () => {
    beforeEach(() => {
      uri = 'postgresql://postgres:postgres@127.0.0.1:5432/synor'
    })

    test('defaults to false', () => {
      expect(getConfig(uri)[0].ssl).toBe(false)
    })

    test.each([false, true])('accepts boolean: %s', ssl => {
      uri = `${uri}?ssl=${JSON.stringify(ssl)}`
      expect(getConfig(uri)[0].ssl).toBe(ssl)
    })

    test('accepts uri encoded stringified json', () => {
      const ssl = { rejectUnauthorized: false }
      uri = `${uri}?ssl=${encodeURIComponent(JSON.stringify(ssl))}`
      expect(getConfig(uri)[0].ssl).toMatchObject(ssl)
    })

    test.each([
      ['ca', 'CA'],
      ['cert', 'CERT'],
      ['key', 'KEY']
    ])(`reads ssl.%s file content`, (key, content) => {
      jest
        .spyOn(fs, 'readFileSync')
        .mockImplementationOnce((v: any) => Buffer.from(`CONTENT:${v}`))

      const ssl = { [key]: content }
      uri = `${uri}?ssl=${encodeURIComponent(JSON.stringify(ssl))}`
      expect(
        ((getConfig(uri)[0].ssl as any)[key] as Buffer).toString()
      ).toMatch(new RegExp(`CONTENT:.+${content}`))
    })
  })
})
