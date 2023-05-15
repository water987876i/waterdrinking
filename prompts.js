'use strict'
const inquirer = require('inquirer')
const ethers = require('ethers')
const { formatWalletsInfo } = require('./helpers')
const { BUY_BY_ETH_VALUE, BUY_BY_EXACT_TOKENS } = require('./shared/consts')

const paramsQuestions = (wallets) => [
  {
    type: 'checkbox',
    message: 'Select account(s)',
    name: 'selectedWallets',
    choices: [{ name: 'all', short: 'all', value: 'all' }, ...formatWalletsInfo(wallets)],
    validate (answer) {
      if (answer.length < 1) {
        return 'You must choose at least one wallet.'
      }
      return true
    }
  },
  {
    type: 'input',
    name: 'cooldownDelay',
    message: 'Enter cooldown delay in seconds: ',
    default: 0,
    filter: Number,
    transformer (delay) {
      return delay + 's'
    },
    validate (value) {
      const valid = !isNaN(parseFloat(value))
      return valid || 'Please enter a number'
    }
  }
]

const confirmQuestions = [
  {
    type: 'confirm',
    name: 'confirmation',
    message: 'Do you wish to continue with the current config?',
    default: true
  }
]

const sellTokenQuestions = (wallets) => {
  return [
    {
      type: 'input',
      name: 'tokenToSell',
      message: 'Enter address of token to sell: ',
      async validate (address) {
        try {
          ethers.utils.getAddress(address)
        } catch (e) { return 'You must enter a valid address.' }
        return true
      }
    },
    {
      type: 'list',
      name: 'wallet',
      message: 'Select wallet to use',
      choices: formatWalletsInfo(wallets)
    },
    {
      type: 'input',
      name: 'percentage',
      message: 'Enter percentage to sell: ',
      async validate (value) {
        if (value > 100 || value <= 0) return 'Value must be between 0 and 100'
        return true
      }
    }
  ]
}

const buyTokenQuestions = (wallets) => {
  return [
    {
      type: 'input',
      name: 'tokenToBuy',
      message: 'Enter address of token to buy: ',
      async validate (address) {
        try {
          ethers.utils.getAddress(address)
        } catch (e) { return 'You must enter a valid address.' }
        return true
      }
    },
    {
      type: 'list',
      name: 'wallet',
      message: 'Select wallet to use',
      choices: formatWalletsInfo(wallets)
    },
    {
      type: 'list',
      name: 'type',
      message: 'Select the type of buy',
      choices: [
        { name: 'Buy by ETH value', value: BUY_BY_ETH_VALUE },
        { name: 'Buy by number of tokens', value: BUY_BY_EXACT_TOKENS }
      ]
    },
    {
      type: 'input',
      name: 'ethValue',
      message: 'Enter ETH amount to spend: ',
      filter: Number
    },
    {
      type: 'input',
      name: 'totalTokens',
      message: 'Enter the number of tokens to buy: ',
      filter: Number,
      when (answers) {
        return answers.type === BUY_BY_EXACT_TOKENS
      }
    }
  ]
}

const buyTokenPrompt = (wallets) => inquirer.prompt(buyTokenQuestions(wallets))
const sellTokenPrompt = (wallets) => inquirer.prompt(sellTokenQuestions(wallets))
const paramsPrompt = (wallets) => inquirer.prompt(paramsQuestions(wallets))
const confirmPrompt = () => inquirer.prompt(confirmQuestions)

module.exports = { paramsPrompt, confirmPrompt, sellTokenPrompt, buyTokenPrompt }
