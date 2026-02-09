DROP TABLE IF EXISTS balance_snapshots CASCADE;
DROP TABLE IF EXISTS wallet_sync_status CASCADE;
DROP TABLE IF EXISTS transactions CASCADE;

CREATE TABLE transactions (
    id SERIAL PRIMARY KEY,
    hash VARCHAR(66) UNIQUE NOT NULL,
    block_number BIGINT NOT NULL,
    from_address VARCHAR(42) NOT NULL,
    to_address VARCHAR(42),
    value NUMERIC(78, 0) NOT NULL,
    gas_used BIGINT,
    gas_price NUMERIC(78, 0),
    timestamp TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_transactions_from_address ON transactions(from_address);
CREATE INDEX idx_transactions_to_address ON transactions(to_address);
CREATE INDEX idx_transactions_block_number ON transactions(block_number);
CREATE INDEX idx_transactions_timestamp ON transactions(timestamp);
CREATE INDEX idx_transactions_from_block ON transactions(from_address, block_number);
CREATE INDEX idx_transactions_to_block ON transactions(to_address, block_number);
CREATE INDEX idx_transactions_from_to ON transactions(from_address, to_address);

CREATE TABLE wallet_sync_status (
    wallet_address VARCHAR(42) PRIMARY KEY,
    first_synced_block BIGINT NOT NULL DEFAULT 0,
    last_synced_block BIGINT NOT NULL DEFAULT 0,
    last_synced_at TIMESTAMP DEFAULT NOW(),
    total_transactions INTEGER DEFAULT 0
);

CREATE TABLE balance_snapshots (
    id SERIAL PRIMARY KEY,
    wallet_address VARCHAR(42) NOT NULL,
    snapshot_date DATE NOT NULL,
    balance NUMERIC(78, 18) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(wallet_address, snapshot_date)
);

CREATE INDEX idx_balance_snapshots_wallet_date ON balance_snapshots(wallet_address, snapshot_date);

DROP TABLE IF EXISTS wallet_token_sync_status CASCADE;
DROP TABLE IF EXISTS token_transfers CASCADE;

CREATE TABLE token_transfers (
    id SERIAL PRIMARY KEY,
    hash VARCHAR(66) NOT NULL,
    block_number BIGINT NOT NULL,
    from_address VARCHAR(42) NOT NULL,
    to_address VARCHAR(42),
    contract_address VARCHAR(42) NOT NULL,
    token_name VARCHAR(200),
    token_symbol VARCHAR(50),
    token_decimal INTEGER NOT NULL DEFAULT 18,
    value NUMERIC(78, 0) NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(hash, from_address, to_address, contract_address)
);

CREATE INDEX idx_token_transfers_from_address ON token_transfers(from_address);
CREATE INDEX idx_token_transfers_to_address ON token_transfers(to_address);
CREATE INDEX idx_token_transfers_contract ON token_transfers(contract_address);
CREATE INDEX idx_token_transfers_block_number ON token_transfers(block_number);
CREATE INDEX idx_token_transfers_timestamp ON token_transfers(timestamp);
CREATE INDEX idx_token_transfers_from_block ON token_transfers(from_address, block_number);
CREATE INDEX idx_token_transfers_to_block ON token_transfers(to_address, block_number);

CREATE TABLE wallet_token_sync_status (
    wallet_address VARCHAR(42) PRIMARY KEY,
    first_synced_block BIGINT NOT NULL DEFAULT 0,
    last_synced_block BIGINT NOT NULL DEFAULT 0,
    last_synced_at TIMESTAMP DEFAULT NOW(),
    total_transfers INTEGER DEFAULT 0
);
