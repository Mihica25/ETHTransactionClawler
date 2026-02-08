import { Pool } from 'pg';
import type { EtherscanTransaction, EtherscanTokenTransaction, TransactionDisplay, TokenTransferDisplay } from '../types/index.js';
import { weiToEth, tokenAmountToDecimal } from '../utils/conversion.utils.js';

export class DatabaseService {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME || 'eth_transactions',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    this.pool.on('error', (err) => {
      console.error('Unexpected database error:', err);
    });
  }

  async testConnection(): Promise<boolean> {
    try {
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();
      return true;
    } catch (error) {
      console.error('Database connection failed:', error);
      return false;
    }
  }

  async saveTransactions(transactions: EtherscanTransaction[]): Promise<void> {
    if (transactions.length === 0) return;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const BATCH_SIZE = 500;
      for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
        const batch = transactions.slice(i, i + BATCH_SIZE);
        const values: any[] = [];
        const valuePlaceholders: string[] = [];
        let paramIndex = 1;

        for (const tx of batch) {
          valuePlaceholders.push(
            `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6}, to_timestamp($${paramIndex + 7}))`
          );
          values.push(
            tx.hash,
            parseInt(tx.blockNumber),
            tx.from.toLowerCase(),
            tx.to ? tx.to.toLowerCase() : null,
            tx.value,
            parseInt(tx.gasUsed),
            tx.gasPrice,
            parseInt(tx.timeStamp)
          );
          paramIndex += 8;
        }

        const query = `
          INSERT INTO transactions
          (hash, block_number, from_address, to_address, value, gas_used, gas_price, timestamp)
          VALUES ${valuePlaceholders.join(', ')}
          ON CONFLICT (hash) DO NOTHING
        `;

        await client.query(query, values);
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getLastSyncedBlock(walletAddress: string): Promise<number> {
    const result = await this.pool.query(
      `SELECT last_synced_block FROM wallet_sync_status WHERE wallet_address = $1`,
      [walletAddress.toLowerCase()]
    );
    return result.rows[0]?.last_synced_block || 0;
  }

  async updateSyncStatus(walletAddress: string, blockNumber: number, transactionCount: number): Promise<void> {
    await this.pool.query(
      `INSERT INTO wallet_sync_status (wallet_address, last_synced_block, total_transactions, last_synced_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (wallet_address)
       DO UPDATE SET
         last_synced_block = $2,
         total_transactions = wallet_sync_status.total_transactions + $3,
         last_synced_at = NOW()`,
      [walletAddress.toLowerCase(), blockNumber, transactionCount]
    );
  }

  async getTransactions(
    walletAddress: string,
    startBlock: number,
    endBlock?: number,
    page: number = 1,
    limit: number = 100
  ): Promise<{ transactions: TransactionDisplay[]; total: number }> {
    const lowerAddress = walletAddress.toLowerCase();
    const offset = (page - 1) * limit;

    let whereClause = `WHERE (from_address = $1 OR to_address = $1) AND block_number >= $2`;
    const params: (string | number)[] = [lowerAddress, startBlock];

    if (endBlock) {
      whereClause += ` AND block_number <= $3`;
      params.push(endBlock);
    }

    const countResult = await this.pool.query(
      `SELECT COUNT(*) FROM transactions ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    const nextParam = params.length + 1;
    const dataResult = await this.pool.query(
      `SELECT hash, block_number as "blockNumber", from_address as "from", to_address as "to", value, timestamp
       FROM transactions ${whereClause}
       ORDER BY block_number ASC, timestamp ASC
       LIMIT $${nextParam} OFFSET $${nextParam + 1}`,
      [...params, limit, offset]
    );

    const transactions = dataResult.rows.map(row => ({
      hash: row.hash,
      blockNumber: row.blockNumber.toString(),
      from: row.from,
      to: row.to || '',
      ethAmount: weiToEth(row.value),
      timestamp: row.timestamp.toISOString(),
    }));

    return { transactions, total };
  }

  async saveBalanceSnapshot(walletAddress: string, date: string, balance: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO balance_snapshots (wallet_address, snapshot_date, balance)
       VALUES ($1, $2, $3)
       ON CONFLICT (wallet_address, snapshot_date)
       DO UPDATE SET balance = $3, created_at = NOW()`,
      [walletAddress.toLowerCase(), date, balance]
    );
  }

  async getBalanceSnapshot(walletAddress: string, date: string): Promise<{ balance: string } | null> {
    const result = await this.pool.query(
      `SELECT balance::text FROM balance_snapshots WHERE wallet_address = $1 AND snapshot_date = $2`,
      [walletAddress.toLowerCase(), date]
    );

    if (result.rows.length > 0) {
      return { balance: result.rows[0].balance };
    }

    return null;
  }

  async getBalanceSums(walletAddress: string, targetDate: Date): Promise<{ received: bigint; sent: bigint }> {
    const lowerAddress = walletAddress.toLowerCase();

    const result = await this.pool.query(
      `SELECT
        COALESCE(SUM(CASE WHEN to_address = $1 THEN value ELSE 0 END), 0)::text AS received,
        COALESCE(SUM(CASE WHEN from_address = $1 THEN value ELSE 0 END), 0)::text AS sent
       FROM transactions
       WHERE (from_address = $1 OR to_address = $1)
         AND timestamp < $2`,
      [lowerAddress, targetDate]
    );

    return {
      received: BigInt(result.rows[0]?.received ?? '0'),
      sent: BigInt(result.rows[0]?.sent ?? '0'),
    };
  }

  async saveTokenTransfers(transfers: EtherscanTokenTransaction[]): Promise<void> {
    if (transfers.length === 0) return;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const BATCH_SIZE = 500;
      for (let i = 0; i < transfers.length; i += BATCH_SIZE) {
        const batch = transfers.slice(i, i + BATCH_SIZE);
        const values: any[] = [];
        const valuePlaceholders: string[] = [];
        let paramIndex = 1;

        for (const tx of batch) {
          valuePlaceholders.push(
            `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6}, $${paramIndex + 7}, $${paramIndex + 8}, to_timestamp($${paramIndex + 9}))`
          );
          values.push(
            tx.hash,
            parseInt(tx.blockNumber),
            tx.from.toLowerCase(),
            tx.to ? tx.to.toLowerCase() : null,
            tx.contractAddress.toLowerCase(),
            tx.tokenName,
            tx.tokenSymbol,
            parseInt(tx.tokenDecimal),
            tx.value,
            parseInt(tx.timeStamp)
          );
          paramIndex += 10;
        }

        const query = `
          INSERT INTO token_transfers
          (hash, block_number, from_address, to_address, contract_address, token_name, token_symbol, token_decimal, value, timestamp)
          VALUES ${valuePlaceholders.join(', ')}
          ON CONFLICT (hash, from_address, to_address, contract_address) DO NOTHING
        `;

        await client.query(query, values);
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getLastTokenSyncedBlock(walletAddress: string): Promise<number> {
    const result = await this.pool.query(
      `SELECT last_synced_block FROM wallet_token_sync_status WHERE wallet_address = $1`,
      [walletAddress.toLowerCase()]
    );
    return result.rows[0]?.last_synced_block || 0;
  }

  async updateTokenSyncStatus(walletAddress: string, blockNumber: number, transferCount: number): Promise<void> {
    await this.pool.query(
      `INSERT INTO wallet_token_sync_status (wallet_address, last_synced_block, total_transfers, last_synced_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (wallet_address)
       DO UPDATE SET
         last_synced_block = $2,
         total_transfers = wallet_token_sync_status.total_transfers + $3,
         last_synced_at = NOW()`,
      [walletAddress.toLowerCase(), blockNumber, transferCount]
    );
  }

  async getTokenTransfers(
    walletAddress: string,
    startBlock: number,
    page: number = 1,
    limit: number = 100
  ): Promise<{ transfers: TokenTransferDisplay[]; total: number }> {
    const lowerAddress = walletAddress.toLowerCase();
    const offset = (page - 1) * limit;

    const whereClause = `WHERE (from_address = $1 OR to_address = $1) AND block_number >= $2`;

    const countResult = await this.pool.query(
      `SELECT COUNT(*) FROM token_transfers ${whereClause}`,
      [lowerAddress, startBlock]
    );
    const total = parseInt(countResult.rows[0].count);

    const dataResult = await this.pool.query(
      `SELECT hash, block_number as "blockNumber", from_address as "from", to_address as "to",
              contract_address as "contractAddress", token_name as "tokenName",
              token_symbol as "tokenSymbol", token_decimal as "tokenDecimal", value, timestamp
       FROM token_transfers ${whereClause}
       ORDER BY block_number ASC, timestamp ASC
       LIMIT $3 OFFSET $4`,
      [lowerAddress, startBlock, limit, offset]
    );

    const transfers = dataResult.rows.map(row => ({
      hash: row.hash,
      blockNumber: row.blockNumber.toString(),
      from: row.from,
      to: row.to || '',
      tokenAmount: tokenAmountToDecimal(row.value, row.tokenDecimal),
      tokenSymbol: row.tokenSymbol || '',
      tokenName: row.tokenName || '',
      contractAddress: row.contractAddress,
      timestamp: row.timestamp.toISOString(),
    }));

    return { transfers, total };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
