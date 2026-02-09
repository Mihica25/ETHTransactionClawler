import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { DatabaseService } from './services/database.service.js';
import { EtherscanService } from './services/etherscan.service.js';
import { createTransactionRoutes } from './routes/transactions.routes.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

const apiKey = process.env.ETHERSCAN_API_KEY;
if (!apiKey) {
  console.error('ETHERSCAN_API_KEY is not set in .env file');
  process.exit(1);
}

app.use(helmet());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

const db = new DatabaseService();
const etherscanService = new EtherscanService(apiKey, db);

const connected = await db.testConnection();
if (!connected) {
  console.error('Failed to connect to database. Check DB configuration or run: npm run db:setup');
  process.exit(1);
}

const apiLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
  max: Number(process.env.RATE_LIMIT_MAX) || 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

app.use('/api', apiLimiter, createTransactionRoutes(etherscanService));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

process.on('SIGTERM', async () => {
  await db.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await db.close();
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
