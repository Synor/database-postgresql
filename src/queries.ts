/* eslint-disable @typescript-eslint/camelcase */

type Client = import('pg').Client
type MigrationRecord = import('@synor/core').MigrationRecord

type ColumnName =
  | 'version'
  | 'type'
  | 'title'
  | 'hash'
  | 'applied_at'
  | 'applied_by'
  | 'execution_time'
  | 'dirty'

type LockResult = boolean | undefined

export type QueryStore = {
  openConnection: () => Promise<void>
  closeConnection: () => Promise<void>

  getMigrationTableColumnNames: () => Promise<string[]>
  createMigrationTable: () => Promise<void>
  addColumn: Record<ColumnName, () => Promise<void>>

  getLock: () => Promise<LockResult>
  releaseLock: () => Promise<LockResult>

  getTableNames: () => Promise<string[]>
  dropTables: (tableNames: string[]) => Promise<void>

  getRecords: (startId?: number) => Promise<MigrationRecord[]>

  addRecord: (record: Omit<MigrationRecord, 'id'>) => Promise<void>
  deleteDirtyRecords: () => Promise<void>
  updateRecord: (
    id: MigrationRecord['id'],
    data: Pick<MigrationRecord, 'hash'>
  ) => Promise<void>
}

type QueryStoreOptions = {
  migrationRecordTable: string
  schemaName: string
  databaseName: string
  advisoryLockIds: [string, string]
}

type QueryValue = boolean | number | string | Date

export function getQueryStore(
  client: Client,
  {
    migrationRecordTable: tableName,
    schemaName,
    databaseName,
    advisoryLockIds
  }: QueryStoreOptions
): QueryStore {
  const openConnection = async (): Promise<void> => {
    await client.connect()
    await client.query(`SET SCHEMA '${schemaName}';`)
  }

  const closeConnection = (): Promise<void> => client.end()

  const QueryRunner = <RawResult = any, Result = RawResult>(
    query: string,
    values: QueryValue[],
    formatter: (rows: RawResult[]) => Result = v => (v as unknown) as Result
  ) => (): Promise<Result> => {
    return client
      .query<RawResult>(query.replace(/\s+/, ' ').trim(), values)
      .then(result => result.rows)
      .then(formatter)
  }

  const getMigrationTableColumnNames = QueryRunner<
    { column_name: string },
    string[]
  >(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_catalog = $1
        AND table_schema = $2
        AND table_name = $3;
    `,
    [databaseName, schemaName, tableName],
    rows => rows.map(({ column_name }) => column_name)
  )

  const createMigrationTable = QueryRunner(
    `
      CREATE TABLE ${tableName} (
        id SERIAL NOT NULL,
        CONSTRAINT ${schemaName}_${tableName}_pk PRIMARY KEY (id)
      );
    `,
    []
  )

  const addColumn = {
    version: QueryRunner(
      `
        ALTER TABLE ${tableName}
          ADD COLUMN version VARCHAR(128) NOT NULL;
      `,
      []
    ),
    type: QueryRunner(
      `
        ALTER TABLE ${tableName}
          ADD COLUMN type VARCHAR(16);
      `,
      []
    ),
    title: QueryRunner(
      `
        ALTER TABLE ${tableName}
          ADD COLUMN title TEXT;
      `,
      []
    ),
    hash: QueryRunner(
      `
        ALTER TABLE ${tableName}
          ADD COLUMN hash TEXT;
      `,
      []
    ),

    applied_at: QueryRunner(
      `
        ALTER TABLE ${tableName}
          ADD COLUMN applied_at TIMESTAMPTZ DEFAULT NOW();
      `,
      []
    ),
    applied_by: QueryRunner(
      `
        ALTER TABLE ${tableName}
          ADD COLUMN applied_by VARCHAR(255);
      `,
      []
    ),
    execution_time: QueryRunner(
      `
        ALTER TABLE ${tableName}
          ADD COLUMN execution_time INT;
      `,
      []
    ),
    dirty: QueryRunner(
      `
        ALTER TABLE ${tableName}
          ADD COLUMN dirty BOOLEAN DEFAULT false;
      `,
      []
    )
  }

  const getLock = QueryRunner<{ synor_lock: LockResult }, LockResult>(
    `
      SELECT pg_advisory_lock($1, $2) AS synor_lock;
    `,
    [...advisoryLockIds],
    ([{ synor_lock }]) => synor_lock
  )

  const releaseLock = QueryRunner<{ synor_lock: LockResult }, LockResult>(
    `
      SELECT pg_advisory_unlock($1, $2) AS synor_lock;
    `,
    [...advisoryLockIds],
    ([{ synor_lock }]) => synor_lock
  )

  const getTableNames = QueryRunner<{ table_name: string }, string[]>(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_catalog = $1
        AND table_schema = $2;
    `,
    [databaseName, schemaName],
    rows => rows.map(({ table_name }) => table_name)
  )

  const dropTables: QueryStore['dropTables'] = tableNames => {
    return QueryRunner(
      tableNames
        .map(tableName => `DROP TABLE IF EXISTS ${tableName} CASCADE;`)
        .join('\n'),
      []
    )()
  }

  const getRecords: QueryStore['getRecords'] = (startId = 0) => {
    return QueryRunner<MigrationRecord, MigrationRecord[]>(
      `
        SELECT
          id, version, type, title, hash,
          applied_at AS appliedAt,
          applied_by AS appliedBy,
          execution_time AS executionTime,
          dirty
        FROM ${tableName}
        WHERE id >= $1;
      `,
      [startId]
    )()
  }

  const addRecord: QueryStore['addRecord'] = ({
    version,
    type,
    title,
    hash,
    appliedAt,
    appliedBy,
    executionTime,
    dirty
  }) => {
    return QueryRunner(
      `
        INSERT INTO ${tableName} (
          version, type, title, hash, applied_at, applied_by, execution_time, dirty
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8
        );
      `,
      [version, type, title, hash, appliedAt, appliedBy, executionTime, dirty]
    )()
  }

  const deleteDirtyRecords = QueryRunner(
    `
      DELETE FROM ${tableName} WHERE dirty = true;
    `,
    []
  )

  const updateRecord: QueryStore['updateRecord'] = async (id, { hash }) => {
    return QueryRunner(
      `
        UPDATE ${tableName} SET hash = $1
          WHERE id = $2;
      `,
      [hash, id]
    )()
  }

  return {
    openConnection,
    closeConnection,

    getMigrationTableColumnNames,
    createMigrationTable,
    addColumn,

    getLock,
    releaseLock,

    getTableNames,
    dropTables,

    getRecords,

    addRecord,
    deleteDirtyRecords,
    updateRecord
  }
}
