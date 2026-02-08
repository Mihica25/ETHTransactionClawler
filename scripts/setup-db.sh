#!/bin/bash

echo "Setting up PostgreSQL database for Ethereum Transactions Crawler"
echo ""

if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
else
    echo "Error: .env file not found!"
    echo "  Please create .env file from .env.example"
    exit 1
fi

DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-5432}
DB_NAME=${DB_NAME:-eth_transactions}
DB_USER=${DB_USER:-postgres}

echo "Database Configuration:"
echo "  Host: $DB_HOST"
echo "  Port: $DB_PORT"
echo "  Database: $DB_NAME"
echo "  User: $DB_USER"
echo ""

if ! command -v psql &> /dev/null; then
    echo "Error: PostgreSQL is not installed!"
    echo ""
    echo "Install PostgreSQL:"
    echo "  Ubuntu/Debian: sudo apt-get install postgresql postgresql-contrib"
    echo "  macOS: brew install postgresql"
    echo "  Windows: Download from https://www.postgresql.org/download/windows/"
    exit 1
fi

if ! pg_isready -h $DB_HOST -p $DB_PORT &> /dev/null; then
    echo "Error: PostgreSQL is not running!"
    echo ""
    echo "Start PostgreSQL:"
    echo "  Ubuntu/Debian: sudo systemctl start postgresql"
    echo "  macOS: brew services start postgresql"
    echo "  Windows: Start from Services or pg_ctl start"
    exit 1
fi

echo "PostgreSQL is running"
echo ""

run_psql() {
    if [ -n "$DB_PASSWORD" ]; then
        PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER "$@"
    else
        psql -p $DB_PORT -U $DB_USER "$@"
    fi
}

echo "Testing database connection..."
if ! run_psql -d postgres -c "SELECT 1" &>/dev/null; then
    echo "Error: Cannot connect to PostgreSQL"
    echo ""
    echo "Fix: Set a password for your database user, then add it to .env:"
    echo ""
    echo "  sudo -u postgres psql -c \"ALTER USER $DB_USER PASSWORD 'yourpassword';\""
    echo "  Then set DB_PASSWORD=yourpassword in .env"
    echo ""
    echo "  Or, if you don't have a PostgreSQL user yet:"
    echo "  sudo -u postgres createuser --createdb $DB_USER"
    echo "  sudo -u postgres psql -c \"ALTER USER $DB_USER PASSWORD 'yourpassword';\""
    echo "  Then set DB_PASSWORD=yourpassword in .env"
    exit 1
fi

echo "Connected to PostgreSQL"
echo ""

echo "Creating database '$DB_NAME'..."

DB_EXISTS=$(run_psql -d postgres -tc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" 2>/dev/null | grep -q 1; echo $?)

if [ $DB_EXISTS -ne 0 ]; then
    if run_psql -d postgres -c "CREATE DATABASE $DB_NAME" 2>/dev/null; then
        echo "Database created successfully"
    else
        echo "Error: Failed to create database"
        echo ""
        echo "Your user may not have CREATE DATABASE permission. Try:"
        echo "  sudo -u postgres psql -c \"ALTER USER $DB_USER CREATEDB;\""
        exit 1
    fi
else
    echo "Database already exists"
fi

echo "Creating database schema..."
if run_psql -d $DB_NAME -f schema.sql 2>/dev/null; then
    echo "Schema created successfully"
else
    echo "Error: Failed to create schema"
    echo ""
    echo "Troubleshooting:"
    echo "  - Verify database connection settings in .env"
    echo "  - Try manually: psql $DB_NAME < schema.sql"
    exit 1
fi

echo ""
echo "Database setup complete!"
echo ""
echo "You can now start the application with: npm start"
