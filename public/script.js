let txState = { page: 1, totalPages: 0, total: 0 };
let tokenState = { page: 1, totalPages: 0, total: 0 };
let currentParams = { walletAddress: '', startBlock: '' };
const PAGE_LIMIT = 100;

async function fetchTransactions() {
    const walletAddress = document.getElementById('walletAddress').value.trim();
    const startBlock = document.getElementById('startBlock').value.trim();

    hideElement('error');
    hideElement('results');
    hideElement('tokenResults');

    if (!walletAddress) {
        showError('Please enter a wallet address');
        return;
    }

    if (!startBlock || isNaN(startBlock)) {
        showError('Please enter a valid start block number');
        return;
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
        showError('Invalid Ethereum address format. Must start with 0x and be 42 characters long.');
        return;
    }

    currentParams = { walletAddress, startBlock };
    txState = { page: 1, totalPages: 0, total: 0 };
    tokenState = { page: 1, totalPages: 0, total: 0 };

    showElement('loading');

    try {
        const params = `walletAddress=${encodeURIComponent(walletAddress)}&startBlock=${startBlock}&page=1&limit=${PAGE_LIMIT}`;

        const [txResponse, tokenResponse] = await Promise.all([
            fetch(`/api/transactions?${params}`),
            fetch(`/api/token-transfers?${params}`)
        ]);

        if (!txResponse.ok) {
            const errorData = await txResponse.json();
            throw new Error(errorData.error || 'Failed to fetch transactions');
        }

        const txData = await txResponse.json();
        const tokenData = tokenResponse.ok ? await tokenResponse.json() : null;

        hideElement('loading');
        displayResults(txData);

        if (tokenData && tokenData.success) {
            displayTokenResults(tokenData);
        }

    } catch (error) {
        hideElement('loading');
        showError(`Error: ${error.message}`);
    }
}

function displayResults(data) {
    const { walletAddress, startBlock, total, page, totalPages, transactionCount, transactions } = data;

    txState = { page, totalPages, total };

    const info = document.getElementById('resultsInfo');
    info.textContent = '';
    appendInfoText(info, 'Wallet: ', truncateAddress(walletAddress));
    appendInfoText(info, ' | From Block: ', startBlock.toLocaleString());
    appendInfoText(info, ' | Total Transactions: ', total.toLocaleString());

    const tbody = document.getElementById('transactionsBody');
    tbody.innerHTML = '';

    if (transactions.length === 0) {
        const row = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 6;
        td.style.textAlign = 'center';
        td.style.padding = '40px';
        td.textContent = 'No transactions found';
        row.appendChild(td);
        tbody.appendChild(row);
    } else {
        transactions.forEach(tx => {
            const row = document.createElement('tr');
            row.appendChild(createTd(parseInt(tx.blockNumber).toLocaleString()));
            row.appendChild(createHashTd(tx.hash));
            row.appendChild(createTd(truncateAddress(tx.from), 'address'));
            row.appendChild(createTd(truncateAddress(tx.to), 'address'));
            row.appendChild(createTd(parseFloat(tx.ethAmount).toFixed(4) + ' ETH', 'eth-amount'));
            row.appendChild(createTd(formatDate(tx.timestamp)));
            tbody.appendChild(row);
        });
    }

    showElement('results');
    updateTxPagination();
}

function displayTokenResults(data) {
    const { walletAddress, startBlock, total, page, totalPages, transferCount, transfers } = data;

    tokenState = { page, totalPages, total };

    const tokenInfo = document.getElementById('tokenResultsInfo');
    tokenInfo.textContent = '';
    appendInfoText(tokenInfo, 'Wallet: ', truncateAddress(walletAddress));
    appendInfoText(tokenInfo, ' | From Block: ', startBlock.toLocaleString());
    appendInfoText(tokenInfo, ' | Total Token Transfers: ', total.toLocaleString());

    const tbody = document.getElementById('tokenTransfersBody');
    tbody.innerHTML = '';

    if (transfers.length === 0) {
        const row = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 7;
        td.style.textAlign = 'center';
        td.style.padding = '40px';
        td.textContent = 'No token transfers found';
        row.appendChild(td);
        tbody.appendChild(row);
    } else {
        transfers.forEach(tx => {
            const row = document.createElement('tr');
            row.appendChild(createTd(parseInt(tx.blockNumber).toLocaleString()));
            row.appendChild(createHashTd(tx.hash));
            row.appendChild(createTd(truncateAddress(tx.from), 'address'));
            row.appendChild(createTd(truncateAddress(tx.to), 'address'));
            row.appendChild(createTd(tx.tokenAmount, 'eth-amount'));
            const tokenTd = createTd(tx.tokenSymbol);
            tokenTd.title = tx.tokenName || '';
            row.appendChild(tokenTd);
            row.appendChild(createTd(formatDate(tx.timestamp)));
            tbody.appendChild(row);
        });
    }

    showElement('tokenResults');
    updateTokenPagination();
}

function updateTxPagination() {
    if (txState.totalPages <= 1) {
        hideElement('txPagination');
        return;
    }
    document.getElementById('txPageInfo').textContent = `Page ${txState.page} of ${txState.totalPages}`;
    document.getElementById('txPrev').disabled = txState.page <= 1;
    document.getElementById('txNext').disabled = txState.page >= txState.totalPages;
    showElement('txPagination');
}

