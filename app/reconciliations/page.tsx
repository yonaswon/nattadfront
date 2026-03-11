'use client';

import { useState, useEffect } from 'react';
import api from '../api';

interface ReconciliationHistory {
    id: number;
    bank_name: string;
    statement_filename: string;
    created_at: string;
    summary: {
        total_system: number;
        matched: number;
        missing_in_bank: number;
        missing_in_system: number;
    };
}

export default function ReconciliationsPage() {
    const [history, setHistory] = useState<ReconciliationHistory[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [details, setDetails] = useState<any>(null);
    const [detailsLoading, setDetailsLoading] = useState(false);

    useEffect(() => {
        fetchHistory();
    }, []);

    const fetchHistory = async () => {
        setLoading(true);
        try {
            const res = await api.get('/reconciliations/');
            setHistory(res.data);
            setError(null);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to fetch history');
        } finally {
            setLoading(false);
        }
    };

    const fetchDetails = async (id: number) => {
        setDetailsLoading(true);
        setSelectedId(id);
        try {
            const res = await api.get(`/reconciliations/${id}/`);
            setDetails(res.data);
        } catch (err) {
            console.error('Failed to load details:', err);
        } finally {
            setDetailsLoading(false);
        }
    };

    if (loading && history.length === 0) {
        return (
            <div className="page-loading">
                <div className="spinner"></div>
                <p>Loading History...</p>
            </div>
        );
    }

    return (
        <div className="dashboard-page" style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
            <div className="page-header" style={{ marginBottom: '2rem' }}>
                <h1 style={{ fontSize: '2rem', fontWeight: 'bold' }}>⚖️ Reconciliation History</h1>
                <p style={{ color: '#64748b' }}>View past bank statement reconciliations.</p>
            </div>

            {error && (
                <div style={{ padding: '1rem', background: '#fef2f2', color: '#b91c1c', borderRadius: '8px', border: '1px solid #fecaca', marginBottom: '2rem' }}>
                    ❌ {error}
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: selectedId ? '1fr 2fr' : '1fr', gap: '2rem', transition: 'all 0.3s' }}>
                {/* History List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {history.length === 0 && !loading && (
                        <div style={{ padding: '3rem', background: '#f8fafc', borderRadius: '12px', textAlign: 'center', border: '1px solid #e2e8f0' }}>
                            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📭</div>
                            <h3 style={{ color: '#0f172a' }}>No History Yet</h3>
                            <p style={{ color: '#64748b' }}>Go to "All Results" and click "Reconcile CBE" to create one.</p>
                        </div>
                    )}

                    {history.map(item => (
                        <div
                            key={item.id}
                            onClick={() => fetchDetails(item.id)}
                            style={{
                                padding: '1.25rem',
                                background: selectedId === item.id ? '#eff6ff' : '#ffffff',
                                border: selectedId === item.id ? '2px solid #3b82f6' : '1px solid #e2e8f0',
                                borderRadius: '12px',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                                <div>
                                    <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '1.1rem' }}>Session #{item.id}</div>
                                    <div style={{ color: '#64748b', fontSize: '0.85rem', marginTop: '4px' }}>
                                        {new Date(item.created_at).toLocaleString()}
                                    </div>
                                </div>
                                <span style={{ background: '#f1f5f9', padding: '4px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, color: '#475569' }}>
                                    {item.bank_name.replace('Commercial Bank of Ethiopia', 'CBE')}
                                </span>
                            </div>

                            <div style={{ fontSize: '0.85rem', color: '#334155', display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '1rem' }}>
                                <span style={{ fontSize: '1.2rem' }}>📄</span>
                                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '200px' }} title={item.statement_filename}>
                                    {item.statement_filename}
                                </span>
                            </div>

                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <div style={{ flex: 1, background: '#f0fdf4', padding: '0.5rem', borderRadius: '6px', textAlign: 'center' }}>
                                    <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#16a34a' }}>{item.summary.matched}</div>
                                    <div style={{ fontSize: '0.7rem', color: '#15803d', textTransform: 'uppercase', fontWeight: 600 }}>Matched</div>
                                </div>
                                <div style={{ flex: 1, background: '#fff1f2', padding: '0.5rem', borderRadius: '6px', textAlign: 'center' }}>
                                    <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#e11d48' }}>{item.summary.missing_in_system}</div>
                                    <div style={{ fontSize: '0.7rem', color: '#be123c', textTransform: 'uppercase', fontWeight: 600 }}>Miss DB</div>
                                </div>
                                <div style={{ flex: 1, background: '#fffbeb', padding: '0.5rem', borderRadius: '6px', textAlign: 'center' }}>
                                    <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#d97706' }}>{item.summary.missing_in_bank}</div>
                                    <div style={{ fontSize: '0.7rem', color: '#b45309', textTransform: 'uppercase', fontWeight: 600 }}>Miss Bank</div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Details Panel */}
                {selectedId && (
                    <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '2rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', position: 'sticky', top: '2rem', maxHeight: 'calc(100vh - 4rem)', overflowY: 'auto' }}>
                        {detailsLoading || !details ? (
                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
                                <div className="spinner"></div>
                            </div>
                        ) : (
                            <>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '1rem' }}>
                                    <div>
                                        <h2 style={{ margin: 0, fontSize: '1.5rem', color: '#0f172a' }}>Session #{details.id} Details</h2>
                                        <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '0.9rem' }}>{new Date(details.created_at).toLocaleString()}</p>
                                    </div>
                                    <button onClick={() => setSelectedId(null)} className="btn btn-secondary" style={{ padding: '6px 12px' }}>Close</button>
                                </div>

                                <div style={{ display: 'flex', gap: '2rem' }}>
                                    {/* Missing in System */}
                                    <div style={{ flex: 1 }}>
                                        <h4 style={{ color: '#be123c', borderBottom: '2px solid #fecdd3', paddingBottom: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
                                            <span>Missing in DB</span>
                                            <span style={{ background: '#ffe4e6', color: '#e11d48', padding: '2px 8px', borderRadius: '12px', fontSize: '0.8rem' }}>{details.summary.missing_in_system}</span>
                                        </h4>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem' }}>
                                            {details.missing_in_system.map((tx: any, i: number) => (
                                                <div key={i} style={{ padding: '0.75rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.85rem' }}>
                                                    <div style={{ fontWeight: 600, color: '#1e293b' }}>{tx.reference}</div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', marginTop: '4px' }}>
                                                        <span>{tx.date}</span>
                                                        <span style={{ fontWeight: 600, color: tx.is_credit ? '#16a34a' : '#ef4444' }}>
                                                            {tx.amount} ETB
                                                        </span>
                                                    </div>
                                                    <div style={{ fontSize: '0.75rem', marginTop: '4px', fontStyle: 'italic', color: '#94a3b8' }}>{tx.description}</div>
                                                </div>
                                            ))}
                                            {details.missing_in_system.length === 0 && (
                                                <p style={{ color: '#64748b', fontStyle: 'italic', textAlign: 'center', padding: '2rem 0' }}>None missing in DB. ✅</p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Missing in Bank */}
                                    <div style={{ flex: 1 }}>
                                        <h4 style={{ color: '#b45309', borderBottom: '2px solid #fde68a', paddingBottom: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
                                            <span>Missing in Bank</span>
                                            <span style={{ background: '#fef3c7', color: '#d97706', padding: '2px 8px', borderRadius: '12px', fontSize: '0.8rem' }}>{details.summary.missing_in_bank}</span>
                                        </h4>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem' }}>
                                            {details.missing_in_bank.map((tx: any, i: number) => (
                                                <div key={i} style={{ padding: '0.75rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.85rem' }}>
                                                    <div style={{ fontWeight: 600, color: '#1e293b' }}>{tx.reference}</div>
                                                    <div style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '2px' }}>Raw Ref: {tx.raw_reference}</div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', marginTop: '4px' }}>
                                                        <span>{tx.date}</span>
                                                        <span style={{ fontWeight: 600, color: '#0f172a' }}>{tx.amount} ETB</span>
                                                    </div>
                                                    <div style={{ marginTop: '6px', display: 'flex', justifyContent: 'flex-end' }}>
                                                        <a href={`/results?filter=all`} onClick={(e) => {
                                                            // Optional: add logic here to navigate to the specific Result ID in the Results page
                                                        }} style={{ color: '#3b82f6', textDecoration: 'none', fontSize: '0.75rem', fontWeight: 600 }}>
                                                            View Result #{tx.id} →
                                                        </a>
                                                    </div>
                                                </div>
                                            ))}
                                            {details.missing_in_bank.length === 0 && (
                                                <p style={{ color: '#64748b', fontStyle: 'italic', textAlign: 'center', padding: '2rem 0' }}>None missing in Bank. ✅</p>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div style={{ marginTop: '2rem' }}>
                                    <h4 style={{ color: '#15803d', borderBottom: '2px solid #bbf7d0', paddingBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span>Matched Transactions</span>
                                        <span style={{ background: '#dcfce7', color: '#16a34a', padding: '2px 8px', borderRadius: '12px', fontSize: '0.8rem' }}>{details.summary.matched}</span>
                                    </h4>

                                    <div style={{ margin: '1rem 0', padding: '1rem', background: '#f8fafc', borderRadius: '8px', fontSize: '0.9rem', color: '#475569' }}>
                                        There are {details.summary.matched} transactions that synced perfectly. These are hidden to keep the view clean.
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
