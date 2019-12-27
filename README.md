[![Synor Database](https://img.shields.io/badge/synor-database-blue?style=for-the-badge)](https://github.com/Synor)
[![Version](https://img.shields.io/npm/v/@synor/database-postgresql?style=for-the-badge)](https://npmjs.org/package/@synor/database-postgresql)
[![Test](https://img.shields.io/travis/com/Synor/database-postgresql/master?label=Test&style=for-the-badge)](https://travis-ci.com/Synor/database-postgresql)
[![Coverage](https://img.shields.io/codecov/c/gh/Synor/database-postgresql/master?style=for-the-badge)](https://codecov.io/gh/Synor/database-postgresql)
[![License](https://img.shields.io/github/license/Synor/database-postgresql?style=for-the-badge)](https://github.com/Synor/database-postgresql/blob/master/LICENSE)

# Synor Database PostgreSQL

Synor Database Engine - PostgreSQL

## Installation

```sh
# using yarn:
yarn add @synor/database-postgresql

# using npm:
npm install --save @synor/database-postgresql
```

## URI

**Format**: `postgresql://[user[:password]@][hostname][:port][/dbname][?param1=value1&...]`

**Params**:

| Name                           | Description                     | Default Value            |
| ------------------------------ | ------------------------------- | ------------------------ |
| `synor_migration_record_table` | Name for Migration Record Table | `synor_migration_record` |

**Examples**:

- `postgresql://postgres:postgres@127.0.0.1:5432/synor?synor_migration_record_table=migration_record`

## License

Licensed under the MIT License. Check the [LICENSE](./LICENSE) file for details.
