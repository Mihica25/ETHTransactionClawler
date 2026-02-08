export interface EtherscanTransaction {
  blockNumber: string;
  timeStamp: string;
  hash: string;
  nonce: string;
  blockHash: string;
  transactionIndex: string;
  from: string;
  to: string;
  value: string; // in Wei
  gas: string;
  gasPrice: string;
  isError: string;
  txreceipt_status: string;
  input: string;
  contractAddress: string;
  cumulativeGasUsed: string;
  gasUsed: string;
  confirmations: string;
}

export interface EtherscanTokenTransaction {
  blockNumber: string;
  timeStamp: string;
  hash: string;
  nonce: string;
  blockHash: string;
  from: string;
  to: string;
  contractAddress: string;
  tokenName: string;
  tokenSymbol: string;
  tokenDecimal: string;
  value: string;
  transactionIndex: string;
  gas: string;
  gasPrice: string;
  gasUsed: string;
  cumulativeGasUsed: string;
  confirmations: string;
}

export interface EtherscanResponse {
  status: string;
  message: string;
  result: EtherscanTransaction[] | EtherscanTokenTransaction[] | string;
}

export interface TransactionDisplay {
  hash: string;
  blockNumber: string;
  from: string;
  to: string;
  ethAmount: string;
  timestamp: string;
}

export interface TokenTransferDisplay {
  hash: string;
  blockNumber: string;
  from: string;
  to: string;
  tokenAmount: string;
  tokenSymbol: string;
  tokenName: string;
  contractAddress: string;
  timestamp: string;
}
