#!/usr/bin/env node
'use strict'
const ethers = require('ethers')

const env = require('./env.json')
const { printSummary, convertGwei2Wei, getTokenInfo } = require('./helpers')
const { buyTokenMultiple } = require('./buyToken')
const { paramsPrompt, confirmPrompt } = require('./prompts')
const {
  helpMessage,
  missingEnvArgsMessage,
  UNI2_ROUTER_ADDRESS,
  WETH_ADDRESS
} = require('./shared/consts')

const log = console.log

Object.assign(process.env, env)
const myArgs = process.argv.slice(2)

// check missing variables
const REQUIRED_ARGS_COUNT = 2
if (myArgs.length < REQUIRED_ARGS_COUNT) {
  console.log('You need to pass at least %d agruments', REQUIRED_ARGS_COUNT)
  console.log(helpMessage)
  process.exit()
}

if (!process.env.MAX_FEE_PER_GAS || !process.env.MAX_PRIORITY_FEE_PER_GAS) {
  log(missingEnvArgsMessage)
  process.exit()
}

const EXPECTED_PONG_BACK = 30000
const KEEP_ALIVE_CHECK_INTERVAL = 15000
const MAX_FEE_PER_GAS = convertGwei2Wei(process.env.MAX_FEE_PER_GAS)
const MAX_PRIORITY_FEE_PER_GAS = convertGwei2Wei(process.env.MAX_PRIORITY_FEE_PER_GAS)

const purchaseAmount = ethers.utils.parseUnits(String(myArgs[0]), 'ether')
const toSnipe = ethers.utils.getAddress(String(myArgs[1]))
const numberOfTransaction = myArgs[2] ? parseInt(myArgs[2]) : 1
const blocksToWait = myArgs[3] ? parseInt(myArgs[3]) : 0
let accounts = []

const uniAbi = new ethers.utils.Interface(require('./shared/abi.json'))
let provider = null

// Events method ID regex
const snipeType2Regex = /^0xf305d719|^0xe8e33700/ // add liquidity
const snipeType4Regex = /^0x0d295980|^0x31532eb8|^0x8f70ccf7|^0x37533c91|^0x51cd7cc3|^0xde3a3b69|^0xc9567bf9|^0x8a8c523c|^0xd1633649|^0x7b9e987a|^0xa6334231|^0xc0129d43|^0xcdeda4c6|^0x79eb8d1d|^0x293230b8|^0x60e65bb8|^0xa28a4d86|^0x715492aa/ // open trading

// block skipping logic
const awaitBlocksAndBuyToken = async (tx, targetBlock, buyTokens) => {
  const txLPBlock = await provider.getBlockNumber()
  log(`Waiting for block ${targetBlock}, current block is ${txLPBlock}`)

  provider.removeAllListeners()

  provider.on('block', async (block) => {
    log(`Waiting for block ${targetBlock}, current block is ${block}`)

    if (targetBlock === block) {
      provider.removeAllListeners()
      await buyTokens({
        ...tx,
        maxFeePerGas: MAX_FEE_PER_GAS,
        maxPriorityFeePerGas: MAX_PRIORITY_FEE_PER_GAS
      })
    }
  })
}

