import { useState, useRef } from 'react';
import api from '../api';

interface TransactionResult {
    id: number;
    ocr_bank_name: string | null;
    ocr_transaction_id: string | null;
    ai_bank_name: string | null;
    ai_reference_number: string | null;
    ocr_amount: string | null;
    ai_amount: string | null;
    status: string;
}

interface ReconcileModalProps {
    onClose: () => void;
    filteredResults: TransactionResult[];
}

export default function ReconcileModal({ onClose, filteredResults }: ReconcileModalProps) {
    const [file, setFile] = useState<File | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [reconciliationData, setReconciliationData] = useState<any>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Only allow reconciliation on results that appear to be CBE currently visible
    const systemTransactions = filteredResults.filter(r => {
        const bankName = (r.ai_bank_name || r.ocr_bank_name || '').toLowerCase();
        return bankName.includes('commercial') || bankName.includes('cbe');
    });

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            setFile(e.target.files[0]);
            setError(null);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const droppedFile = e.dataTransfer.files[0];
            if (droppedFile.type === 'application/pdf') {
                setFile(droppedFile);
                setError(null);
            } else {
                setError('Please upload a PDF file.');
            }
        }
    };

    const handleReconcile = async () => {
        if (!file) {
            setError('Please select a PDF statement first.');
            return;
        }

        if (systemTransactions.length === 0) {
            setError('No CBE transactions currently visible to reconcile against. Check your filters in All Results.');
            return;
        }

        setLoading(true);
        setError(null);

        const formData = new FormData();
        formData.append('file', file);

        // Pass the visible transaction IDs
        const ids = systemTransactions.map(r => r.id).join(',');
        formData.append('transaction_ids', ids);

        try {
            const res = await api.post('/reconciliations/cbe/', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            setReconciliationData(res.data);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Reconciliation failed. Check server logs.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="image-viewer-overlay" onClick={onClose} style={{ zIndex: 1000, overflowY: 'auto', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '4rem', paddingBottom: '4rem' }}>
            <div className="image-viewer-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '900px', width: '90%', maxHeight: 'none' }}>
                <div className="modal-header">
                    <h2>⚖️ CBE Reconciliation</h2>
                    <button className="btn btn-close" onClick={onClose}>✕</button>
                </div>

                <div className="modal-body" style={{ padding: '2rem' }}>
                    {!reconciliationData ? (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                            {/* Left Panel: System State */}
                            <div style={{ padding: '1.5rem', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                <h3 style={{ marginTop: 0, color: '#1e293b' }}>1. System Transactions</h3>
                                <p style={{ fontSize: '0.9rem', color: '#64748b' }}>
                                    Matching transactions currently filtered in the table (Filtered by "Commercial" / "CBE"):
                                </p>
                                <div style={{ fontSize: '3rem', fontWeight: 700, color: '#3b82f6', margin: '1rem 0' }}>
                                    {systemTransactions.length}
                                </div>
                                <p style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                                    Only these transactions will be compared against the uploaded statement.
                                </p>
                            </div>

                            {/* Right Panel: Upload PDF */}
                            <div style={{ padding: '1.5rem', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
                                <h3 style={{ marginTop: 0, color: '#1e293b' }}>2. Upload CBE Statement</h3>
                                <p style={{ fontSize: '0.9rem', color: '#64748b' }}>
                                    Upload the official PDF bank statement from Commercial Bank of Ethiopia.
                                </p>

                                <div
                                    onDragOver={e => e.preventDefault()}
                                    onDrop={handleDrop}
                                    style={{
                                        border: '2px dashed #cbd5e1',
                                        borderRadius: '8px',
                                        padding: '2rem',
                                        textAlign: 'center',
                                        background: file ? '#f0fdf4' : '#ffffff',
                                        cursor: 'pointer',
                                        flexGrow: 1,
                                        display: 'flex',
                                        flexDirection: 'column',
                                        justifyContent: 'center',
                                        alignItems: 'center',
                                        marginTop: '1rem'
                                    }}
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    {file ? (
                                        <div style={{ color: '#166534', fontWeight: 600 }}>
                                            📄 {file.name}
                                        </div>
                                    ) : (
                                        <div style={{ color: '#64748b' }}>
                                            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📄</div>
                                            <strong>Click or drag PDF here</strong><br />
                                            <span style={{ fontSize: '0.8rem' }}>Max size: 10MB</span>
                                        </div>
                                    )}
                                </div>
                                <input
                                    type="file"
                                    accept="application/pdf"
                                    ref={fileInputRef}
                                    style={{ display: 'none' }}
                                    onChange={handleFileChange}
                                />
                            </div>

                            {error && (
                                <div style={{ gridColumn: 'span 2', padding: '1rem', background: '#fef2f2', color: '#b91c1c', borderRadius: '8px', border: '1px solid #fecaca' }}>
                                    ❌ {error}
                                </div>
                            )}

                            <div style={{ gridColumn: 'span 2', display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                                <button
                                    onClick={handleReconcile}
                                    disabled={loading || !file || systemTransactions.length === 0}
                                    style={{
                                        background: (loading || !file || systemTransactions.length === 0) ? '#94a3b8' : '#2563eb',
                                        color: 'white',
                                        padding: '0.75rem 2rem',
                                        borderRadius: '8px',
                                        fontWeight: 600,
                                        border: 'none',
                                        cursor: (loading || !file || systemTransactions.length === 0) ? 'not-allowed' : 'pointer',
                                        fontSize: '1.1rem'
                                    }}
                                >
                                    {loading ? '🔄 Processing PDF...' : '✨ Start Reconciliation'}
                                </button>
                            </div>
                        </div>
                    ) : (
                        // Results View
                        <div>
                            <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
                                <div style={{ flex: 1, background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '1.5rem', borderRadius: '12px', textAlign: 'center' }}>
                                    <div style={{ fontSize: '0.9rem', color: '#166534', fontWeight: 600, textTransform: 'uppercase' }}>Matched</div>
                                    <div style={{ fontSize: '2.5rem', fontWeight: 700, color: '#15803d' }}>{reconciliationData.summary.matched}</div>
                                </div>
                                <div style={{ flex: 1, background: '#fff1f2', border: '1px solid #fecdd3', padding: '1.5rem', borderRadius: '12px', textAlign: 'center' }}>
                                    <div style={{ fontSize: '0.9rem', color: '#9f1239', fontWeight: 600, textTransform: 'uppercase' }}>Missing in DB</div>
                                    <div style={{ fontSize: '2.5rem', fontWeight: 700, color: '#be123c' }}>{reconciliationData.summary.missing_in_system}</div>
                                    <div style={{ fontSize: '0.75rem', color: '#e11d48' }}>In PDF, not in our system</div>
                                </div>
                                <div style={{ flex: 1, background: '#fffbeb', border: '1px solid #fde68a', padding: '1.5rem', borderRadius: '12px', textAlign: 'center' }}>
                                    <div style={{ fontSize: '0.9rem', color: '#92400e', fontWeight: 600, textTransform: 'uppercase' }}>Missing in Bank</div>
                                    <div style={{ fontSize: '2.5rem', fontWeight: 700, color: '#b45309' }}>{reconciliationData.summary.missing_in_bank}</div>
                                    <div style={{ fontSize: '0.75rem', color: '#d97706' }}>In our system, not in PDF</div>
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '2rem' }}>
                                {/* Missing in System */}
                                <div style={{ flex: 1 }}>
                                    <h4 style={{ color: '#be123c', borderBottom: '2px solid #fecdd3', paddingBottom: '0.5rem' }}>Missing in DB ({reconciliationData.missing_in_system.length})</h4>
                                    <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                                        {reconciliationData.missing_in_system.map((tx: any, i: number) => (
                                            <div key={i} style={{ padding: '0.75rem', borderBottom: '1px solid #e2e8f0', fontSize: '0.85rem' }}>
                                                <div style={{ fontWeight: 600, color: '#1e293b' }}>{tx.reference}</div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', marginTop: '4px' }}>
                                                    <span>{tx.date}</span>
                                                    <span style={{ fontWeight: 600, color: tx.is_credit ? '#16a34a' : '#ef4444' }}>
                                                        {tx.amount} ETB
                                                    </span>
                                                </div>
                                                <div style={{ fontSize: '0.75rem', marginTop: '4px', fontStyle: 'italic' }}>{tx.description}</div>
                                            </div>
                                        ))}
                                        {reconciliationData.missing_in_system.length === 0 && (
                                            <p style={{ color: '#64748b', fontStyle: 'italic', padding: '1rem 0' }}>All clear! No bank records are missing from DB.</p>
                                        )}
                                    </div>
                                </div>

                                {/* Missing in Bank */}
                                <div style={{ flex: 1 }}>
                                    <h4 style={{ color: '#b45309', borderBottom: '2px solid #fde68a', paddingBottom: '0.5rem' }}>Missing in Bank ({reconciliationData.missing_in_bank.length})</h4>
                                    <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                                        {reconciliationData.missing_in_bank.map((tx: any, i: number) => (
                                            <div key={i} style={{ padding: '0.75rem', borderBottom: '1px solid #e2e8f0', fontSize: '0.85rem' }}>
                                                <div style={{ fontWeight: 600, color: '#1e293b' }}>{tx.reference}</div>
                                                <div style={{ color: '#64748b', fontSize: '0.75rem' }}>Raw Ref: {tx.raw_reference}</div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', marginTop: '4px' }}>
                                                    <span>{tx.date}</span>
                                                    <span style={{ fontWeight: 600, color: '#0f172a' }}>{tx.amount} ETB</span>
                                                </div>
                                            </div>
                                        ))}
                                        {reconciliationData.missing_in_bank.length === 0 && (
                                            <p style={{ color: '#64748b', fontStyle: 'italic', padding: '1rem 0' }}>All clear! No extra DB records found.</p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div style={{ marginTop: '2rem', textAlign: 'center' }}>
                                <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '1rem' }}>
                                    This report has been saved as Session #{reconciliationData.session_id} in your History.
                                </p>
                                <button
                                    onClick={onClose}
                                    className="btn btn-secondary"
                                    style={{ padding: '0.5rem 2rem', borderRadius: '8px', fontSize: '1rem' }}
                                >
                                    Done
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
