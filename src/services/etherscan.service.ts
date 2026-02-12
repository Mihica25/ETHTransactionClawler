import type {
  EtherscanResponse,
  EtherscanTransaction,
  EtherscanTokenTransaction,
  PaginatedTransactions,
  PaginatedTokenTransfers,
} from '../types/index.js';
import type { DatabaseService } from './database.service.js';
import { weiToEth } from '../utils/conversion.utils.js';
import { fetchWithTimeout, delay } from '../utils/http.utils.js';

export class EtherscanService {
  private apiKey: string;
  private baseUrl: string = 'https://api.etherscan.io/v2/api';
  private chainId: string;
  private rpcUrl: string;
  private db: DatabaseService;

  private static readonly BLOCK_CHUNK_SIZE = 100000;
  private static readonly MAX_RETRIES = 3;
  // Etherscan returns max 10,000 results per API call
  private static readonly API_PAGE_SIZE = 10000;
  private static readonly RATE_LIMIT_DELAY_MS = 2000;
  private static readonly RETRY_DELAY_MS = 3000;
  private static readonly CHUNK_DELAY_MS = 250;

  constructor(apiKey: string, db: DatabaseService) {
    this.apiKey = apiKey;
    this.chainId = process.env.CHAIN_ID || '1';
    this.rpcUrl = process.env.RPC_URL || '';
    this.db = db;
  }

  private buildUrl(params: Record<string, string>): string {
    const searchParams = new URLSearchParams({
      chainid: this.chainId,
      ...params,
      apikey: this.apiKey,
    });
    return `${this.baseUrl}?${searchParams}`;
  }

  private async getLatestBlockNumber(): Promise<number> {
    const url = this.buildUrl({ module: 'proxy', action: 'eth_blockNumber' });
    const response = await fetchWithTimeout(url);
    const data = await response.json();
    return parseInt(data.result, 16);
  }

  private async fetchTransactionRange(
    walletAddress: string,
    startBlock: number,
    endBlock: number,
  ): Promise<EtherscanTransaction[]> {
    const url = this.buildUrl({
      module: 'account',
      action: 'txlist',
      address: walletAddress,
      startblock: startBlock.toString(),
      endblock: endBlock.toString(),
      page: '1',
      offset: EtherscanService.API_PAGE_SIZE.toString(),
      sort: 'asc',
    });

    for (let attempt = 1; attempt <= EtherscanService.MAX_RETRIES; attempt++) {
      try {
        const response = await fetchWithTimeout(url);
        const data: EtherscanResponse = await response.json();

        if (data.status !== '1') {
          if (data.message === 'No transactions found') {
            return [];
          }
          if (data.result && typeof data.result === 'string' && data.result.includes('rate limit')) {
            await delay(EtherscanService.RATE_LIMIT_DELAY_MS);
            continue;
          }
          throw new Error(data.message || 'Failed to fetch transactions');
        }

        return data.result as EtherscanTransaction[];
      } catch (error) {
        if (attempt < EtherscanService.MAX_RETRIES) {
          await delay(EtherscanService.RETRY_DELAY_MS);
        } else {
          throw error;
        }
      }
    }

    return [];
  }

  async syncTransactions(walletAddress: string, startBlock: number): Promise<void> {
    const { firstSyncedBlock, lastSyncedBlock } = await this.db.getSyncStatus(walletAddress);
    const latestBlock = await this.getLatestBlockNumber();

    if (firstSyncedBlock > 0 && startBlock < firstSyncedBlock) {
      await this.syncBlockRange(walletAddress, startBlock, firstSyncedBlock - 1, 'transactions');
    }

    const forwardStart = lastSyncedBlock > 0 ? lastSyncedBlock + 1 : startBlock;
    if (forwardStart <= latestBlock) {
      await this.syncBlockRange(walletAddress, forwardStart, latestBlock, 'transactions');
    }
  }

  private async syncBlockRange(
    walletAddress: string,
    fromBlock: number,
    toBlock: number,
    type: 'transactions' | 'tokens',
  ): Promise<void> {
    let currentBlock = fromBlock;

    while (currentBlock <= toBlock) {
      const endBlock = Math.min(currentBlock + EtherscanService.BLOCK_CHUNK_SIZE - 1, toBlock);

      if (type === 'transactions') {
        const transactions = await this.fetchTransactionRange(walletAddress, currentBlock, endBlock);
        if (transactions.length > 0) {
          await this.db.saveTransactions(transactions);
        }
        await this.db.updateSyncStatus(walletAddress, currentBlock, endBlock, transactions.length);
        if (transactions.length === EtherscanService.API_PAGE_SIZE) {
          console.warn(`Hit 10k limit for block range ${currentBlock}-${endBlock}, some transactions may be missing`);
        }
      } else {
        const transfers = await this.fetchTokenTransferRange(walletAddress, currentBlock, endBlock);
        if (transfers.length > 0) {
          await this.db.saveTokenTransfers(transfers);
        }
        await this.db.updateTokenSyncStatus(walletAddress, currentBlock, endBlock, transfers.length);
        if (transfers.length === EtherscanService.API_PAGE_SIZE) {
          console.warn(
            `Hit 10k limit for token block range ${currentBlock}-${endBlock}, some transfers may be missing`,
          );
        }
      }

      currentBlock = endBlock + 1;
      await delay(EtherscanService.CHUNK_DELAY_MS);
    }
  }

