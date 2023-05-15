const ethers = require('ethers')

const env = require('./env.json')
const uniAbi = new ethers.utils.Interface(require('./shared/abi.json'))
const { UNI2_ROUTER_ADDRESS, WETH_ADDRESS, BUY_BY_ETH_VALUE, BUY_BY_EXACT_TOKENS } = require('./shared/consts')
const { getTokenInfo, convertGwei2Wei, printWalletBuySummary } = require('./helpers')
const { logger, logTypes } = require('./shared/logger')

const ARGS = process.argv.slice(2)
const { INFO, SUCCESS, ERROR } = logTypes

const MAX_FEE_PER_GAS = convertGwei2Wei(env.MAX_FEE_PER_GAS)
const MAX_PRIORITY_FEE_PER_GAS = convertGwei2Wei(env.MAX_PRIORITY_FEE_PER_GAS)

const howManyTxs = ARGS[0]
const TOKEN_TO_BUY = ethers.utils.getAddress(ARGS[1])
const ETH_AMOUNT = ARGS[2]
const TOKEN_AMOUNT = ARGS[3]

logger(INFO, 'Usage: instantBuy.js wallet toekenAddress EthAmount TokenAmount')

const provider = new ethers.providers.WebSocketProvider(env.ESC_NODE_WSS)

const buyToken = async () => {

  const type = TOKEN_AMOUNT ? BUY_BY_EXACT_TOKENS : BUY_BY_ETH_VALUE
  const tokenInfo = await getTokenInfo(TOKEN_TO_BUY)
  const supply = ethers.utils.formatUnits(tokenInfo.supply, tokenInfo.decimals)
  const calculation = (TOKEN_AMOUNT/100)
  const xTokensToBuy = calculation*supply
  const NEW_TOKEN_AMMOUNT = xTokensToBuy;
  const amountIn = ethers.utils.parseUnits(`${NEW_TOKEN_AMMOUNT || 0}`, tokenInfo.decimals)
  const ethAmount = ethers.utils.parseUnits(ETH_AMOUNT, 'ether')

  // print summary
  printWalletBuySummary({ wallet: howManyTxs, ethValue: ETH_AMOUNT, totalTokens: NEW_TOKEN_AMMOUNT, tokenInfo })
  let tx = null
  
  try {
    switch (type) {
      case BUY_BY_ETH_VALUE:
    for (let index = 0; index < howManyTxs; index++) {
      const WALLET = env.WALLETS[index]
      const wallet = new ethers.Wallet(WALLET.key)
      const account = wallet.connect(provider)
      const router = new ethers.Contract(UNI2_ROUTER_ADDRESS, uniAbi, account)
        tx = await router.swapExactETHForTokens(
          amountIn,
          [WETH_ADDRESS, TOKEN_TO_BUY],
          WALLET.address,
          Date.now() + 1000 * 60 * 5, // 5 minutes
          {
            value: ethAmount,
            gasLimit: env.GAS_LIMIT,
            maxFeePerGas: MAX_FEE_PER_GAS,
            maxPriorityFeePerGas: MAX_PRIORITY_FEE_PER_GAS
          }
        )
        logger(INFO, 'Your txHash: ' + tx.hash)
      }
        break

      case BUY_BY_EXACT_TOKENS:
        for (let index = 0; index < howManyTxs; index++) {
          const WALLET = env.WALLETS[index]
          const wallet = new ethers.Wallet(WALLET.key)
          const account = wallet.connect(provider)
          const router = new ethers.Contract(UNI2_ROUTER_ADDRESS, uniAbi, account)
          tx = await router.swapETHForExactTokens(
              amountIn,
              [WETH_ADDRESS, TOKEN_TO_BUY],
              WALLET.address,
              Date.now() + 1000 * 60 * 5, // 5 minutes
              {
                value: ethAmount,
                gasLimit: env.GAS_LIMIT,
                maxFeePerGas: MAX_FEE_PER_GAS,
                maxPriorityFeePerGas: MAX_PRIORITY_FEE_PER_GAS
              }
            )
            logger(INFO, 'Your txHash: ' + tx.hash)
          }
        break

      default:
        break
    }
    const receipt = await tx.wait()
    logger(SUCCESS, 'Token buy Complete')
  } catch (error) {
    logger(ERROR, 'Failed to execute transaction')
    logger(ERROR, error)
  }

  process.exit()
}

buyToken()
