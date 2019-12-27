import { SynorError } from '@synor/core'
import { performance } from 'perf_hooks'
import { Client } from 'pg'
import { getQueryStore } from './queries'
import { ensureMigrationRecordTable } from './utils/ensure-migration-record-table'
import { getConfig } from './utils/get-config'

type DatabaseEngine = import('@synor/core').DatabaseEngine
type DatabaseEngineFactory = import('@synor/core').DatabaseEngineFactory
type MigrationSource = import('@synor/core').MigrationSource

export const PostgreSQLDatabaseEngine: DatabaseEngineFactory = (
  uri,
  { baseVersion, getAdvisoryLockId, getUserInfo }
): DatabaseEngine => {
  const [databaseConfig, engineConfig] = getConfig(uri)

  if (typeof getAdvisoryLockId !== 'function') {
    throw new SynorError(`Missing: getAdvisoryLockId`)
  }

  if (typeof getUserInfo !== 'function') {
    throw new SynorError(`Missing: getUserInfo`)
  }

  const advisoryLockIds = getAdvisoryLockId(
    databaseConfig.database,
    engineConfig.schema,
    engineConfig.migrationRecordTable
  )

  const client = new Client(databaseConfig)

  const queryStore = getQueryStore(client, {
    migrationRecordTable: engineConfig.migrationRecordTable,
    schemaName: engineConfig.schema,
    databaseName: databaseConfig.database,
    advisoryLockIds
  })

  let appliedBy = ''

  const open: DatabaseEngine['open'] = async () => {
    appliedBy = await getUserInfo()
    await queryStore.openConnection()
    await ensureMigrationRecordTable(queryStore, baseVersion)
  }

  const close: DatabaseEngine['close'] = async () => {
    await queryStore.closeConnection()
  }

  const lock: DatabaseEngine['lock'] = async () => {
    try {
      await queryStore.getLock()
    } catch (_) {
      throw new SynorError('Failed to Get Lock', {
        lockId: advisoryLockIds
      })
    }
  }

  const unlock: DatabaseEngine['unlock'] = async () => {
    const lockResult = await queryStore.releaseLock()
    if (!lockResult) {
      throw new SynorError('Failed to Release Lock', {
        lockId: advisoryLockIds
      })
    }
  }

  const drop: DatabaseEngine['drop'] = async () => {
    const tableNames = await queryStore.getTableNames()
    await queryStore.dropTables(tableNames)
  }

  const run: DatabaseEngine['run'] = async ({
    version,
    type,
    title,
    hash,
    body
  }: MigrationSource) => {
    let dirty = false

    const startTime = performance.now()

    try {
      await client.query(body)
    } catch (err) {
      dirty = true

      throw err
    } finally {
      const endTime = performance.now()

      await queryStore.addRecord({
        version,
        type,
        title,
        hash,
        appliedAt: new Date(),
        appliedBy,
        executionTime: endTime - startTime,
        dirty
      })
    }
  }

  const repair: DatabaseEngine['repair'] = async records => {
    await queryStore.deleteDirtyRecords()

    for (const { id, hash } of records) {
      await queryStore.updateRecord(id, { hash })
    }
  }

  const records: DatabaseEngine['records'] = async startId => {
    return queryStore.getRecords(startId)
  }

  return {
    open,
    close,
    lock,
    unlock,
    drop,
    run,
    repair,
    records
  }
}

export default PostgreSQLDatabaseEngine
