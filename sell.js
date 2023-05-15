const ethers = require('ethers')

const env = require('./env.json')
const uniAbi = new ethers.utils.Interface(require('./shared/abi.json'))
const { sellTokenPrompt, confirmPrompt } = require('./shared/prompts')
const { UNI2_ROUTER_ADDRESS, WETH_ADDRESS } = require('./shared/consts')
const { getWalletBalance, convertGwei2Wei, printSellSummary } = require('./helpers')
const { logger, logTypes } = require('./shared/logger')

const { INFO, SUCCESS, ERROR } = logTypes
const MAX_FEE_PER_GAS = convertGwei2Wei(env.MAX_FEE_PER_GAS)
const MAX_PRIORITY_FEE_PER_GAS = convertGwei2Wei(env.MAX_PRIORITY_FEE_PER_GAS)

const provider = new ethers.providers.WebSocketProvider(env.ESC_NODE_WSS)

// approve transactions for all accounts
const approve = async (account, toSnipe) => {
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
}

const sellToken = async (tokenAddress, { key, address }, amountToSell, preApprove) => {
  const wallet = new ethers.Wallet(key)
  const account = wallet.connect(provider)
  const router = new ethers.Contract(UNI2_ROUTER_ADDRESS, uniAbi, account)

  try {
    if (preApprove) {
      logger(SUCCESS, 'Waiting for token approval ...')
      await approve(account, tokenAddress)
    }

    const tx = await router.swapExactTokensForETHSupportingFeeOnTransferTokens(
      amountToSell,
      0,
      [tokenAddress, WETH_ADDRESS],
      address,
      Date.now() + 1000 * 60 * 5, // 5 minutes
      {
        gasLimit: env.GAS_LIMIT,
        maxFeePerGas: MAX_FEE_PER_GAS,
        maxPriorityFeePerGas: MAX_PRIORITY_FEE_PER_GAS
      }
    )

    logger(INFO, 'Waiting for receipt...')
    const receipt = await tx.wait()
    logger(SUCCESS, 'Token sell Complete')
    logger(INFO, 'Your txHash: ' + receipt.transactionHash)
  } catch (error) {
    logger(ERROR, `error => ${error.reason} (${error.code})`)
    logger(INFO, `Transaction hash => ${error.transactionHash}`)
  }
  process.exit()
}

// start prompt, then sell Token
const main = async () => {
  const { tokenToSell, wallet, percentage, preApprove } = await sellTokenPrompt(env.WALLETS)
  const { rawBalance, decimals, name, ...rest } = await getWalletBalance(tokenToSell, wallet.address)
  const amountToSell = rawBalance.mul(percentage).div(100)
  const parsedAmountToSell = ethers.utils.formatUnits(amountToSell, decimals)

  logger(INFO, `Selling => ${parsedAmountToSell} ${name}`)

  // print summary
  printSellSummary({ wallet, percentage, amountToSell, tokenInfo: { decimals, name, ...rest } })

  const { confirmation } = await confirmPrompt()

  if (confirmation) {
    sellToken(tokenToSell, wallet, amountToSell, preApprove)
  } else {
    main()
  }
}

main()