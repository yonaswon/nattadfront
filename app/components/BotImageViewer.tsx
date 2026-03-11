'use client';

import { useState } from 'react';
import api from '../api';

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

interface BotImageViewerProps {
    transaction: BotTransaction;
    onClose: () => void;
    onSave: (updated: BotTransaction) => void;
}

export default function BotImageViewer({ transaction, onClose, onSave }: BotImageViewerProps) {
    const [editMode, setEditMode] = useState(false);
    const [form, setForm] = useState({ ...transaction });
    const [saving, setSaving] = useState(false);
    const [zoom, setZoom] = useState(1);

    const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.25, 6));
    const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.25, 0.5));

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await api.patch(`/bot/transactions/${transaction.id}/`, {
                sync_bank_name: form.sync_bank_name,
                sync_reference_number: form.sync_reference_number,
                sync_date: form.sync_date,
                sync_from_name: form.sync_from_name,
                sync_to_name: form.sync_to_name,
                sync_amount: form.sync_amount,
                sync_description: form.sync_description,
            });
            onSave(res.data);
            setEditMode(false);
        } catch (err) {
            console.error('Failed to save:', err);
        } finally {
            setSaving(false);
        }
    };

    // Strip trailing slash and trailing '/api' from baseURL to get the root host URL
    const rawBase = api.defaults.baseURL as string || 'http://localhost:8000/api';
    const baseUrl = rawBase.replace(/\/$/, '').replace(/\/api$/, '');

    const imgSrc = transaction.image_url
        ? `${baseUrl}${transaction.image_url.startsWith('/') ? '' : '/'}${transaction.image_url}`
        : null;

    return (
        <div className="image-viewer-overlay" onClick={onClose}>
            <div className="image-viewer-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>📄 {transaction.image_name}</h3>
                    <div className="modal-actions" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <div className="zoom-controls" style={{ display: 'flex', gap: '4px', marginRight: '16px', background: '#333', padding: '4px', borderRadius: '4px' }}>
                            <button className="btn btn-secondary btn-sm" onClick={handleZoomOut} title="Zoom Out" style={{ padding: '2px 8px' }}>➖</button>
                            <span style={{ fontSize: '12px', minWidth: '40px', textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
                            <button className="btn btn-secondary btn-sm" onClick={handleZoomIn} title="Zoom In" style={{ padding: '2px 8px' }}>➕</button>
                        </div>

                        {!editMode ? (
                            <button className="btn btn-primary" onClick={() => setEditMode(true)}>
                                ✏️ Edit
                            </button>
                        ) : (
                            <>
                                <button className="btn btn-success" onClick={handleSave} disabled={saving}>
                                    {saving ? '💾 Saving...' : '💾 Save'}
                                </button>
                                <button className="btn btn-secondary" onClick={() => { setEditMode(false); setForm({ ...transaction }); }}>
                                    Cancel
                                </button>
                            </>
                        )}
                        <button className="btn btn-close" onClick={onClose}>✕</button>
                    </div>
                </div>

                <div className="modal-body">
                    <div className="modal-image-section" style={{ overflow: 'auto', display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }}>
                        {imgSrc ? (
                            <img
                                src={imgSrc}
                                alt={transaction.image_name}
                                className="receipt-image"
                                style={{ transform: `scale(${zoom})`, transformOrigin: 'top center', transition: 'transform 0.2s ease-in-out', willChange: 'transform' }}
                            />
                        ) : (
                            <div className="no-image">No image available</div>
                        )}
                    </div>

                    <div className="modal-data-section">
                        <div className="data-comparison">
                            <div className="data-card ai-card">
                                <h4>✅ Extracted Data</h4>
                                <div className="data-fields">
                                    {editMode ? (
                                        <>
                                            <label>Bank<input value={form.sync_bank_name || ''} onChange={e => setForm({ ...form, sync_bank_name: e.target.value })} /></label>
                                            <label>Ref ID<input value={form.sync_reference_number || ''} onChange={e => setForm({ ...form, sync_reference_number: e.target.value })} /></label>
                                            <label>Date<input value={form.sync_date || ''} onChange={e => setForm({ ...form, sync_date: e.target.value })} /></label>
                                            <label>Sender (From)<input value={form.sync_from_name || ''} onChange={e => setForm({ ...form, sync_from_name: e.target.value })} /></label>
                                            <label>Receiver (To)<input value={form.sync_to_name || ''} onChange={e => setForm({ ...form, sync_to_name: e.target.value })} /></label>
                                            <label>Amount<input value={form.sync_amount || ''} onChange={e => setForm({ ...form, sync_amount: e.target.value })} /></label>
                                            <label>Description<input value={form.sync_description || ''} onChange={e => setForm({ ...form, sync_description: e.target.value })} /></label>
                                        </>
                                    ) : (
                                        <>
                                            <div className="field"><span>Bank:</span> <strong>{transaction.sync_bank_name || '—'}</strong></div>
                                            <div className="field"><span>Ref ID:</span> <strong>{transaction.sync_reference_number || '—'}</strong></div>
                                            <div className="field"><span>Date:</span> <strong>{transaction.sync_date || '—'}</strong></div>
                                            <div className="field"><span>From:</span> <strong>{transaction.sync_from_name || '—'}</strong></div>
                                            <div className="field"><span>To:</span> <strong>{transaction.sync_to_name || '—'}</strong></div>
                                            <div className="field"><span>Amount:</span> <strong>{transaction.sync_amount ? `${parseFloat(transaction.sync_amount).toLocaleString()} ETB` : '—'}</strong></div>
                                            {transaction.sync_description && <div className="field"><span>Desc:</span> <strong>{transaction.sync_description}</strong></div>}
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
