const ora = require('ora')
const ethers = require('ethers')

const env = require('../env.json')
const daiAbi = require('../shared/daiAbi')

const provider = new ethers.providers.WebSocketProvider(env.ESC_NODE_WSS)

const formatBalance = (n) => Number(n).toLocaleString('fr-FR')

const getTokenInfo = async (tokenAddress) => {
  try {
    const daiContract = new ethers.Contract(tokenAddress, daiAbi, provider)
    const name = await daiContract.name()
    const symbol = await daiContract.symbol()
    const decimals = await daiContract.decimals()
    const supply = await daiContract.totalSupply()

    return { name, symbol, decimals: decimals.toNumber(), supply: supply.toString() }
  } catch (err) {
    ora().fail('Could not get token info, usind defaults')
    return { name: 'N/A', symbol: 'N/A', decimals: 18 }
  }
}

const printSummary = ({
  selectedWallets, ethAmount, tokenToSnipe, totalTransactions, blocksToWait, totalToken, tokenInfo, cooldownDelay
}) => {
  const foramttedWallets = selectedWallets.map(({ label, address }) => `\n > ${label}(${address})`).join('')
  const totalEth = parseFloat(ethAmount) * selectedWallets.length * parseInt(totalTransactions)
  const totalTokens = totalToken ? totalToken * selectedWallets.length * totalTransactions : null

  ora().info('############ Snipe Summary ############')
  ora().info(`Wallets used: ${foramttedWallets}`)
  ora().info(`Token to snipe: ${tokenInfo.name}(${tokenToSnipe})`)
  ora().info(`Purchase amount: ${totalEth.toFixed(3)}ETH (${ethAmount}ETH per TX)`)
  ora().info(`Number of transactions: ${totalTransactions}`)
  ora().info(`Blocks to wait: ${blocksToWait}`)
  ora().info(totalToken ? `Total tokens to buy: ${totalTokens} (${totalToken} per TX)` : 'Total tokens to buy not set, using ETH amount')
  ora().info(`Cooldown delay: ${cooldownDelay}s`)
  ora().info('########################################')
}

const printSellSummary = ({ wallet, percentage, amountToSell, tokenInfo }) => {
  const { name, symbol, balance } = tokenInfo

  ora().info('############ Sell Summary ############')
  ora().info(`Token to sell: ${name} (${symbol})`)
  ora().info(`Wallet to use: ${wallet.label} (${wallet.address})`)
  ora().info(`Wallet balance: ${formatBalance(balance)}`)
  ora().info(`Amount to sell: ${formatBalance(amountToSell)} (${percentage}%)`)
  ora().info('######################################')
}

const printBuySummary = ({ wallet, ethValue, totalTokens, tokenInfo }) => {
  const { name, symbol } = tokenInfo

  ora().info('############ Buy Summary ############')
  ora().info(`Token to buy: ${name} (${symbol})`)
  ora().info(`Wallet to use: ${wallet.label} (${wallet.address})`)
  ora().info(`Max. ETH to spend: ${ethValue}ETH`)
  ora().info(`Total tokens to buy: ${totalTokens || 'N/A (using ETH value instead)'}`)
  ora().info('######################################')
}

const printWalletBuySummary = ({ wallet, ethValue, totalTokens, tokenInfo }) => {
  const { name, symbol } = tokenInfo

  ora().info('############ Buy Summary ############')
  ora().info(`Token to buy: ${name} (${symbol})`)
  ora().info(`Wallets to use: ${wallet}`)
  ora().info(`Max. ETH to spend: ${ethValue}ETH`)
  ora().info(`Total tokens to buy: ${totalTokens || 'N/A (using ETH value instead)'}`)
  ora().info('######################################')
}

const printTransferSummary = ({ srcWallet, destWallet, contactAddress, percentage }) => {
  ora().info('############ Transfer Summary ############')
  ora().info(`Token to transfer: ${contactAddress}`)
  ora().info(`Source wallet: ${srcWallet.label} (${srcWallet.address})`)
  ora().info(`Destination wallet: ${destWallet.label} (${destWallet.address})`)
  ora().info(`Total % to transfer: (${percentage}%)`)
  ora().info('######################################')
}

const convertGwei2Wei = (gweiValue) => parseInt(gweiValue) * 1e9

const getWalletBalance = async (tokenAddress, walletAddress) => {
  const daiContract = new ethers.Contract(tokenAddress, daiAbi, provider)
  const tokenInfo = await getTokenInfo(tokenAddress)
  const balance = await daiContract.balanceOf(walletAddress)
  const parsedBalance = ethers.utils.formatUnits(`${balance}`, tokenInfo.decimals)

  return { balance: parsedBalance, rawBalance: balance, ...tokenInfo }
}

const formatWalletsInfo = (wallets) => wallets.map((w) => {
  return { name: w.label, short: w.label, value: w }
})

module.exports = {
  printSummary,
  convertGwei2Wei,
  getWalletBalance,
  formatWalletsInfo,
  printSellSummary,
  getTokenInfo,
  printBuySummary,
  printWalletBuySummary,
  printTransferSummary,
  formatBalance
}