  async getTransactions(
    walletAddress: string,
    startBlock: number,
    page: number = 1,
    limit: number = 100,
  ): Promise<PaginatedTransactions> {
    await this.syncTransactions(walletAddress, startBlock);
    return await this.db.getTransactions(walletAddress, startBlock, undefined, page, limit);
  }

  async getBalanceAtDate(walletAddress: string, date: string): Promise<string> {
    if (!this.rpcUrl) {
      throw new Error('RPC_URL is required for historical balance lookups');
    }

    const targetDate = new Date(date + 'T00:00:00.000Z');
    if (isNaN(targetDate.getTime())) {
      throw new Error('Invalid date format. Please use YYYY-MM-DD');
    }

    const snapshot = await this.db.getBalanceSnapshot(walletAddress, date);
    if (snapshot) {
      return snapshot.balance;
    }

    const blockNumber = await this.getBlockNumberByTimestamp(targetDate);
    const balanceWei = await this.getBalanceAtBlock(walletAddress, blockNumber);
    const balanceStr = weiToEth(balanceWei);

    await this.db.saveBalanceSnapshot(walletAddress, date, balanceStr);

    return balanceStr;
  }

  private async getBlockNumberByTimestamp(date: Date): Promise<number> {
    const timestamp = Math.floor(date.getTime() / 1000);
    const url = this.buildUrl({
      module: 'block',
      action: 'getblocknobytime',
      timestamp: timestamp.toString(),
      closest: 'before',
    });

    const response = await fetchWithTimeout(url);
    const data = await response.json();

    if (data.status !== '1') {
      throw new Error(data.message || 'Failed to get block number for date');
    }

    return parseInt(data.result);
  }

  private async getBalanceAtBlock(walletAddress: string, blockNumber: number): Promise<bigint> {
    const blockHex = '0x' + blockNumber.toString(16);
    const rpcResponse = await fetch(this.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getBalance',
        params: [walletAddress, blockHex],
      }),
    });

    const data = await rpcResponse.json();

    if (data.error) {
      throw new Error(data.error.message || 'Failed to get balance from RPC');
    }

    return BigInt(data.result);
  }

  private async fetchTokenTransferRange(
    walletAddress: string,
    startBlock: number,
    endBlock: number,
  ): Promise<EtherscanTokenTransaction[]> {
    const url = this.buildUrl({
      module: 'account',
      action: 'tokentx',
      address: walletAddress,
      startblock: startBlock.toString(),
      endblock: endBlock.toString(),
      page: '1',
      offset: EtherscanService.API_PAGE_SIZE.toString(),
      sort: 'asc',
    });

    for (let attempt = 1; attempt <= EtherscanService.MAX_RETRIES; attempt++) {
      try {
        const response = await fetchWithTimeout(url);
        const data: EtherscanResponse = await response.json();

        if (data.status !== '1') {
          if (data.message === 'No transactions found') {
            return [];
          }
          if (data.result && typeof data.result === 'string' && data.result.includes('rate limit')) {
            await delay(EtherscanService.RATE_LIMIT_DELAY_MS);
            continue;
          }
          throw new Error(data.message || 'Failed to fetch token transfers');
        }

        return data.result as EtherscanTokenTransaction[];
      } catch (error) {
        if (attempt < EtherscanService.MAX_RETRIES) {
          await delay(EtherscanService.RETRY_DELAY_MS);
        } else {
          throw error;
        }
      }
    }

    return [];
  }

  async syncTokenTransfers(walletAddress: string, startBlock: number): Promise<void> {
    const { firstSyncedBlock, lastSyncedBlock } = await this.db.getTokenSyncStatus(walletAddress);
    const latestBlock = await this.getLatestBlockNumber();

    if (firstSyncedBlock > 0 && startBlock < firstSyncedBlock) {
      await this.syncBlockRange(walletAddress, startBlock, firstSyncedBlock - 1, 'tokens');
    }

    const forwardStart = lastSyncedBlock > 0 ? lastSyncedBlock + 1 : startBlock;
    if (forwardStart <= latestBlock) {
      await this.syncBlockRange(walletAddress, forwardStart, latestBlock, 'tokens');
    }
  }

  async getTokenTransfers(
    walletAddress: string,
    startBlock: number,
    page: number = 1,
    limit: number = 100,
  ): Promise<PaginatedTokenTransfers> {
    await this.syncTokenTransfers(walletAddress, startBlock);
    return await this.db.getTokenTransfers(walletAddress, startBlock, page, limit);
  }
}
