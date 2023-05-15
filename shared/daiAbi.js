
const daiAbi = [
  // Some details about the token
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function totalSupply() external view returns (uint)',

  // Get the account balance
  'function balanceOf(address) view returns (uint)',
  'function decimals() view returns (uint256)',
  'function approve(address _spender, uint256 _value) public returns (bool success)',

  // Send some of your tokens to someone else
  'function transfer(address to, uint amount)',

  // An event triggered whenever anyone transfers to someone else
  'event Transfer(address indexed from, address indexed to, uint amount)',

  // for smartcontract
  'function multitokenswap(address src, address dst, uint256 amount, uint256 minReturn, uint txs, address[] path)',
  'function withdraw(address token)'
]

module.exports = daiAbi
