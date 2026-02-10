# Ethereum Transactions Crawler

A high-performance TypeScript application that crawls, caches, and displays Ethereum transaction data. Uses the Etherscan API for transaction indexing and an Ethereum RPC node (Alchemy) for historical balance lookups, with PostgreSQL for persistent caching.

## Features

- Fetch all ETH transactions for any wallet address from a given block
- ERC-20 token transfer tracking with decimal-aware formatting
- Historical balance lookup — get ETH balance at any past date via RPC
- Smart bidirectional sync — fills gaps both forward and backward from previously synced ranges
- PostgreSQL caching — subsequent queries skip the API entirely
- Paginated API responses with configurable page size
- Clean, responsive web interface
- Rate limiting and security headers (Helmet)

## Tech Stack

- **Backend**: Node.js, Express 5, TypeScript
- **Database**: PostgreSQL (transaction caching & indexing)
- **Frontend**: Vanilla JavaScript, HTML, CSS
- **APIs**: Etherscan API v2 (transactions), Ethereum JSON-RPC (balances)
- **Security**: Helmet, express-rate-limit
- **Build**: TypeScript Compiler

## Quick Start

### Option 1: Docker (Recommended)

**Prerequisites:** Docker and Docker Compose installed

```bash
# 1. Clone and navigate to project
cd eth-transactions-crawler

# 2. Set your Etherscan API key
echo "ETHERSCAN_API_KEY=your_actual_api_key" > .env.docker

# 3. Start everything with one command
docker-compose up
```

That's it! Server runs at **http://localhost:3000**

Database is automatically configured and ready to use.

### Option 2: Manual Installation

**Prerequisites:** Node.js 18+, PostgreSQL 12+

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env and set:
#   - ETHERSCAN_API_KEY (get free at etherscan.io)
#   - RPC_URL (get from Alchemy — required for balance-at-date)
#   - DB_USER (run 'whoami' to see your username)
#   - DB_PASSWORD (leave empty for Linux/macOS peer auth)

# 3. Setup database (creates tables and indexes)
npm run db:setup

# 4. Build and run
npm run build
npm start
```

Server will start at **http://localhost:3000**

## Usage

### Web Interface

1. Open `http://localhost:3000` in your browser
2. Enter a wallet address (e.g., `0xaa7a9ca87d3694b5755f213b5d04094b8d0f0a6f`)
3. Enter starting block number (e.g., `9000000`)
4. Click "Search Transactions" or "Search Token Transfers"

**Balance at Date:**
- Enter wallet address and date (YYYY-MM-DD)
- Click "Calculate Balance"
- Requires `RPC_URL` to be configured

### API Endpoints

All endpoints support `page` and `limit` query parameters for pagination (max 500).

**Get Transactions:**
```
GET /api/transactions?walletAddress=0x...&startBlock=9000000&page=1&limit=100
```

**Get Token Transfers:**
```
GET /api/token-transfers?walletAddress=0x...&startBlock=9000000&page=1&limit=100
```

**Get Balance at Date:**
```
GET /api/balance-at-date?walletAddress=0x...&date=2020-01-01
```

**Health Check:**
```
GET /health
```

## Development

```bash
# Development mode with auto-reload
npm run dev

# Build TypeScript
npm run build

# Clean build artifacts
npm run clean

# Reset and setup database
npm run db:setup
```

## Project Structure

```
eth-transactions-crawler/
├── src/
│   ├── index.ts                    # Express server setup
│   ├── types/index.ts              # TypeScript interfaces
│   ├── services/
│   │   ├── database.service.ts     # PostgreSQL queries (raw SQL)
│   │   └── etherscan.service.ts    # Etherscan API + sync logic
│   ├── routes/
│   │   └── transactions.routes.ts  # API route handlers
│   └── utils/
│       ├── conversion.utils.ts     # Wei/ETH & token decimal conversion
│       └── http.utils.ts           # Fetch with timeout & delay helpers
├── public/
│   ├── index.html                  # Web interface
│   ├── styles.css                  # Styling
│   └── script.js                   # Frontend logic
├── scripts/
│   └── setup-db.sh                 # Database setup script
├── schema.sql                      # Database schema (5 tables)
└── package.json
```

## Database Schema

- **transactions** — ETH transactions (hash, from, to, value, gas, timestamp)
- **token_transfers** — ERC-20 transfers (hash, from, to, contract, token info, value)
- **wallet_sync_status** — Per-wallet sync tracking for ETH transactions
- **wallet_token_sync_status** — Per-wallet sync tracking for token transfers
- **balance_snapshots** — Cached historical balance lookups

## Troubleshooting

**Database issues:** Run `npm run db:setup` — the script detects problems and prints fix instructions.

**Etherscan API rate limit:** 5 calls/second on free tier. Cached queries don't hit the API.

**Balance-at-date not working:** Make sure `RPC_URL` is set in `.env`. You need an Alchemy (or similar) endpoint that supports `eth_getBalance` with a block parameter.

## Known Limitations

- **Gas fees**: Not included in balance calculations (balance uses on-chain `eth_getBalance`)
- **Internal transactions**: Not tracked
- **10k limit per 100k blocks**: For extremely active wallets, some transactions in a chunk may be missed (warning is logged)

## License

ISC
