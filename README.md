# Ethereum Transactions Crawler

A high-performance TypeScript application that fetches and displays Ethereum transaction data using the Etherscan API with PostgreSQL caching for optimal performance.

## Features

- Fetch all ETH transactions for any wallet address
- ERC-20 token transfer tracking
- Smart caching with PostgreSQL - subsequent queries are 20-100x faster
- Incremental sync - only fetches new transactions since last query
- Balance at date - calculate ETH balance at any specific date
- Clean, responsive web interface
- RESTful API endpoints

## Tech Stack

- **Backend**: Node.js, Express, TypeScript
- **Database**: PostgreSQL (transaction caching & indexing)
- **Frontend**: Vanilla JavaScript, HTML, CSS
- **API**: Etherscan API v2
- **Build**: TypeScript Compiler

## Quick Start

### Option 1: Docker (Recommended - Easiest Setup)

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
4. Click "Search Transactions"

**Balance at Date:**
- Use the "Balance at Date" section
- Enter wallet address and date (YYYY-MM-DD)
- Click "Calculate Balance"

### API Endpoints

All endpoints support `page` and `limit` query parameters for pagination.

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
│   ├── index.ts                    # Express server
│   ├── types/index.ts              # TypeScript interfaces
│   ├── services/
│   │   ├── database.service.ts    # PostgreSQL service
│   │   └── etherscan.service.ts   # Etherscan API + smart sync
│   ├── routes/
│   │   └── transactions.routes.ts # API routes
│   └── utils/
│       └── conversion.utils.ts    # Wei/ETH conversion (BigInt)
├── public/
│   ├── index.html                 # Web interface
│   ├── styles.css                 # Styling
│   └── script.js                  # Frontend logic
├── scripts/
│   └── setup-db.sh                # Database setup script
├── schema.sql                     # Database schema
└── package.json
```

## Troubleshooting

Database issues: run `npm run db:setup` - the script detects problems and prints fix instructions.

Etherscan API rate limit: 5 calls/second (free tier). Cached queries don't hit the API.

## Known Limitations

- **Gas fees**: Not included in balance calculations
- **Internal transactions**: Not included
- **10k limit per 100k blocks**: Extremely rare edge case for very active wallets

## License

ISC
