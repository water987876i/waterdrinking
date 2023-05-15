#!/usr/bin/env node
'use strict'
const ethers = require('ethers')

const { printSummary, convertGwei2Wei, getTokenInfo } = require('./helpers')
const { paramsPrompt, confirmPrompt } = require('./shared/prompts')
const { logger, logTypes } = require('./shared/logger')
const { addLiquidity, openTrading } = require('./shared/methods')
const { buyTokenMultiple } = require('./buyToken')
const env = require('./env.json')
const {
  helpMessage,
  missingEnvArgsMessage,
  UNI2_ROUTER_ADDRESS,
  SMARTCONTRACT,
  WETH_ADDRESS
} = require('./shared/consts')
const daiAbi = require('./shared/daiAbi')

const { INFO, SUCCESS, ERROR, WARN } = logTypes

Object.assign(process.env, env)

const myArgs = process.argv.slice(2)

// check missing variables
const REQUIRED_ARGS_COUNT = 2
if (myArgs.length < REQUIRED_ARGS_COUNT) {
  logger(WARN, 'You need to pass at least %d agruments', REQUIRED_ARGS_COUNT)
  logger(null, helpMessage)
  process.exit()
}

if (!process.env.MAX_FEE_PER_GAS || !process.env.MAX_PRIORITY_FEE_PER_GAS) {
  logger(WARN, missingEnvArgsMessage)
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

// methods ids to listen to
const snipeType2Regex = new RegExp('^' + addLiquidity.join('|^') + '')
const snipeType4Regex = new RegExp('^' + openTrading.join('|^') + '')

// block skipping logic
const awaitBlocksAndBuyToken = async (txLP, blocksToWait, buyTokens) => {
  logger(INFO, 'Wating for LP tx receipt')

  const txLPRceipt = await txLP.wait()
  const txLPBlock = txLPRceipt.blockNumber
  const blockToTarget = txLPBlock + blocksToWait

  logger(INFO, `The LP tx was mined in block ${txLPBlock}, waiting for block ${blockToTarget}`)

  provider.removeAllListeners()

  if (blocksToWait === 1) {
    await buyTokens({
      ...txLP,
      maxFeePerGas: MAX_FEE_PER_GAS,
      maxPriorityFeePerGas: MAX_PRIORITY_FEE_PER_GAS
    })
  } else {
    provider.on('block', async (block) => {
      if (blockToTarget === block) {
        logger(INFO, `Current block ${block}, executing transaction!`)
        provider.removeAllListeners()

        await buyTokens({
          ...txLP,
          maxFeePerGas: MAX_FEE_PER_GAS,
          maxPriorityFeePerGas: MAX_PRIORITY_FEE_PER_GAS
        })
      }
    })
  }
}

let sw = null
let td = null

const startConnection = ({ selectedWallets, tokenDecimals, tokensupply }) => {
  let pingTimeout = null
  let keepAliveInterval = null

  sw = selectedWallets
  td = tokenDecimals

  const supply = ethers.utils.formatUnits(tokensupply, tokenDecimals);
  const TokensToBuy = myArgs[4]*supply/100
  const xTokensToBuy = ethers.utils.parseUnits(TokensToBuy.toString());
  const txParams = { weth: WETH_ADDRESS, token: toSnipe , purchaseAmount, minAmount: 0, xTokensToBuy, numberOfTransaction }
  const recepients = selectedWallets.map((w) => w.address)
  const wallets = selectedWallets.map((wallet) => new ethers.Wallet(wallet.key))
  accounts = wallets.map((wallet) => wallet.connect(provider))
  const routers = accounts.map((account) => new ethers.Contract(SMARTCONTRACT, daiAbi, account))

  const buyTokens = (tx) =>
    buyTokenMultiple({
      routers,
      recepients,
      triggeredTransaction: tx,
      transactionParams: txParams,
      totalTransactions: numberOfTransaction,
      approve
    })

  provider._websocket.on('open', () => {
    logger(INFO, 'Listening to OPEN TRADING & ADD LIQIUDITY events...')

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
            logger(SUCCESS, 'OPEN TRADING event detected!')

            provider.removeAllListeners()

            // check if it should skip blocks
            if (blocksToWait === 0) {
              await buyTokens(tx)
            } else {
              await awaitBlocksAndBuyToken(tx, blocksToWait, buyTokens)
            }
          }

          // add liquidity
          if (snipeType2Regex.test(tx.data) && tx.to === UNI2_ROUTER_ADDRESS) {
            const { data, value } = tx
            const decodedInput = uniAbi.parseTransaction({ data, value })
            const isDirectedToToSnipeAddress = ethers.utils.getAddress(toSnipe) === decodedInput.args[0]

            logger(SUCCESS, 'ADD LIQUIDITY event detected!')

            if (isDirectedToToSnipeAddress) {
              provider.removeAllListeners()
              // check if it should skip blocks
              if (blocksToWait !== 0) {
                await awaitBlocksAndBuyToken(tx, blocksToWait, buyTokens)
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
    logger(ERROR, 'txPool sniping has failed')
    logger(ERROR, 'WebSocket Closed')
    logger(INFO, 'Reconnecting...')

    clearInterval(keepAliveInterval)
    clearTimeout(pingTimeout)
    startConnection({ selectedWallets: sw, tokenDecimals: td })
  })

  provider._websocket.on('error', () => {
    logger(ERROR, 'Error: txPool sniping has failed')
    logger(INFO, 'Attempting to Reconnect...\n')

    clearInterval(keepAliveInterval)
    clearTimeout(pingTimeout)
    startConnection({ selectedWallets: sw, tokenDecimals: td })
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

    logger(SUCCESS, `Approved ${tokenName}`)
    logger(INFO, `Your txHash: https://etherscan.io/${receipt.transactionHash}`)
  })
}

// main
const main = async () => {
  const selectedParams = await paramsPrompt(env.WALLETS)
  const tokenInfo = await getTokenInfo(toSnipe)
  const supply = ethers.utils.formatUnits(tokenInfo.supply, tokenInfo.decimals)
  const xTokensToBuy = myArgs[4]*supply/100

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
    totalToken: xTokensToBuy
  }

  printSummary(config)

  const { confirmation } = await confirmPrompt()

  if (confirmation) {
    provider = new ethers.providers.WebSocketProvider(env.ESC_NODE_WSS)
    startConnection({ ...selectedParams, tokenDecimals: tokenInfo.decimals , tokensupply: tokenInfo.supply})
  } else {
    main()
  }
}

// start main
main()