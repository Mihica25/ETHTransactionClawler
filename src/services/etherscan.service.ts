import type { EtherscanResponse, EtherscanTransaction, EtherscanTokenTransaction, TransactionDisplay, TokenTransferDisplay } from '../types/index.js';
import type { DatabaseService } from './database.service.js';

export class EtherscanService {
  private apiKey: string;
  private baseUrl: string = 'https://api.etherscan.io/v2/api';
  private db: DatabaseService;

  private static readonly FETCH_TIMEOUT_MS = 15000;

  constructor(apiKey: string, db: DatabaseService) {
    this.apiKey = apiKey;
    this.db = db;
  }

  private async fetchWithTimeout(url: string, timeoutMs: number = EtherscanService.FETCH_TIMEOUT_MS): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  private async getLatestBlockNumber(): Promise<number> {
    const url = `${this.baseUrl}?chainid=1&module=proxy&action=eth_blockNumber&apikey=${this.apiKey}`;
    const response = await this.fetchWithTimeout(url);
    const data = await response.json();
    return parseInt(data.result, 16);
  }

  private async fetchTransactionRange(
    walletAddress: string,
    startBlock: number,
    endBlock: number
  ): Promise<EtherscanTransaction[]> {
    const url = `${this.baseUrl}?chainid=1&module=account&action=txlist&address=${walletAddress}&startblock=${startBlock}&endblock=${endBlock}&page=1&offset=10000&sort=asc&apikey=${this.apiKey}`;

    const MAX_RETRIES = 3;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await this.fetchWithTimeout(url);
        const data: EtherscanResponse = await response.json();

        if (data.status !== '1') {
          if (data.message === 'No transactions found') {
            return [];
          }
          if (data.result && typeof data.result === 'string' && data.result.includes('rate limit')) {
            await this.delay(2000);
            continue;
          }
          throw new Error(data.message || 'Failed to fetch transactions');
        }

        return data.result as EtherscanTransaction[];
      } catch (error) {
        if (attempt < MAX_RETRIES) {
          await this.delay(3000);
        } else {
          throw error;
        }
      }
    }

    return [];
  }

  async syncTransactions(walletAddress: string, startBlock: number): Promise<void> {
    const lastSyncedBlock = await this.db.getLastSyncedBlock(walletAddress);
    const actualStartBlock = Math.max(startBlock, lastSyncedBlock + 1);

    const latestBlock = await this.getLatestBlockNumber();

    if (actualStartBlock > latestBlock) {
      return;
    }

    const BLOCK_CHUNK_SIZE = 100000;
    let currentBlock = actualStartBlock;

    while (currentBlock <= latestBlock) {
      const endBlock = Math.min(currentBlock + BLOCK_CHUNK_SIZE - 1, latestBlock);

      const transactions = await this.fetchTransactionRange(
        walletAddress,
        currentBlock,
        endBlock
      );

      if (transactions.length > 0) {
        await this.db.saveTransactions(transactions);
        await this.db.updateSyncStatus(walletAddress, endBlock, transactions.length);
      }

      if (transactions.length === 10000) {
        console.warn(`Hit 10k limit for block range ${currentBlock}-${endBlock}, some transactions may be missing`);
      }

      currentBlock = endBlock + 1;
      await this.delay(250);
    }
  }

  async getTransactions(
    walletAddress: string,
    startBlock: number,
    page: number = 1,
    limit: number = 100
  ): Promise<{ transactions: TransactionDisplay[]; total: number }> {
    await this.syncTransactions(walletAddress, startBlock);
    return await this.db.getTransactions(walletAddress, startBlock, undefined, page, limit);
  }

  async getBalanceAtDate(walletAddress: string, date: string): Promise<string> {
    const targetDate = new Date(date + 'T00:00:00.000Z');

    if (isNaN(targetDate.getTime())) {
      throw new Error('Invalid date format. Please use YYYY-MM-DD');
    }

    const snapshot = await this.db.getBalanceSnapshot(walletAddress, date);
    if (snapshot) {
      return snapshot.balance;
    }

    await this.syncTransactions(walletAddress, 0);

    const { received, sent } = await this.db.getBalanceSums(walletAddress, targetDate);
    const balanceWei = received - sent;
    const balanceStr = this.weiToEthBigInt(balanceWei);

    await this.db.saveBalanceSnapshot(walletAddress, date, balanceStr);

    return balanceStr;
  }

  private async fetchTokenTransferRange(
    walletAddress: string,
    startBlock: number,
    endBlock: number
  ): Promise<EtherscanTokenTransaction[]> {
    const url = `${this.baseUrl}?chainid=1&module=account&action=tokentx&address=${walletAddress}&startblock=${startBlock}&endblock=${endBlock}&page=1&offset=10000&sort=asc&apikey=${this.apiKey}`;

    const MAX_RETRIES = 3;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await this.fetchWithTimeout(url);
        const data: EtherscanResponse = await response.json();

        if (data.status !== '1') {
          if (data.message === 'No transactions found') {
            return [];
          }
          if (data.result && typeof data.result === 'string' && data.result.includes('rate limit')) {
            await this.delay(2000);
            continue;
          }
          throw new Error(data.message || 'Failed to fetch token transfers');
        }

        return data.result as EtherscanTokenTransaction[];
      } catch (error) {
        if (attempt < MAX_RETRIES) {
          await this.delay(3000);
        } else {
          throw error;
        }
      }
    }

    return [];
  }

  async syncTokenTransfers(walletAddress: string, startBlock: number): Promise<void> {
    const lastSyncedBlock = await this.db.getLastTokenSyncedBlock(walletAddress);
    const actualStartBlock = Math.max(startBlock, lastSyncedBlock + 1);

    const latestBlock = await this.getLatestBlockNumber();

    if (actualStartBlock > latestBlock) {
      return;
    }

    const BLOCK_CHUNK_SIZE = 100000;
    let currentBlock = actualStartBlock;

    while (currentBlock <= latestBlock) {
      const endBlock = Math.min(currentBlock + BLOCK_CHUNK_SIZE - 1, latestBlock);

      const transfers = await this.fetchTokenTransferRange(
        walletAddress,
        currentBlock,
        endBlock
      );

      if (transfers.length > 0) {
        await this.db.saveTokenTransfers(transfers);
        await this.db.updateTokenSyncStatus(walletAddress, endBlock, transfers.length);
      }

      if (transfers.length === 10000) {
        console.warn(`Hit 10k limit for token block range ${currentBlock}-${endBlock}, some transfers may be missing`);
      }

      currentBlock = endBlock + 1;
      await this.delay(250);
    }
  }

  async getTokenTransfers(
    walletAddress: string,
    startBlock: number,
    page: number = 1,
    limit: number = 100
  ): Promise<{ transfers: TokenTransferDisplay[]; total: number }> {
    await this.syncTokenTransfers(walletAddress, startBlock);
    return await this.db.getTokenTransfers(walletAddress, startBlock, page, limit);
  }

  private weiToEthBigInt(wei: bigint): string {
    const divisor = 10n ** 18n;
    const whole = wei / divisor;
    const remainder = wei % divisor;
    const isNegative = wei < 0n;
    const absRemainder = remainder < 0n ? -remainder : remainder;
    const decimalStr = absRemainder.toString().padStart(18, '0').slice(0, 6);
    const sign = isNegative && whole === 0n ? '-' : '';
    return `${sign}${whole}.${decimalStr}`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