function updateTokenPagination() {
    if (tokenState.totalPages <= 1) {
        hideElement('tokenPagination');
        return;
    }
    document.getElementById('tokenPageInfo').textContent = `Page ${tokenState.page} of ${tokenState.totalPages}`;
    document.getElementById('tokenPrev').disabled = tokenState.page <= 1;
    document.getElementById('tokenNext').disabled = tokenState.page >= tokenState.totalPages;
    showElement('tokenPagination');
}

async function changeTxPage(delta) {
    const newPage = txState.page + delta;
    if (newPage < 1 || newPage > txState.totalPages) return;

    try {
        const params = `walletAddress=${encodeURIComponent(currentParams.walletAddress)}&startBlock=${currentParams.startBlock}&page=${newPage}&limit=${PAGE_LIMIT}`;
        const response = await fetch(`/api/transactions?${params}`);
        if (!response.ok) throw new Error('Failed to fetch page');
        const data = await response.json();
        displayResults(data);
        document.getElementById('results').scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
        showError(`Error: ${error.message}`);
    }
}

async function changeTokenPage(delta) {
    const newPage = tokenState.page + delta;
    if (newPage < 1 || newPage > tokenState.totalPages) return;

    try {
        const params = `walletAddress=${encodeURIComponent(currentParams.walletAddress)}&startBlock=${currentParams.startBlock}&page=${newPage}&limit=${PAGE_LIMIT}`;
        const response = await fetch(`/api/token-transfers?${params}`);
        if (!response.ok) throw new Error('Failed to fetch page');
        const data = await response.json();
        displayTokenResults(data);
        document.getElementById('tokenResults').scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
        showError(`Error: ${error.message}`);
    }
}

function createTd(text, className) {
    const td = document.createElement('td');
    td.textContent = text;
    if (className) td.className = className;
    return td;
}

function createHashTd(hash) {
    const td = document.createElement('td');
    const a = document.createElement('a');
    a.href = 'https://etherscan.io/tx/' + encodeURIComponent(hash);
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.className = 'hash';
    a.textContent = truncateHash(hash);
    td.appendChild(a);
    return td;
}

function appendInfoText(parent, label, value) {
    const strong = document.createElement('strong');
    strong.textContent = label;
    parent.appendChild(strong);
    parent.appendChild(document.createTextNode(value));
}

function truncateAddress(address) {
    if (!address) return 'N/A';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function truncateHash(hash) {
    return `${hash.slice(0, 10)}...${hash.slice(-8)}`;
}

function formatDate(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function showError(message) {
    const errorDiv = document.getElementById('error');
    errorDiv.textContent = message;
    showElement('error');
}

function showElement(id) {
    document.getElementById(id).classList.remove('hidden');
}

function hideElement(id) {
    document.getElementById(id).classList.add('hidden');
}

async function fetchBalanceAtDate() {
    const walletAddress = document.getElementById('balanceWalletAddress').value.trim();
    const targetDate = document.getElementById('targetDate').value.trim();

    hideElement('error');
    hideElement('balanceResult');

    if (!walletAddress) {
        showError('Please enter a wallet address');
        return;
    }

    if (!targetDate) {
        showError('Please select a date');
        return;
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
        showError('Invalid Ethereum address format. Must start with 0x and be 42 characters long.');
        return;
    }

    showElement('balanceLoading');

    try {
        const response = await fetch(
            `/api/balance-at-date?walletAddress=${encodeURIComponent(walletAddress)}&date=${targetDate}`
        );

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to fetch balance');
        }

        const data = await response.json();

        hideElement('balanceLoading');
        displayBalanceResult(data);

    } catch (error) {
        hideElement('balanceLoading');
        showError(`Error: ${error.message}`);
    }
}

function displayBalanceResult(data) {
    const { walletAddress, date, balance } = data;

    const container = document.getElementById('balanceInfo');
    container.textContent = '';

    const walletDiv = document.createElement('div');
    walletDiv.style.marginBottom = '15px';
    appendInfoText(walletDiv, 'Wallet: ', truncateAddress(walletAddress));
    container.appendChild(walletDiv);

    const dateDiv = document.createElement('div');
    dateDiv.style.marginBottom = '15px';
    appendInfoText(dateDiv, 'Date: ', date + ' (00:00 UTC)');
    container.appendChild(dateDiv);

    const balanceDiv = document.createElement('div');
    balanceDiv.style.cssText = 'font-size: 24px; color: #2196F3; font-weight: bold;';
    balanceDiv.textContent = parseFloat(balance).toFixed(6) + ' ETH';
    container.appendChild(balanceDiv);

    const noteDiv = document.createElement('div');
    noteDiv.style.cssText = 'margin-top: 10px; font-size: 12px; color: #666;';
    noteDiv.textContent = 'Note: This calculation is based on transaction values only and does not include gas fees.';
    container.appendChild(noteDiv);

    showElement('balanceResult');
}

document.getElementById('searchBtn').addEventListener('click', fetchTransactions);
document.getElementById('balanceBtn').addEventListener('click', fetchBalanceAtDate);
document.getElementById('txPrev').addEventListener('click', () => changeTxPage(-1));
document.getElementById('txNext').addEventListener('click', () => changeTxPage(1));
document.getElementById('tokenPrev').addEventListener('click', () => changeTokenPage(-1));
document.getElementById('tokenNext').addEventListener('click', () => changeTokenPage(1));

document.getElementById('walletAddress').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') fetchTransactions();
});

document.getElementById('startBlock').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') fetchTransactions();
});

document.getElementById('balanceWalletAddress').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') fetchBalanceAtDate();
});

document.getElementById('targetDate').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') fetchBalanceAtDate();
});
