'use client';

import { useEffect, useState, useCallback } from 'react';
import api from '../api';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import BotImageViewer from '../components/BotImageViewer';

interface BotUser {
    id: number;
    telegram_id: number;
    telegram_username: string | null;
    first_name: string;
    last_name: string;
    role: string;
    branch: number | null;
    branch_name: string | null;
    is_active: boolean;
    created_at: string;
}

interface BotTransaction {
    id: number;
    bot_user: number;
    bot_user_name: string;
    bot_user_username: string | null;
    telegram_message_id: number;
    image_file: string;
    image_name: string;
    image_url: string | null;
    transaction_type: string;
    branch: number | null;
    branch_name: string | null;
    sync_bank_name: string | null;
    sync_reference_number: string | null;
    sync_date: string | null;
    sync_from_name: string | null;
    sync_to_name: string | null;
    sync_amount: string | null;
    sync_description: string | null;
    needs_attention: boolean;
    status: string;
    payment_date: string | null;
    created_at: string;
}

interface DashboardStats {
    sales_total: string;
    sales_count: number;
    purchase_total: string;
    purchase_count: number;
    total_transactions: number;
    attention_count: number;
    bank_breakdown: { sync_bank_name: string; count: number; total: string }[];
    branch_breakdown: { branch__name: string; count: number; total: string }[];
    daily_totals: { date: string; transaction_type: string; total: string; count: number }[];
}

interface Branch {
    id: number;
    name: string;
}

