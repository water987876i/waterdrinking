const ethers = require('ethers')

const { transferTokenPrompt, confirmPrompt } = require('./shared/prompts')
const { printTransferSummary, getWalletBalance, formatBalance } = require('./helpers')
const daiAbi = require('./shared/daiAbi')
const env = require('./env.json')
const { logger, logTypes } = require('./shared/logger')

const { INFO, SUCCESS, ERROR } = logTypes

const ARGS = process.argv.slice(2)

// const MAX_FEE_PER_GAS = convertGwei2Wei(env.MAX_FEE_PER_GAS)
// const MAX_PRIORITY_FEE_PER_GAS = convertGwei2Wei(env.MAX_PRIORITY_FEE_PER_GAS)

const provider = new ethers.providers.WebSocketProvider(env.ESC_NODE_WSS)

async function transferToken (
  {
    contactAddress,
    srcWallet,
    destWallet,
    percentage
  }
) {
  const wallet = new ethers.Wallet(srcWallet.key)
  const walletSigner = wallet.connect(provider)

  if (contactAddress) {
    // general token send
    const daiContract = new ethers.Contract(contactAddress, daiAbi, walletSigner)

    const { rawBalance, name, decimals } = await getWalletBalance(contactAddress, srcWallet.address)

    // How many tokens?
    const numberOfTokens = rawBalance.mul(percentage).div(100)

    const tt = ethers.utils.formatUnits(`${numberOfTokens}`, decimals)
    logger(INFO, `Transfering ${formatBalance(tt)} of ${name}`)

    // Send tokens
    try {
      const txResponse = await daiContract.transfer(destWallet.address, numberOfTokens)
      logger(SUCCESS, 'Tokens successfully transfered!')
      logger(null, JSON.stringify(txResponse))
    } catch (error) {
      logger(ERROR, 'Failed to transfer tokens')
      logger(null, error)
    }

    process.exit()
  }
}

const main = async () => {
  const { srcWallet, destWallet, percentage } = await transferTokenPrompt(env.WALLETS)

  const transferTx = {
    contactAddress: ethers.utils.getAddress(ARGS[0]),
    srcWallet,
    destWallet,
    percentage
  }

  printTransferSummary(transferTx)

  const { confirmation } = await confirmPrompt()

  if (confirmation) {
    transferToken(transferTx)
  } else {
    main()
  }
}

main()
