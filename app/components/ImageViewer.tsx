'use client';

import { useState } from 'react';
import api from '../api';

interface TransactionResult {
    id: number;
    image_name: string;
    image_url: string | null;
    ocr_bank_name: string | null;
    ocr_transaction_id: string | null;
    ocr_date: string | null;
    ocr_sender: string | null;
    ocr_receiver: string | null;
    ocr_amount: string | null;
    ocr_total_amount: string | null;
    ai_bank_name: string | null;
    ai_reference_number: string | null;
    ai_date: string | null;
    ai_from_name: string | null;
    ai_to_name: string | null;
    ai_amount: string | null;
    ai_description: string | null;
    ai_model_used: string | null;
    needs_attention: boolean;
    status: string;
    is_pdf: boolean;
    pdf_url: string | null;
}

interface ImageViewerProps {
    result: TransactionResult;
    onClose: () => void;
    onSave: (updated: TransactionResult) => void;
}

export default function ImageViewer({ result, onClose, onSave }: ImageViewerProps) {
    const [editMode, setEditMode] = useState(false);
    const [form, setForm] = useState({ ...result });
    const [saving, setSaving] = useState(false);
    const [zoom, setZoom] = useState(1);

    const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.25, 6));
    const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.25, 0.5));

    const transferAiToOcr = () => {
        setForm(prev => ({
            ...prev,
            ocr_bank_name: prev.ai_bank_name || '',
            ocr_transaction_id: prev.ai_reference_number || '',
            ocr_date: prev.ai_date || '',
            ocr_sender: prev.ai_from_name || '',
            ocr_receiver: prev.ai_to_name || '',
            ocr_amount: prev.ai_amount || '',
        }));
    };

    const transferOcrToAi = () => {
        setForm(prev => ({
            ...prev,
            ai_bank_name: prev.ocr_bank_name || '',
            ai_reference_number: prev.ocr_transaction_id || '',
            ai_date: prev.ocr_date || '',
            ai_from_name: prev.ocr_sender || '',
            ai_to_name: prev.ocr_receiver || '',
            ai_amount: prev.ocr_amount || '',
        }));
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await api.patch(`/results/${result.id}/update/`, {
                ocr_bank_name: form.ocr_bank_name,
                ocr_transaction_id: form.ocr_transaction_id,
                ocr_date: form.ocr_date,
                ocr_sender: form.ocr_sender,
                ocr_receiver: form.ocr_receiver,
                ocr_amount: form.ocr_amount,
                ai_bank_name: form.ai_bank_name,
                ai_reference_number: form.ai_reference_number,
                ai_date: form.ai_date,
                ai_from_name: form.ai_from_name,
                ai_to_name: form.ai_to_name,
                ai_amount: form.ai_amount,
            });
            onSave(res.data);
            setEditMode(false);
        } catch (err) {
            console.error('Failed to save:', err);
        } finally {
            setSaving(false);
        }
    };

    const baseUrl = (api.defaults.baseURL as string || 'http://localhost:8000/api').replace(/\/$/, '');

    const imgSrc = result.image_url
        ? `${baseUrl}${result.image_url.startsWith('/') ? '' : '/'}${result.image_url}`
        : null;

    const iframeSrc = result.pdf_url
        ? `${baseUrl}${result.pdf_url.startsWith('/') ? '' : '/'}${result.pdf_url}`
        : '';

    console.log("PDF URL generated:", iframeSrc);

    return (
        <div className="image-viewer-overlay" onClick={onClose}>
            <div className="image-viewer-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>📄 {result.image_name}</h3>
                    <div className="modal-actions" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {!result.is_pdf && (
                            <div className="zoom-controls" style={{ display: 'flex', gap: '4px', marginRight: '16px', background: '#333', padding: '4px', borderRadius: '4px' }}>
                                <button className="btn btn-secondary btn-sm" onClick={handleZoomOut} title="Zoom Out" style={{ padding: '2px 8px' }}>➖</button>
                                <span style={{ fontSize: '12px', minWidth: '40px', textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
                                <button className="btn btn-secondary btn-sm" onClick={handleZoomIn} title="Zoom In" style={{ padding: '2px 8px' }}>➕</button>
                            </div>
                        )}
                        {!editMode ? (
                            <button className="btn btn-primary" onClick={() => setEditMode(true)}>
                                ✏️ Edit
                            </button>
                        ) : (
                            <>
                                <button className="btn btn-success" onClick={handleSave} disabled={saving}>
                                    {saving ? '💾 Saving...' : '💾 Save'}
                                </button>
                                <button className="btn btn-secondary" onClick={() => { setEditMode(false); setForm({ ...result }); }}>
                                    Cancel
                                </button>
                            </>
                        )}
                        <button className="btn btn-close" onClick={onClose}>✕</button>
                    </div>
                </div>

                <div className="modal-body">
                    <div className="modal-image-section" style={{ overflow: 'auto', display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }}>
                        {result.is_pdf && result.pdf_url ? (
                            <iframe
                                src={iframeSrc}
                                title={result.image_name}
                                className="w-full h-full"
                                style={{ minHeight: '600px', border: 'none', borderRadius: '8px' }}
                            >
                                <div style={{ textAlign: 'center', padding: '2rem', color: '#999' }}>
                                    <p>PDF preview not available in this browser.</p>
                                    <a href={iframeSrc.split('#')[0]}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{ color: '#4da6ff' }}>
                                        Open PDF directly
                                    </a>
                                </div>
                            </iframe>
                        ) : imgSrc ? (
                            <img
                                src={imgSrc}
                                alt={result.image_name}
                                className="receipt-image"
                                style={{ transform: `scale(${zoom})`, transformOrigin: 'top center', transition: 'transform 0.2s ease-in-out', willChange: 'transform' }}
                            />
                        ) : (
                            <div className="no-image">No image available</div>
                        )}
                    </div>

                    <div className="modal-data-section">
                        {result.needs_attention && (
                            <div className="attention-banner">
                                ⚠️ Amount mismatch detected — OCR: {result.ocr_amount} vs AI: {result.ai_amount}
                            </div>
                        )}

                        <div className="data-comparison">
                            <div className="data-card">
                                <h4>📝 OCR Result</h4>
                                <div className="data-fields">
                                    {editMode ? (
                                        <>
                                            <label>Bank<input value={form.ocr_bank_name || ''} onChange={e => setForm({ ...form, ocr_bank_name: e.target.value })} /></label>
                                            <label>Ref ID<input value={form.ocr_transaction_id || ''} onChange={e => setForm({ ...form, ocr_transaction_id: e.target.value })} /></label>
                                            <label>Date<input value={form.ocr_date || ''} onChange={e => setForm({ ...form, ocr_date: e.target.value })} /></label>
                                            <label>Sender<input value={form.ocr_sender || ''} onChange={e => setForm({ ...form, ocr_sender: e.target.value })} /></label>
                                            <label>Receiver<input value={form.ocr_receiver || ''} onChange={e => setForm({ ...form, ocr_receiver: e.target.value })} /></label>
                                            <label>Amount<input value={form.ocr_amount || ''} onChange={e => setForm({ ...form, ocr_amount: e.target.value })} /></label>
                                        </>
                                    ) : (
                                        <>
                                            <div className="field"><span>Bank:</span> <strong>{result.ocr_bank_name || '—'}</strong></div>
                                            <div className="field"><span>Ref ID:</span> <strong>{result.ocr_transaction_id || '—'}</strong></div>
                                            <div className="field"><span>Date:</span> <strong>{result.ocr_date || '—'}</strong></div>
                                            <div className="field"><span>Sender:</span> <strong>{result.ocr_sender || '—'}</strong></div>
                                            <div className="field"><span>Receiver:</span> <strong>{result.ocr_receiver || '—'}</strong></div>
                                            <div className="field"><span>Amount:</span> <strong>{result.ocr_amount ? `${parseFloat(result.ocr_amount).toLocaleString()} ETB` : '—'}</strong></div>
                                            {result.ocr_total_amount && <div className="field"><span>Total:</span> <strong>{parseFloat(result.ocr_total_amount).toLocaleString()} ETB</strong></div>}
                                        </>
                                    )}
                                </div>
                            </div>

                            {editMode && (
                                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '16px', padding: '10px' }}>
                                    <button
                                        type="button"
                                        onClick={transferAiToOcr}
                                        style={{ background: '#e0e7ff', color: '#4338ca', border: '1px solid #c7d2fe', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', fontSize: '18px' }}
                                        title="Copy AI to OCR"
                                    >
                                        ⬅️
                                    </button>
                                    <button
                                        type="button"
                                        onClick={transferOcrToAi}
                                        style={{ background: '#fae8ff', color: '#a21caf', border: '1px solid #f5d0fe', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', fontSize: '18px' }}
                                        title="Copy OCR to AI"
                                    >
                                        ➡️
                                    </button>
                                </div>
                            )}

                            <div className="data-card ai-card">
                                <h4>🤖 AI Result {result.ai_model_used && `(${result.ai_model_used})`}</h4>
                                <div className="data-fields">
                                    {editMode ? (
                                        <>
                                            <label>Bank<input value={form.ai_bank_name || ''} onChange={e => setForm({ ...form, ai_bank_name: e.target.value })} /></label>
                                            <label>Ref ID<input value={form.ai_reference_number || ''} onChange={e => setForm({ ...form, ai_reference_number: e.target.value })} /></label>
                                            <label>Date<input value={form.ai_date || ''} onChange={e => setForm({ ...form, ai_date: e.target.value })} /></label>
                                            <label>Sender<input value={form.ai_from_name || ''} onChange={e => setForm({ ...form, ai_from_name: e.target.value })} /></label>
                                            <label>Receiver<input value={form.ai_to_name || ''} onChange={e => setForm({ ...form, ai_to_name: e.target.value })} /></label>
                                            <label>Amount<input value={form.ai_amount || ''} onChange={e => setForm({ ...form, ai_amount: e.target.value })} /></label>
                                        </>
                                    ) : (
                                        <>
                                            <div className="field"><span>Bank:</span> <strong>{result.ai_bank_name || '—'}</strong></div>
                                            <div className="field"><span>Ref ID:</span> <strong>{result.ai_reference_number || '—'}</strong></div>
                                            <div className="field"><span>Date:</span> <strong>{result.ai_date || '—'}</strong></div>
                                            <div className="field"><span>From:</span> <strong>{result.ai_from_name || '—'}</strong></div>
                                            <div className="field"><span>To:</span> <strong>{result.ai_to_name || '—'}</strong></div>
                                            <div className="field"><span>Amount:</span> <strong>{result.ai_amount ? `${parseFloat(result.ai_amount).toLocaleString()} ETB` : '—'}</strong></div>
                                            {result.ai_description && <div className="field"><span>Desc:</span> <strong>{result.ai_description}</strong></div>}
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
