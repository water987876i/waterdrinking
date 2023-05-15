const helpMessage = 'usage: node listener.js [purchaseAmountInEth] [toSnipeAddress] [numberOfTransaction(optional)] [blocksToWait(optional)] [NumberTokensToBuy(optional)]'
const missingEnvArgsMessage = 'Missing environment variable, verify following variables MAX_FEE_PER_GAS, MAX_PRIORITY_FEE_PER_GAS in env.json'

const UNI2_ROUTER_ADDRESS = '0x7a250d5630b4cf539739df2c5dacb4c659f2488d'
const SMARTCONTRACT = '0x18C535EcC9416F545ae4CdBAA4CF5413412F6e6B'
const WETH_ADDRESS = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'
//const WETH_ADDRESS = '0xc778417e063141139fce010982780140aa0cd5ab'

const BUY_BY_ETH_VALUE = 'BUY_BY_ETH_VALUE'
const BUY_BY_EXACT_TOKENS = 'BUY_BY_EXACT_TOKENS'

module.exports = {
  helpMessage,
  missingEnvArgsMessage,
  UNI2_ROUTER_ADDRESS,
  SMARTCONTRACT,
  BUY_BY_ETH_VALUE,
  BUY_BY_EXACT_TOKENS,
  WETH_ADDRESS
}