import { Router, type Request, type Response } from 'express';
import { EtherscanService } from '../services/etherscan.service.js';

const ETH_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

function validateWalletAddress(walletAddress: unknown): walletAddress is string {
  return typeof walletAddress === 'string' && ETH_ADDRESS_REGEX.test(walletAddress);
}

function validateStartBlock(startBlock: unknown): boolean {
  return startBlock !== undefined && !isNaN(Number(startBlock));
}

const DEFAULT_PAGE_LIMIT = 100;
const MAX_PAGE_LIMIT = 500;

function parsePagination(query: Request['query']) {
  return {
    page: Math.max(1, Number(query.page) || 1),
    limit: Math.min(MAX_PAGE_LIMIT, Math.max(1, Number(query.limit) || DEFAULT_PAGE_LIMIT)),
  };
}

export function createTransactionRoutes(etherscanService: EtherscanService): Router {
  const router = Router();

  router.get('/transactions', async (req: Request, res: Response) => {
    try {
      const { walletAddress, startBlock } = req.query;

      if (!validateWalletAddress(walletAddress)) {
        return res.status(400).json({
          error: 'walletAddress is required and must be a valid Ethereum address',
        });
      }

      if (!validateStartBlock(startBlock)) {
        return res.status(400).json({
          error: 'startBlock is required and must be a number',
        });
      }

      const { page, limit } = parsePagination(req.query);

      const { transactions, total } = await etherscanService.getTransactions(
        walletAddress,
        Number(startBlock),
        page,
        limit,
      );

      res.json({
        success: true,
        walletAddress,
        startBlock: Number(startBlock),
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        transactionCount: transactions.length,
        transactions,
      });
    } catch (error) {
      console.error('Error in /api/transactions:', error);
      res.status(500).json({ error: 'Failed to fetch transactions' });
    }
  });

  router.get('/balance-at-date', async (req: Request, res: Response) => {
    try {
      const { walletAddress, date } = req.query;

      if (!validateWalletAddress(walletAddress)) {
        return res.status(400).json({
          error: 'walletAddress is required and must be a valid Ethereum address',
        });
      }

      if (!date || typeof date !== 'string') {
        return res.status(400).json({
          error: 'date is required (format: YYYY-MM-DD)',
        });
      }

      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({
          error: 'Invalid date format. Use YYYY-MM-DD',
        });
      }

      const balance = await etherscanService.getBalanceAtDate(walletAddress, date);

      res.json({
        success: true,
        walletAddress,
        date,
        balance,
        balanceETH: `${balance} ETH`,
      });
    } catch (error) {
      console.error('Error in /api/balance-at-date:', error);
      res.status(500).json({ error: 'Failed to calculate balance at date' });
    }
  });

  router.get('/token-transfers', async (req: Request, res: Response) => {
    try {
      const { walletAddress, startBlock } = req.query;

      if (!validateWalletAddress(walletAddress)) {
        return res.status(400).json({
          error: 'walletAddress is required and must be a valid Ethereum address',
        });
      }

      if (!validateStartBlock(startBlock)) {
        return res.status(400).json({
          error: 'startBlock is required and must be a number',
        });
      }

      const { page, limit } = parsePagination(req.query);

      const { transfers, total } = await etherscanService.getTokenTransfers(
        walletAddress,
        Number(startBlock),
        page,
        limit,
      );

      res.json({
        success: true,
        walletAddress,
        startBlock: Number(startBlock),
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        transferCount: transfers.length,
        transfers,
      });
    } catch (error) {
      console.error('Error in /api/token-transfers:', error);
      res.status(500).json({ error: 'Failed to fetch token transfers' });
    }
  });

  return router;
}
