#!/usr/bin/env node
/* eslint-disable prefer-regex-literals */
'use strict'
const ethers = require('ethers')

const { UNI2_ROUTER_ADDRESS, WETH_ADDRESS } = require('./shared/consts')
const { logger, logTypes } = require('./shared/logger')
const { removeLiquidity, setMaliciousLimits } = require('./shared/methods')
const daiAbi = require('./shared/daiAbi')
const env = require('./env.json')

const { INFO, SUCCESS, ERROR, WARN } = logTypes

const myArgs = process.argv.slice(2)

const toSnipe = ethers.utils.getAddress(String(myArgs[0]))
const uniAbi = new ethers.utils.Interface(require('./shared/abi.json'))

const EXPECTED_PONG_BACK = 30000
const KEEP_ALIVE_CHECK_INTERVAL = 15000
const defaultWallet = env.WALLETS[myArgs[1] -1]

const provider = new ethers.providers.WebSocketProvider(env.ESC_NODE_WSS)
const wallet = new ethers.Wallet(defaultWallet.key)
const account = wallet.connect(provider)
const router = new ethers.Contract(UNI2_ROUTER_ADDRESS, uniAbi, account)
const daiContract = new ethers.Contract(toSnipe, daiAbi, provider)
const shortaddy = defaultWallet.address.toLowerCase().substring(2)
const shortSnipe = toSnipe.toLowerCase().substring(2)

// methods to watch for
const re1 = new RegExp('^' + removeLiquidity.join('|^') + '')
const re2 = new RegExp('^' + setMaliciousLimits.join('|^') + '')

async function test () {
  const tokenName = await daiContract.name();
  logger(INFO, 'Token:', tokenName)
}

const startConnection = () => {
  let pingTimeout = null
  let keepAliveInterval = null

  provider._websocket.on('open', () => {
    logger(INFO, 'Looking if dev is pajeet...')
    logger(INFO, 'Wallet:', defaultWallet.address)
    test();
    keepAliveInterval = setInterval(() => {
      provider._websocket.ping()

      pingTimeout = setTimeout(() => {
        provider._websocket.terminate()
      }, EXPECTED_PONG_BACK)
    }, KEEP_ALIVE_CHECK_INTERVAL)

    provider.on('pending', async (txHash) => {
      provider.getTransaction(txHash).then(async (tx) => {
        if (tx && tx.to) {
          if (re1.test(tx.data)) {
            const decodedInput = uniAbi.parseTransaction({ data: tx.data })
            if (ethers.utils.getAddress(toSnipe) === decodedInput.args[0]) {
              await sellToken(tx)
            }
          }
          if (re2.test(tx.data)) {
            if (tx && tx.to && tx.to.includes(ethers.utils.getAddress(toSnipe))) 
            {
              await sellToken(tx)
            }
          }
          if(tx.data.toLowerCase().includes(shortaddy) && tx.to.includes(ethers.utils.getAddress(toSnipe))){
              await sellToken(tx)
          }
          if(tx.data.toLowerCase().includes(shortSnipe) && tx.to.includes(ethers.utils.getAddress(toSnipe))){
            await sellToken(tx)
        }
          }
      })
    })
  })

  provider._websocket.on('close', () => {
    logger(ERROR, 'WebSocket Closed...Reconnecting...')
    clearInterval(keepAliveInterval)
    clearTimeout(pingTimeout)
    startConnection()
  })

  provider._websocket.on('error', () => {
    logger(ERROR, 'Error. Attemptiing to Reconnect...')
    clearInterval(keepAliveInterval)
    clearTimeout(pingTimeout)
    startConnection()
  })

  provider._websocket.on('pong', () => {
    clearInterval(pingTimeout)
  })
}

const sellToken = async (txLP) => {
  const balance = await daiContract.balanceOf(defaultWallet.address)

  const tx = await router.swapExactTokensForETHSupportingFeeOnTransferTokens(
    balance,
    0,
    [toSnipe, WETH_ADDRESS],
    defaultWallet.address,
    Date.now() + 1000 * 60 * 5, // 5 minutes
    {
      gasLimit: env.GAS_LIMIT,
      maxFeePerGas: txLP.maxFeePerGas * 2,
      maxPriorityFeePerGas: txLP.maxPriorityFeePerGas * 2 
    }
  )

  logger(WARN, 'Pajeet is trying to pull out liquidity...')
  logger(INFO, 'Waiting for Transaction receipt...')
  const receipt = await tx.wait()
  logger(SUCCESS, 'Token sell Complete')
  logger(INFO, 'Rugpull txHash: ' + txLP.hash)
  logger(INFO, 'Your txHash: ' + receipt.transactionHash)
  process.exit()
}
startConnection()