const startConnection = ({ selectedWallets, tokenDecimals, cooldownDelay }) => {
  let pingTimeout = null
  let keepAliveInterval = null

  const xTokensToBuy = myArgs[4] && ethers.utils.parseUnits(myArgs[4], tokenDecimals)
  const txParams = { path: [WETH_ADDRESS, toSnipe], purchaseAmount, minAmount: 0, xTokensToBuy }

  const recepients = selectedWallets.map((w) => w.address)
  const wallets = selectedWallets.map((wallet) => new ethers.Wallet(wallet.key))
  accounts = wallets.map((wallet) => wallet.connect(provider))
  const routers = accounts.map((account) => new ethers.Contract(UNI2_ROUTER_ADDRESS, uniAbi, account))

  const buyTokens = (tx) =>
    buyTokenMultiple({
      routers,
      recepients,
      triggeredTransaction: tx,
      transactionParams: txParams,
      totalTransactions: numberOfTransaction,
      cooldownDelay: cooldownDelay * 1000,
      approve
    })

  provider._websocket.on('open', () => {
    log('Listening to OPEN TRADING & ADD LIQIUDITY events...')

    keepAliveInterval = setInterval(() => {
      provider._websocket.ping()

      // Delay should be equal to the interval at which your server
      // sends out pings plus a conservative assumption of the latency.
      pingTimeout = setTimeout(() => {
        provider._websocket.terminate()
      }, EXPECTED_PONG_BACK)
    }, KEEP_ALIVE_CHECK_INTERVAL)

    provider.on('pending', async (txHash) => {
      provider.getTransaction(txHash).then(async (tx) => {
        if (tx && tx.to) {
          // open trading
          if (snipeType4Regex.test(tx.data) && tx.to === toSnipe) {
            log(('OPEN TRADING event detected!'))

            provider.removeAllListeners()

            // check if it should skip blocks
            if (blocksToWait === 0) {
              await buyTokens(tx)
            } else {
              const txLPBlock = await provider.getBlockNumber()
              const targetBlock = txLPBlock + blocksToWait
              await awaitBlocksAndBuyToken(tx, targetBlock, buyTokens)
            }
          }

          // add liquidity
          if (snipeType2Regex.test(tx.data) && tx.to === UNI2_ROUTER_ADDRESS) {
            const { data, value } = tx
            const decodedInput = uniAbi.parseTransaction({ data, value })
            const isDirectedToToSnipeAddress = ethers.utils.getAddress(toSnipe) === decodedInput.args[0]

            log('ADD LIQUIDITY event detected!')

            if (isDirectedToToSnipeAddress) {
              provider.removeAllListeners()
              // check if it should skip blocks
              if (blocksToWait !== 0) {
                const txLPBlock = await provider.getBlockNumber()
                const targetBlock = txLPBlock + blocksToWait
                await awaitBlocksAndBuyToken(tx, targetBlock, buyTokens)
              } else {
                await buyTokens(tx)
              }
            }
          }
        }
      })
    })
  })

  provider._websocket.on('close', () => {
    log('txPool sniping has failed\n')
    log('WebSocket Closed')
    log('Reconnecting...')

    clearInterval(keepAliveInterval)
    clearTimeout(pingTimeout)
    startConnection()
  })

  provider._websocket.on('error', () => {
    log('txPool sniping has failed\n')
    log('Error. Attempting to Reconnect...\n')

    clearInterval(keepAliveInterval)
    clearTimeout(pingTimeout)
    startConnection()
  })

  provider._websocket.on('pong', () => {
    clearInterval(pingTimeout)
  })
}

// approve transactions for all accounts
const approve = () => {
  accounts.forEach(async (account) => {
    const sellContract = new ethers.Contract(
      toSnipe,
      [
        'function approve(address _spender, uint256 _value) public returns (bool success)',
        'function name() external pure returns (string memory)'
      ],
      account
    )
    const tokenName = await sellContract.name()
    const tx = await sellContract.approve(UNI2_ROUTER_ADDRESS, ethers.constants.MaxUint256)
    const receipt = await tx.wait()

    log(`Approved ${tokenName}`)
    log(`Your txHash: https://etherscan.io/${receipt.transactionHash}`)
  })
}

// main
const main = async () => {
  const selectedParams = await paramsPrompt(env.WALLETS)
  const tokenInfo = await getTokenInfo(toSnipe)

  if (selectedParams.selectedWallets.includes('all')) {
    selectedParams.selectedWallets = env.WALLETS
  }

  const config = {
    ...selectedParams,
    tokenInfo,
    ethAmount: myArgs[0],
    totalTransactions: numberOfTransaction,
    tokenToSnipe: toSnipe,
    blocksToWait: blocksToWait,
    totalToken: myArgs[4]
  }

  printSummary(config)

  const { confirmation } = await confirmPrompt()

  if (confirmation) {
    provider = new ethers.providers.WebSocketProvider(env.ESC_NODE_WSS)
    startConnection({ ...selectedParams, tokenDecimals: tokenInfo.decimals })
  } else {
    main()
  }
}

// start main
main()
