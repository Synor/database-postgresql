import { SynorError } from '@synor/core'
import { ConnectionString } from 'connection-string'
import { readFileSync } from 'fs'
import { resolve as resolvePath } from 'path'

type ConnectionConfig = import('pg').ConnectionConfig
type TLSConnectionOptions = import('tls').ConnectionOptions

type SSLConfig = Pick<
  TLSConnectionOptions,
  'passphrase' | 'rejectUnauthorized' | 'secureOptions' | 'ca' | 'key' | 'cert'
>

type SSLParams = Pick<
  SSLConfig,
  'passphrase' | 'rejectUnauthorized' | 'secureOptions'
> & {
  ca?: string
  key?: string
  cert?: string
}

type PostgreSQLDatabaseConfig = Required<Pick<ConnectionConfig, 'database'>> &
  Pick<ConnectionConfig, 'host' | 'port' | 'user' | 'password' | 'ssl'> & {
    application_name?: string
  }

type PostgreSQLEngineConfig = {
  migrationRecordTable: string
  schema: string
}

export function getConfig(
  uri: string
): [PostgreSQLDatabaseConfig, PostgreSQLEngineConfig] {
  try {
    const {
      protocol,
      hostname: host,
      port,
      user,
      password,
      path,
      params
    } = new ConnectionString(uri, {
      params: {
        application_name: '@synor/database-postgresql',
        schema: 'public',
        synor_migration_record_table: 'synor_migration_record'
      }
    })

    if (!protocol) {
      throw new Error(`[URI] missing: protocol!`)
    }

    if (protocol !== 'postgresql') {
      throw new Error(`[URI] unsupported: protocol(${protocol})!`)
    }

    const database = path && path[0]

    if (!database) {
      throw new Error('[URI] missing: database!')
    }

    const sslParams: boolean | SSLParams = JSON.parse(params!.ssl || false)

    let ssl: boolean | SSLConfig

    if (typeof sslParams === 'boolean') {
      ssl = sslParams
    } else {
      ssl = {
        passphrase: sslParams.passphrase,
        rejectUnauthorized: sslParams.rejectUnauthorized,
        secureOptions: sslParams.secureOptions
      }

      if (sslParams.ca) {
        ssl.ca = readFileSync(resolvePath(sslParams.ca))
      }
      if (sslParams.cert) {
        ssl.cert = readFileSync(resolvePath(sslParams.cert))
      }
      if (sslParams.key) {
        ssl.key = readFileSync(resolvePath(sslParams.key))
      }
    }

    const databaseConfig: PostgreSQLDatabaseConfig = {
      database,
      host,
      port,
      user,
      password,
      ssl,
      application_name: params!.application_name
    }

    const engineConfig: PostgreSQLEngineConfig = {
      migrationRecordTable: params!.synor_migration_record_table,
      schema: params!.schema
    }

    return [databaseConfig, engineConfig]
  } catch (error) {
    throw new SynorError('Invalid DatabaseURI', error)
  }
}
