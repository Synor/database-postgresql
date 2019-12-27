const NodeEnvironment = require('jest-environment-node')
const { execSync } = require('child_process')

const uri = 'postgresql://postgres:postgres@127.0.0.1:5432/synor'

const sleep = async ms => new Promise(resolve => setTimeout(resolve, ms))

const pingPostgreSQL = () => {
  execSync(`pg_isready -d ${uri} -q`, { stdio: 'ignore' })
}

async function waitForPostgreSQL() {
  try {
    pingPostgreSQL()
  } catch (_) {
    console.log(_)
    await sleep(1000)
    return waitForPostgreSQL()
  }
}

class SynorDatabasePostgreSQLTestEnvironment extends NodeEnvironment {
  constructor(config, context) {
    super(config, context)
    this.docblockPragmas = context.docblockPragmas
  }

  async setup() {
    await super.setup()
    await waitForPostgreSQL()
  }

  async teardown() {
    await super.teardown()
  }

  runScript(script) {
    return super.runScript(script)
  }
}

module.exports = SynorDatabasePostgreSQLTestEnvironment
