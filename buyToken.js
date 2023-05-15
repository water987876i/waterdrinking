const env = require('./env.json')
const ethers = require('ethers');
const { logger, logTypes } = require('./shared/logger')

const { INFO, SUCCESS, ERROR } = logTypes

const txList = []

const provider = new ethers.providers.WebSocketProvider(env.ESC_NODE_WSS);


// logs tx success info
const createLog = (txLP, receipt, receiptLP) => {
  logger(SUCCESS, 'Token Purchase Complete')
  logger(INFO, `Liquidity Addition Transaction Hash: https://etherscan.io/${txLP.hash}`)
  logger(INFO, `Your Transaction Hash: https://etherscan.io/${receipt.transactionHash}`)

  if (receipt.blockNumber === receiptLP.blockNumber) {
    const txDiff = receipt.transactionIndex - receiptLP.transactionIndex
    logger(INFO, `There are ${txDiff} transactions in the block between your snipe and the LP transaction.`)
  } else {
    const blockDiff = receipt.blockNumber - receiptLP.blockNumber
    logger(INFO, `There are ${blockDiff} block(s) between your snipe and the LP transaction.`)
  }
}

// whether to use ETH amount or number of tokens
// const swapETHOrExactEthForTokens = (withTokens = false, router, txOptions) => {
//   if (withTokens) {
//     logger(INFO, 'Buying with token')
//     return router.swapETHForExactTokens(...txOptions)
//   }

//   logger(INFO, 'Buying with ETH')
//   return router.swapExactETHForTokens(...txOptions)
// }

// create receipt
const createReceipt = async (tx, txLP, approve, txNumber) => {
  logger(INFO, `Waiting for Transaction ${txNumber} receipt`)
  const receipt = await tx.wait()
  const receiptLP = await txLP.wait()

  createLog(txLP, receipt, receiptLP)

  if (txNumber === txList.length) {
    await approve()
  }
}

// buy tokens logic
const BuyTokenOnce = async (router, txLP, txParams) => {
  const { path, recipient, purchaseAmount, minAmount, xTokensToBuy } = txParams
  const deadline = Date.now() + 1000 * 60 * 5 // 5 minutes
  const withTokens = !!xTokensToBuy
  const amoutOfTokens = withTokens ? xTokensToBuy : minAmount
  const nonce =  await provider.getTransactionCount(recipient);

  const txOptions = [
    amoutOfTokens,
    path,
    recipient,
    deadline,
    {
      value: purchaseAmount,
      gasLimit: env.GAS_LIMIT,
      maxFeePerGas: txLP.maxFeePerGas,
      maxPriorityFeePerGas: txLP.maxPriorityFeePerGas,
      nonce: nonce,
    }
  ]

  try {
    let tx = null // await swapETHOrExactEthForTokens(withTokens, router, txOptions)

    if (withTokens) {
      tx = await router.swapETHForExactTokens(...txOptions)
      txList.push(tx)
    } else {
      tx = await router.swapExactETHForTokens(...txOptions)
      txList.push(tx)
    }
  } catch (e) {
    logger(INFO, e.code + ' : ' + e.reason)
  }
}

const BuyTokenOnce2 = async (router, txLP, txParams) => {
  const { path, recipient, purchaseAmount, minAmount, xTokensToBuy } = txParams
  const deadline = Date.now() + 1000 * 60 * 5 // 5 minutes
  const withTokens = !!xTokensToBuy
  const amoutOfTokens = withTokens ? xTokensToBuy : minAmount
  const nonce =  await provider.getTransactionCount(recipient);

  const txOptions = [
    amoutOfTokens,
    path,
    recipient,
    deadline,
    {
      type: 0,
      value: purchaseAmount,
      gasLimit: env.GAS_LIMIT,
      gasPrice: ethers.utils.parseUnits("150", "gwei"),
      nonce: nonce,
    }
  ]

  try {
    let tx = null // await swapETHOrExactEthForTokens(withTokens, router, txOptions)

    if (withTokens) {
      tx = await router.swapETHForExactTokens(...txOptions)
      txList.push(tx)
    } else {
      tx = await router.swapExactETHForTokens(...txOptions)
      txList.push(tx)
    }
  } catch (e) {
    console.log(e);
    logger(INFO, e.code + ' : ' + e.reason)
  }
}

const createReceiptAndApprove = async (triggeredTransaction, approve) => {
  // create receipts for all tx & approve
  try {
    txList.forEach(async (transact, idx) => {
      await createReceipt(transact, triggeredTransaction, approve, idx + 1)
    })
  } catch (err) {
    logger(ERROR, 'Failed to create receipts')
    logger(ERROR, 'Error => ', err)
    process.exit()
  }
}

// loops through number of tx
const buyTokenMultiple = async ({
  routers,
  recepients,
  triggeredTransaction,
  transactionParams,
  totalTransactions = 1,
  approve
}) => {
  let count = 0

  // perform a x buy for each wallet
  routers.forEach(async (router, idx) => {
    while (count + 1 <= totalTransactions) {
      logger(INFO, `****** Executing transaction number: ${count + 1} | Wallet: ${idx + 1} | ${new Date().toISOString()} ******`)
      await BuyTokenOnce(router, triggeredTransaction, { ...transactionParams, recipient: recepients[idx] })
      count++
    }

    // print receipts after completing all transactions
    if (count === totalTransactions && idx + 1 === routers.length) {
      logger(INFO, 'Printing receipts...')
      createReceiptAndApprove(triggeredTransaction, approve)
    }
    count = 0
  })
}

const buyTokenMultiple2 = async ({
  routers,
  recepients,
  triggeredTransaction,
  transactionParams,
  totalTransactions = 1,
  approve
}) => {
  let count = 0

  // perform a x buy for each wallet
  routers.forEach(async (router, idx) => {
    while (count + 1 <= totalTransactions) {
      logger(INFO, `****** Executing transaction number: ${count + 1} | Wallet: ${idx + 1} | ${new Date().toISOString()} ******`)
      await BuyTokenOnce2(router, triggeredTransaction, { ...transactionParams, recipient: recepients[idx] })
      count++
    }

    // print receipts after completing all transactions
    if (count === totalTransactions && idx + 1 === routers.length) {
      logger(INFO, 'Printing receipts...')
      createReceiptAndApprove(triggeredTransaction, approve)
    }
    count = 0
  })
}

module.exports = { BuyTokenOnce, buyTokenMultiple, buyTokenMultiple2, BuyTokenOnce2 }
