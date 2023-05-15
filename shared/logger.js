const chalk = require('chalk')

const log = console.log

const logTypes = {
  INFO: 'INFO',
  SUCCESS: 'SUCCESS',
  WARN: 'WARN',
  ERROR: 'ERROR'
}

const logger = (type, ...msgArgs) => {
  const { INFO, SUCCESS, WARN, ERROR } = logTypes
  const timestamp = new Date().toISOString()
  switch (type) {
    case INFO:
      log(`${chalk.bold.cyan(INFO)}    [${timestamp}] ${msgArgs.join(' ')}`)
      break

    case SUCCESS:
      log(`${chalk.bold.green(SUCCESS)} [${timestamp}] ${msgArgs.join(' ')}`)
      break

    case WARN:
      log(`${chalk.bold.hex('#FFA500')(WARN)}    [${timestamp}] ${msgArgs.join(' ')}`)
      break

    case ERROR:
      log(`${chalk.bold.red(ERROR)}   [${timestamp}] ${msgArgs.join(' ')}`)
      break

    default:
      log(`${msgArgs.join(' ')}`)
  }
}

module.exports = { logTypes, logger }