export default function DashboardPage() {
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [transactions, setTransactions] = useState<BotTransaction[]>([]);
    const [users, setUsers] = useState<BotUser[]>([]);
    const [branches, setBranches] = useState<Branch[]>([]);
    const [banks, setBanks] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [showUsers, setShowUsers] = useState(false);
    const [selectedTx, setSelectedTx] = useState<BotTransaction | null>(null);

    // Filters
    const [datePreset, setDatePreset] = useState('today');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [createdFrom, setCreatedFrom] = useState('');
    const [createdTo, setCreatedTo] = useState('');
    const [txType, setTxType] = useState('');
    const [branchId, setBranchId] = useState('');
    const [bankName, setBankName] = useState('');
    const [botUserId, setBotUserId] = useState('');
    const [refreshing, setRefreshing] = useState(false);

    const buildFilterParams = useCallback(() => {
        const params: Record<string, string> = {};
        if (datePreset && datePreset !== 'custom') params.date_preset = datePreset;
        if (datePreset === 'custom') {
            if (dateFrom) params.date_from = dateFrom;
            if (dateTo) params.date_to = dateTo;
        }
        if (createdFrom) params.created_from = createdFrom;
        if (createdTo) params.created_to = createdTo;
        if (txType) params.transaction_type = txType;
        if (branchId) params.branch_id = branchId;
        if (bankName) params.bank_name = bankName;
        if (botUserId) params.bot_user_id = botUserId;
        return params;
    }, [datePreset, dateFrom, dateTo, createdFrom, createdTo, txType, branchId, bankName, botUserId]);

    const fetchData = useCallback(async () => {
        try {
            const params = buildFilterParams();
            const [statsRes, txRes] = await Promise.all([
                api.get('/bot/dashboard-stats/', { params }),
                api.get('/bot/transactions/', { params }),
            ]);
            setStats(statsRes.data);
            setTransactions(txRes.data);
        } catch (err) {
            console.error('Failed to fetch dashboard data:', err);
        } finally {
            setLoading(false);
        }
    }, [buildFilterParams]);

    const fetchMeta = useCallback(async () => {
        try {
            const [usersRes, branchRes, banksRes] = await Promise.all([
                api.get('/bot/users/'),
                api.get('/branches/'),
                api.get('/bot/banks/'),
            ]);
            setUsers(usersRes.data);
            setBranches(branchRes.data);
            setBanks(banksRes.data);
        } catch (err) {
            console.error('Failed to fetch meta:', err);
        }
    }, []);

    useEffect(() => { fetchMeta(); }, [fetchMeta]);
    useEffect(() => { fetchData(); }, [fetchData]);

    const handleUserUpdate = async (userId: number, field: string, value: string | number | null) => {
        try {
            const payload: Record<string, string | number | null> = {};
            payload[field] = value;
            await api.patch(`/bot/users/${userId}/`, payload);
            fetchMeta();
        } catch (err) {
            console.error('Failed to update user:', err);
        }
    };

    const clearFilters = () => {
        setDatePreset('today');
        setDateFrom('');
        setDateTo('');
        setCreatedFrom('');
        setCreatedTo('');
        setTxType('');
        setBranchId('');
        setBankName('');
        setBotUserId('');
    };

    const handleRefresh = async () => {
        setRefreshing(true);
        await fetchData();
        await fetchMeta();
        setRefreshing(false);
    };

    const exportToExcel = () => {
        const rows = transactions.map((tx, idx) => ({
            '#': idx + 1,
            'Date': tx.sync_date || tx.payment_date || '',
            'Processing Date': new Date(tx.created_at).toLocaleString(),
            'User': tx.bot_user_name,
            'Username': tx.bot_user_username ? `@${tx.bot_user_username}` : '',
            'Type': tx.transaction_type === 'sales' ? 'SALES' : 'PURCHASE',
            'Bank': tx.sync_bank_name || '',
            'Reference': tx.sync_reference_number || '',
            'From': tx.sync_from_name || '',
            'To': tx.sync_to_name || '',
            'Amount': tx.sync_amount ? parseFloat(tx.sync_amount) : '',
            'Branch': tx.branch_name || '',
            'Description': tx.sync_description || '',
            'Status': tx.status,
            'Attention': tx.needs_attention ? 'YES' : '',
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        const colWidths = Object.keys(rows[0] || {}).map(key => ({ wch: Math.max(key.length + 2, 15) }));
        ws['!cols'] = colWidths;
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Transactions');
        const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        saveAs(new Blob([buf], { type: 'application/octet-stream' }), `transactions_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    const exportToPdf = () => {
        let headers = '<th>#</th><th>Date</th><th>User</th><th>Type</th><th>Bank</th><th>Ref</th><th>From</th><th>To</th><th>Amount</th><th>Status</th>';
        let rows = '';
        transactions.forEach((tx, idx) => {
            const amt = tx.sync_amount ? `ETB ${parseFloat(tx.sync_amount).toLocaleString()}` : '';
            rows += `<tr${tx.needs_attention ? ' style="background:#fff0f0"' : ''}>`;
            rows += `<td>${idx + 1}</td><td>${tx.sync_date || tx.payment_date || ''}</td>`;
            rows += `<td>${tx.bot_user_name}</td><td>${tx.transaction_type === 'sales' ? '💰 Sales' : '🛒 Purchase'}</td>`;
            rows += `<td>${tx.sync_bank_name || ''}</td><td>${tx.sync_reference_number || ''}</td>`;
            rows += `<td>${tx.sync_from_name || ''}</td><td>${tx.sync_to_name || ''}</td>`;
            rows += `<td>${amt}</td><td>${tx.status}</td></tr>`;
        });
        const html = `<!DOCTYPE html><html><head><title>Transaction Report</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            h1 { font-size: 20px; margin-bottom: 10px; }
            p { font-size: 13px; color: #666; margin-bottom: 16px; }
            table { border-collapse: collapse; width: 100%; font-size: 11px; }
            th { background: #6c5ce7; color: #fff; padding: 8px 6px; text-align: left; font-size: 10px; text-transform: uppercase; }
            td { padding: 6px; border-bottom: 1px solid #e0e0e0; }
            tr:nth-child(even) { background: #f8f8fc; }
            @media print { body { margin: 0; } }
        </style></head><body>
        <h1>📊 Transaction Report</h1>
        <p>${transactions.length} transactions • Exported ${new Date().toLocaleString()}</p>
        <table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>
        </body></html>`;
        const w = window.open('', '_blank');
        if (w) { w.document.write(html); w.document.close(); w.print(); }
    };

    const formatAmount = (amt: string | null) => {
        if (!amt || amt === '0') return 'ETB 0.00';
        const n = parseFloat(amt);
        return `ETB ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    if (loading) {
        return (
            <div className="page-loading">
                <div className="spinner"></div>
                <p>Loading dashboard...</p>
            </div>
        );
    }

    return (
        <div className="dashboard-page">
            <div className="dashboard-header">
                <div className="dashboard-header-top">
                    <div>
                        <h1>📊 Financial Dashboard</h1>
                        <p className="dashboard-subtitle">Real-time overview of sales & purchase transactions from the Telegram bot</p>
                    </div>
                    <div className="dashboard-actions">
                        <button className="btn btn-primary" onClick={handleRefresh} disabled={refreshing}>
                            {refreshing ? '⏳ Refreshing...' : '🔄 Refresh'}
                        </button>
                        <button className="btn" onClick={exportToExcel} disabled={transactions.length === 0}
                            style={{ background: '#217346', color: '#fff', border: 'none' }}>
                            📊 Export Excel
                        </button>
                        <button className="btn" onClick={exportToPdf} disabled={transactions.length === 0}
                            style={{ background: '#dc3545', color: '#fff', border: 'none' }}>
                            📄 Export PDF
                        </button>
                    </div>
                </div>
            </div>

            {/* Stats Cards */}
            {stats && (
                <div className="stats-grid">
                    <div className="stat-card stat-sales">
                        <div className="stat-icon">💰</div>
                        <div className="stat-info">
                            <span className="stat-label">Total Sales</span>
                            <span className="stat-value">{formatAmount(stats.sales_total)}</span>
                            <span className="stat-count">{stats.sales_count} transactions</span>
                        </div>
                    </div>
                    <div className="stat-card stat-purchase">
                        <div className="stat-icon">🛒</div>
                        <div className="stat-info">
                            <span className="stat-label">Total Purchases</span>
                            <span className="stat-value">{formatAmount(stats.purchase_total)}</span>
                            <span className="stat-count">{stats.purchase_count} transactions</span>
                        </div>
                    </div>
                    <div className="stat-card stat-total">
                        <div className="stat-icon">📈</div>
                        <div className="stat-info">
                            <span className="stat-label">Total Transactions</span>
                            <span className="stat-value">{stats.total_transactions}</span>
                            <span className="stat-count">all types</span>
                        </div>
                    </div>
                    <div className="stat-card stat-attention">
                        <div className="stat-icon">⚠️</div>
                        <div className="stat-info">
                            <span className="stat-label">Needs Attention</span>
                            <span className="stat-value">{stats.attention_count}</span>
                            <span className="stat-count">amount mismatches</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Filter Bar */}
            <div className="filter-bar">
                <div className="filter-row">
                    <div className="filter-presets">
                        {['today', 'yesterday', 'this_week', 'this_month', 'custom'].map(preset => (
                            <button
                                key={preset}
                                className={`filter-preset-btn ${datePreset === preset ? 'active' : ''}`}
                                onClick={() => setDatePreset(preset)}
                            >
                                {preset === 'today' ? 'Today' :
                                    preset === 'yesterday' ? 'Yesterday' :
                                        preset === 'this_week' ? 'This Week' :
                                            preset === 'this_month' ? 'This Month' : 'Custom'}
                            </button>
                        ))}
                    </div>

                    {datePreset === 'custom' && (
                        <div className="date-range">
                            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                            <span>to</span>
                            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
                        </div>
                    )}
                </div>

                <div className="filter-row">
                    <select value={txType} onChange={e => setTxType(e.target.value)}>
                        <option value="">All Types</option>
                        <option value="sales">💰 Sales</option>
                        <option value="purchase">🛒 Purchase</option>
                    </select>
                    <select value={branchId} onChange={e => setBranchId(e.target.value)}>
                        <option value="">All Branches</option>
                        {branches.map(b => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                    </select>
                    <select value={bankName} onChange={e => setBankName(e.target.value)}>
                        <option value="">All Banks</option>
                        {banks.map(b => (
                            <option key={b} value={b}>{b}</option>
                        ))}
                    </select>
                    <select value={botUserId} onChange={e => setBotUserId(e.target.value)}>
                        <option value="">All Users</option>
                        {users.filter(u => u.role !== 'unassigned').map(u => (
                            <option key={u.id} value={u.id}>
                                {u.first_name} {u.last_name} (@{u.telegram_username || 'N/A'})
                            </option>
                        ))}
                    </select>
                    <button className="btn-clear-filters" onClick={clearFilters}>✕ Clear</button>
                </div>

                <div className="filter-row">
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>🕐 Processing Date:</span>
                    <input type="date" style={{ padding: '7px 12px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit', outline: 'none' }} value={createdFrom} onChange={e => setCreatedFrom(e.target.value)} />
                    <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>to</span>
                    <input type="date" style={{ padding: '7px 12px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit', outline: 'none' }} value={createdTo} onChange={e => setCreatedTo(e.target.value)} />
                </div>
            </div>

            {/* Bank & Branch Breakdown */}
            {stats && (stats.bank_breakdown.length > 0 || stats.branch_breakdown.length > 0) && (
                <div className="breakdown-grid">
                    {stats.bank_breakdown.length > 0 && (
                        <div className="breakdown-card">
                            <h3>🏦 By Bank</h3>
                            <div className="breakdown-list">
                                {stats.bank_breakdown.map((b, i) => (
                                    <div key={i} className="breakdown-item">
                                        <span className="breakdown-name">{b.sync_bank_name}</span>
                                        <span className="breakdown-count">{b.count} tx</span>
                                        <span className="breakdown-total">{formatAmount(b.total)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    {stats.branch_breakdown.length > 0 && (
                        <div className="breakdown-card">
                            <h3>🏢 By Branch</h3>
                            <div className="breakdown-list">
                                {stats.branch_breakdown.map((b, i) => (
                                    <div key={i} className="breakdown-item">
                                        <span className="breakdown-name">{b.branch__name}</span>
                                        <span className="breakdown-count">{b.count} tx</span>
                                        <span className="breakdown-total">{formatAmount(b.total)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* User Management Section */}
            <div className="user-management-section">
                <button className="toggle-users-btn" onClick={() => setShowUsers(!showUsers)}>
                    {showUsers ? '▼' : '▶'} 👥 User Management ({users.length} users)
                </button>

                {showUsers && (
                    <div className="users-table-wrapper">
                        <table className="users-table">
                            <thead>
                                <tr>
                                    <th>Telegram</th>
                                    <th>Name</th>
                                    <th>Role</th>
                                    <th>Branch</th>
                                    <th>Status</th>
                                    <th>Joined</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map(user => (
                                    <tr key={user.id}>
                                        <td>
                                            <span className="tg-username">@{user.telegram_username || 'N/A'}</span>
                                            <span className="tg-id">ID: {user.telegram_id}</span>
                                        </td>
                                        <td>{user.first_name} {user.last_name}</td>
                                        <td>
                                            <select
                                                value={user.role}
                                                onChange={e => handleUserUpdate(user.id, 'role', e.target.value)}
                                                className={`role-select role-${user.role}`}
                                            >
                                                <option value="unassigned">Unassigned</option>
                                                <option value="sales">Sales Recorder</option>
                                                <option value="purchase">Purchase Recorder</option>
                                            </select>
                                        </td>
                                        <td>
                                            <select
                                                value={user.branch || ''}
                                                onChange={e => handleUserUpdate(user.id, 'branch', e.target.value ? parseInt(e.target.value) : null)}
                                            >
                                                <option value="">No Branch</option>
                                                {branches.map(b => (
                                                    <option key={b.id} value={b.id}>{b.name}</option>
                                                ))}
                                            </select>
                                        </td>
                                        <td>
                                            <span className={`status-badge ${user.is_active ? 'active' : 'inactive'}`}>
                                                {user.is_active ? '✅ Active' : '❌ Inactive'}
                                            </span>
                                        </td>
                                        <td>{new Date(user.created_at).toLocaleDateString()}</td>
                                    </tr>
                                ))}
                                {users.length === 0 && (
                                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: '20px', opacity: 0.6 }}>No users registered yet. Users will appear here after they /start the bot.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Transactions Table */}
            <div className="transactions-section">
                <h2>📋 Transactions ({transactions.length})</h2>
                <div className="transactions-table-wrapper">
                    <table className="transactions-table">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>User</th>
                                <th>Type</th>
                                <th>Bank</th>
                                <th>Reference</th>
                                <th>From</th>
                                <th>To</th>
                                <th>Amount</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {transactions.map(tx => (
                                <tr key={tx.id} className={tx.needs_attention ? 'attention-row' : ''}>
                                    <td className="date-cell">
                                        <span className="payment-date">{tx.sync_date || tx.payment_date || '—'}</span>
                                        <span className="created-date">{new Date(tx.created_at).toLocaleString()}</span>
                                    </td>
                                    <td>
                                        <span className="user-name">{tx.bot_user_name}</span>
                                        {tx.bot_user_username && <span className="user-tg">@{tx.bot_user_username}</span>}
                                    </td>
                                    <td>
                                        <span className={`type-badge type-${tx.transaction_type}`}>
                                            {tx.transaction_type === 'sales' ? '💰 Sales' : '🛒 Purchase'}
                                        </span>
                                    </td>
                                    <td>{tx.sync_bank_name || '—'}</td>
                                    <td className="ref-cell">{tx.sync_reference_number || '—'}</td>
                                    <td>{tx.sync_from_name || '—'}</td>
                                    <td>{tx.sync_to_name || '—'}</td>
                                    <td className="amount-cell">
                                        {tx.sync_amount ? formatAmount(tx.sync_amount) : '—'}
                                        {tx.needs_attention && <span className="attention-flag">⚠️</span>}
                                    </td>
                                    <td>
                                        <span className={`status-pill status-${tx.status}`}>
                                            {tx.status === 'complete' ? '✅' : tx.status === 'error' ? '❌' : '⏳'} {tx.status}
                                        </span>
                                    </td>
                                    <td>
                                        <button
                                            className="btn btn-sm btn-edit"
                                            onClick={() => setSelectedTx(tx)}
                                            style={{ padding: '4px 8px', fontSize: '12px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                        >
                                            {tx.image_url ? '👁️ View/Edit' : '✏️ Edit'}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {transactions.length === 0 && (
                                <tr><td colSpan={10} style={{ textAlign: 'center', padding: '40px', opacity: 0.6 }}>
                                    No transactions found for the selected filters. Send receipt images to the bot to see them here.
                                </td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* View/Edit Modal */}
            {selectedTx && (
                <BotImageViewer
                    transaction={selectedTx}
                    onClose={() => setSelectedTx(null)}
                    onSave={(updated) => {
                        setTransactions(prev => prev.map(t => t.id === updated.id ? updated : t));
                        fetchData(); // Optional: refresh stats
                    }}
                />
            )}
        </div>
    );
}
