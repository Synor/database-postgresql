import { Client } from 'pg'
import PostgreSQLEngine, { PostgreSQLDatabaseEngine } from './index'
import { getConfig } from './utils/get-config'

type GetAdvisoryLockId = import('@synor/core').GetAdvisoryLockId
type GetUserInfo = import('@synor/core').GetUserInfo
type MigrationSource = import('@synor/core').MigrationSource

jest.setTimeout(10 * 1000)

jest.mock('perf_hooks')

const getTableColumnCount = async (
  client: Client,
  schemaName: string,
  tableName: string,
  databaseName: string
): Promise<number> => {
  return client
    .query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_catalog = $1 AND table_schema = $2 AND table_name = $3;`,
      [databaseName, schemaName, tableName]
    )
    .then(result => result.rows.length)
}

const migrationSource: Record<
  '01.do' | '01.undo' | '02.do',
  MigrationSource
> = {
  '01.do': {
    version: '01',
    type: 'do',
    title: 'Test One',
    body: 'SELECT 1;',
    hash: 'hash-01-do'
  },
  '01.undo': {
    version: '01',
    type: 'undo',
    title: 'Test One',
    body: 'SELEC -1;',
    hash: 'hash-01-undo'
  },
  '02.do': {
    version: '02',
    type: 'do',
    title: 'Test Two',
    hash: 'hash-02-do',
    run: (client: Client) => {
      return client.query(`SELECT 2;`)
    }
  }
}

const baseVersion = '0'
const getAdvisoryLockId: GetAdvisoryLockId = (databaseName, ...names) => {
  return [String(databaseName.length), String(names.join().length)]
}
const getUserInfo: GetUserInfo = () => Promise.resolve(`Jest`)

const databaseName = 'synor'
const schemaName = 'public'
const tableName = 'test_record'
const params = `synor_migration_record_table=${tableName}&schema=${schemaName}`
const uri = `postgresql://postgres:postgres@127.0.0.1:5432/${databaseName}?${params}`

describe('module exports', () => {
  test('default export exists', () => {
    expect(typeof PostgreSQLEngine).toBe('function')
  })

  test('named export exists', () => {
    expect(typeof PostgreSQLDatabaseEngine).toBe('function')
  })

  test('default and named exports are same', () => {
    expect(PostgreSQLEngine).toBe(PostgreSQLDatabaseEngine)
  })
})

describe('initialization', () => {
  let dbUri: Parameters<typeof PostgreSQLDatabaseEngine>[0]
  const helpers: Parameters<typeof PostgreSQLDatabaseEngine>[1] = {
    baseVersion,
    getAdvisoryLockId,
    getUserInfo
  }

  beforeEach(() => {
    dbUri = uri
    helpers.baseVersion = baseVersion
    helpers.getAdvisoryLockId = getAdvisoryLockId
    helpers.getUserInfo = getUserInfo
  })

  test.each([undefined, null, 0])('throws if uri is %s', uri => {
    expect(() => PostgreSQLDatabaseEngine(uri as any, helpers)).toThrow()
  })

  test('throws if uri is empty', () => {
    dbUri = ' '
    expect(() => PostgreSQLDatabaseEngine(dbUri, helpers)).toThrow()
  })

  describe('helpers validation', () => {
    beforeEach(() => {
      helpers.getAdvisoryLockId = getAdvisoryLockId
      helpers.getUserInfo = getUserInfo
    })

    test(`throws if getAdvisoryLockId is missing`, () => {
      delete helpers.getAdvisoryLockId
      expect(() => PostgreSQLDatabaseEngine(dbUri, helpers)).toThrow()
    })

    test(`throws if getAdvisoryLockId is not function`, () => {
      helpers.getAdvisoryLockId = '' as any
      expect(() => PostgreSQLDatabaseEngine(dbUri, helpers)).toThrow()
      helpers.getAdvisoryLockId = null as any
      expect(() => PostgreSQLDatabaseEngine(dbUri, helpers)).toThrow()
    })

    test(`throws if getUserInfo is missing`, () => {
      delete helpers.getUserInfo
      expect(() => PostgreSQLDatabaseEngine(dbUri, helpers)).toThrow()
    })

    test(`throws if getUserInfo is not function`, () => {
      helpers.getUserInfo = '' as any
      expect(() => PostgreSQLDatabaseEngine(dbUri, helpers)).toThrow()
      helpers.getUserInfo = null as any
      expect(() => PostgreSQLDatabaseEngine(dbUri, helpers)).toThrow()
    })
  })
})

describe('methods: {open,close}', () => {
  let client: Client

  let engine: ReturnType<typeof PostgreSQLDatabaseEngine>

  beforeAll(async () => {
    client = new Client(getConfig(uri)[0])

    await client.connect()

    await client.query(`DROP TABLE IF EXISTS ${schemaName}.${tableName};`)
  })

  afterAll(async () => {
    await client.end()
  })

  beforeEach(() => {
    engine = PostgreSQLDatabaseEngine(uri, {
      baseVersion,
      getAdvisoryLockId,
      getUserInfo
    })
  })

  let recordColumnCount: number

  test('can open & close (first run)', async () => {
    recordColumnCount = await getTableColumnCount(
      client,
      schemaName,
      tableName,
      databaseName
    )

    expect(recordColumnCount).toBe(0)

    await expect(engine.open()).resolves.toBeUndefined()

    recordColumnCount = await getTableColumnCount(
      client,
      schemaName,
      tableName,
      databaseName
    )

    expect(recordColumnCount).toBeGreaterThan(0)

    await expect(engine.close()).resolves.toBeUndefined()
  })

  test('can open & close (after first run)', async () => {
    await expect(
      getTableColumnCount(client, schemaName, tableName, databaseName)
    ).resolves.toBe(recordColumnCount)

    await expect(engine.open()).resolves.toBeUndefined()

    await expect(
      getTableColumnCount(client, schemaName, tableName, databaseName)
    ).resolves.toBe(recordColumnCount)

    await expect(engine.close()).resolves.toBeUndefined()
  })
})

describe('methods: {lock,unlock}', () => {
  test('can lock & unlock', async () => {
    const engine = PostgreSQLDatabaseEngine(uri, {
      baseVersion,
      getAdvisoryLockId,
      getUserInfo
    })

    await engine.open()

    await expect(engine.lock()).resolves.toBeUndefined()

    await expect(engine.unlock()).resolves.toBeUndefined()

    await engine.close()
  })

  test.skip('can not get multiple lock at once', async () => {
    const engineOne = PostgreSQLDatabaseEngine(uri, {
      baseVersion,
      getAdvisoryLockId,
      getUserInfo
    })

    const engineTwo = PostgreSQLDatabaseEngine(uri, {
      baseVersion,
      getAdvisoryLockId,
      getUserInfo
    })

    const callOrder: Array<'lock-1' | 'unlock-1' | 'lock-2' | 'unlock-2'> = []

    await Promise.all([engineOne.open(), engineTwo.open()])

    await engineOne.lock().then(() => {
      callOrder.push('lock-1')
    })

    await Promise.all([
      engineTwo.lock().then(() => {
        callOrder.push('lock-2')
      }),
      engineOne.unlock().then(() => {
        callOrder.push('unlock-1')
      })
    ])

    await engineTwo.unlock().then(() => {
      callOrder.push('unlock-2')
    })

    expect(callOrder).toEqual(['lock-1', 'unlock-1', 'lock-2', 'unlock-2'])

    await Promise.all([engineOne.close(), engineTwo.close()])
  })

  test('lock throws if failed to get', async () => {
    const queries = jest.requireActual('./queries')

    jest.spyOn(queries, 'getQueryStore').mockImplementationOnce((...args) => {
      const queryStore = queries.getQueryStore(...args)
      queryStore.getLock = () => Promise.reject(new Error())
      return queryStore
    })

    const engine = PostgreSQLDatabaseEngine(uri, {
      baseVersion,
      getAdvisoryLockId,
      getUserInfo
    })

    await engine.open()

    await expect(engine.lock()).rejects.toThrow()

    await engine.close()
  })

  test('unlock throws if not locked', async () => {
    const engine = PostgreSQLDatabaseEngine(uri, {
      baseVersion,
      getAdvisoryLockId,
      getUserInfo
    })

    await engine.open()

    await expect(engine.unlock()).rejects.toThrow()

    await engine.close()
  })
})

describe('methods', () => {
  let client: Client

  let engine: ReturnType<typeof PostgreSQLDatabaseEngine>

  const OriginalDate = Date

  beforeAll(async () => {
    global.Date = class extends OriginalDate {
      constructor() {
        super('2020-01-01T00:00:00.000Z')
      }
    } as typeof global.Date

    client = new Client(getConfig(uri)[0])

    await client.connect()

    await client.query(`DROP TABLE IF EXISTS ${schemaName}.${tableName};`)
  })

  afterAll(async () => {
    await client.end()

    global.Date = OriginalDate
  })

  beforeEach(async () => {
    engine = PostgreSQLDatabaseEngine(uri, {
      baseVersion,
      getAdvisoryLockId,
      getUserInfo
    })

    await engine.open()
  })

  afterEach(async () => {
    await engine.close()
  })

  test('drop', async () => {
    await expect(
      getTableColumnCount(client, schemaName, tableName, databaseName)
    ).resolves.toBeGreaterThan(0)
    await expect(engine.drop()).resolves.toBeUndefined()
    await expect(
      getTableColumnCount(client, schemaName, tableName, databaseName)
    ).resolves.toBe(0)
  })

  test('run (with body)', async () => {
    await expect(engine.run(migrationSource['01.do'])).resolves.toBeUndefined()
    await expect(engine.run(migrationSource['01.undo'])).rejects.toThrow()

    const { rows } = await client.query(
      `SELECT * FROM ${schemaName}.${tableName};`
    )
    expect(rows).toMatchSnapshot()

    await engine.drop()
  })

  test('run (with run)', async () => {
    await expect(engine.run(migrationSource['02.do'])).resolves.toBeUndefined()

    const { rows } = await client.query(
      `SELECT * FROM ${schemaName}.${tableName};`
    )
    expect(rows).toMatchSnapshot()

    await engine.drop()
  })

  test('repair', async () => {
    await expect(engine.run(migrationSource['01.do'])).resolves.toBeUndefined()
    await expect(engine.run(migrationSource['01.undo'])).rejects.toThrow()

    const {
      rows: [record]
    } = await client.query<any>(
      `SELECT id FROM ${schemaName}.${tableName} WHERE version = $1 AND type = $2;`,
      [migrationSource['01.do'].version, migrationSource['01.do'].type]
    )

    await expect(
      engine.repair([
        { id: record.id, hash: `${migrationSource['01.do'].hash}-repaired` }
      ])
    ).resolves.toBeUndefined()

    const { rows } = await client.query(
      `SELECT * FROM ${schemaName}.${tableName};`
    )
    expect(rows).toMatchSnapshot()

    await engine.drop()
  })

  test('records', async () => {
    await expect(engine.run(migrationSource['01.do'])).resolves.toBeUndefined()
    await expect(engine.run(migrationSource['01.undo'])).rejects.toThrow()

    await expect(engine.records()).resolves.toMatchSnapshot()

    await engine.drop()
  })
})
