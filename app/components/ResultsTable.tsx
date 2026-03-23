'use client';

import { useState, useMemo, Fragment } from 'react';
import api from '../api';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

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

interface RedoPreview {
    result_id: number;
    type: 'ocr' | 'ai';
    model?: string;
    data: Record<string, string | null>;
}

interface ResultsTableProps {
    results: TransactionResult[];
    onViewImage: (result: TransactionResult) => void;
    onEditResult: (result: TransactionResult) => void;
    onResultUpdated?: (updated: TransactionResult) => void;
}

export default function ResultsTable({ results, onViewImage, onEditResult, onResultUpdated }: ResultsTableProps) {
    const [viewMode, setViewMode] = useState<'all' | 'ocr' | 'ai' | 'synced'>('all');
    const [redoLoading, setRedoLoading] = useState<Record<string, boolean>>({});
    const [redoPreview, setRedoPreview] = useState<RedoPreview | null>(null);
    const [updating, setUpdating] = useState(false);
    const [redoError, setRedoError] = useState<string | null>(null);
    const [aiRedoChooser, setAiRedoChooser] = useState<TransactionResult | null>(null);
    const [takeAiResult, setTakeAiResult] = useState(false);
    const [applyDateFix, setApplyDateFix] = useState(false);
    const [useAiDate, setUseAiDate] = useState(false);

    // Helper for "synced" view mode to merge text values
    const getSyncedValue = (ocrVal: string | null | undefined, aiVal: string | null | undefined): string => {
        const ocrStr = (ocrVal || '').trim();
        const aiStr = (aiVal || '').trim();

        if (!ocrStr && !aiStr) return '—';
        if (!ocrStr) return aiStr;
        if (!aiStr) return ocrStr;
        if (ocrStr.toLowerCase() === aiStr.toLowerCase()) return aiStr;
        return aiStr;
    };

    const processedResults = useMemo(() => {
        if (!applyDateFix || results.length === 0) return results;

        const fixed = results.map(r => ({ ...r }));

        const parseDate = (d: string) => {
            const parts = d.split(/[-/]/);
            if (parts.length < 3) return null;
            const ds = parseInt(parts[0], 10);
            const ms = parseInt(parts[1], 10);
            const ys = parseInt(parts[2], 10);
            if (isNaN(ds) || isNaN(ms) || isNaN(ys)) return null;
            return { d: ds, m: ms, y: ys > 100 ? ys : ys + 2000, delim: d.includes('-') ? '-' : '/' };
        };

        const dateToValue = (y: number, m: number, d: number) => {
            if (m < 1 || m > 12 || d < 1 || d > 31) return null;
            return new Date(y, m - 1, d).getTime();
        };

        const yearCounts: Record<number, number> = {};
        fixed.slice(0, 20).forEach(r => {
            const dateStr = getSyncedValue(r.ocr_date, r.ai_date);
            const p = parseDate(dateStr);
            if (p && p.y > 2000 && p.y < 2100) {
                yearCounts[p.y] = (yearCounts[p.y] || 0) + 1;
            }
        });

        let majorityYear = new Date().getFullYear();
        let maxCount = 0;
        for (const [y, count] of Object.entries(yearCounts)) {
            if (count > maxCount) {
                maxCount = count;
                majorityYear = parseInt(y, 10);
            }
        }

        let currentRef = { d: 31, m: 12, y: majorityYear };
        for (const r of fixed) {
            const p = parseDate(getSyncedValue(r.ocr_date, r.ai_date));
            if (p) {
                const isSwapped = p.d <= 12 && p.m > 12;
                currentRef = { d: isSwapped ? p.m : p.d, m: isSwapped ? p.d : p.m, y: majorityYear };
                break;
            }
        }

        for (let i = 0; i < fixed.length; i++) {
            const r = fixed[i];
            const dateStr = getSyncedValue(r.ocr_date, r.ai_date);
            if (!dateStr || dateStr === '—') continue;

            const parsed = parseDate(dateStr);
            if (!parsed) continue;

            let { d, m, y, delim } = parsed;
            let modified = false;

            if (Math.abs(y - currentRef.y) > 1) {
                y = currentRef.y;
                modified = true;
            }

            const val1 = dateToValue(y, m, d);
            const val2 = dateToValue(y, d, m);
            const refVal = dateToValue(currentRef.y, currentRef.m, currentRef.d) || 0;

            if (val1 && val2) {
                const diff1 = val1 - refVal;
                const diff2 = val2 - refVal;

                if (diff1 > 0 && diff2 <= 0) {
                    const temp = m; m = d; d = temp;
                    modified = true;
                } else if (diff1 > 0 && diff2 > 0) {
                    if (diff2 < diff1) {
                        const temp = m; m = d; d = temp;
                        modified = true;
                    }
                }
            } else if (!val1 && val2) {
                const temp = m; m = d; d = temp;
                modified = true;
            }

            if (modified) {
                const newStr = `${d.toString().padStart(2, '0')}${delim}${m.toString().padStart(2, '0')}${delim}${y}`;
                if (r.ai_date) r.ai_date = newStr;
                if (r.ocr_date) r.ocr_date = newStr;
            }

            currentRef = { d, m, y };
        }

        return fixed;
    }, [results, applyDateFix]);

    const handleRedoOcr = async (result: TransactionResult) => {
        const key = `ocr-${result.id}`;
        setRedoLoading(prev => ({ ...prev, [key]: true }));
        setRedoError(null);
        try {
            const res = await api.post(`/results/${result.id}/redo-ocr/`);
            setRedoPreview(res.data);
        } catch (err: any) {
            setRedoError(err.response?.data?.error || 'OCR redo failed');
        } finally {
            setRedoLoading(prev => ({ ...prev, [key]: false }));
        }
    };

    const handleRedoAi = async (result: TransactionResult, model: string) => {
        setAiRedoChooser(null);
        const key = `ai-${result.id}`;
        setRedoLoading(prev => ({ ...prev, [key]: true }));
        setRedoError(null);
        try {
            const res = await api.post(`/results/${result.id}/redo-ai/`, {
                ai_model: model,
            });
            setRedoPreview(res.data);
        } catch (err: any) {
            setRedoError(err.response?.data?.error || 'AI redo failed');
        } finally {
            setRedoLoading(prev => ({ ...prev, [key]: false }));
        }
    };

    const handleConfirmUpdate = async () => {
        if (!redoPreview) return;
        setUpdating(true);
        try {
            const res = await api.patch(`/results/${redoPreview.result_id}/update/`, redoPreview.data);
            if (onResultUpdated) {
                onResultUpdated(res.data);
            }
            setRedoPreview(null);
        } catch (err: any) {
            setRedoError(err.response?.data?.error || 'Update failed');
        } finally {
            setUpdating(false);
        }
    };

    // Other helpers

    // Special helper for Bank Name to prefer a named bank over "Other"
    const getSyncedBank = (ocrVal: string | null | undefined, aiVal: string | null | undefined): string => {
        const ocrStr = (ocrVal || '').trim();
        const aiStr = (aiVal || '').trim();

        if (!ocrStr && !aiStr) return '—';
        if (!ocrStr) return aiStr;
        if (!aiStr) return ocrStr;

        const ocrIsOther = ocrStr.toLowerCase() === 'other';
        const aiIsOther = aiStr.toLowerCase() === 'other';

        if (ocrIsOther && !aiIsOther) return aiStr;
        if (aiIsOther && !ocrIsOther) return ocrStr;

        // If both are Other or neither are Other but they conflict, prioritize OCR as a base truth
        return ocrStr;
    };

    const fieldLabels: Record<string, string> = {
        ocr_bank_name: 'Bank',
        ocr_transaction_id: 'Ref ID',
        ocr_date: 'Date',
        ocr_sender: 'Sender',
        ocr_receiver: 'Receiver',
        ocr_amount: 'Amount',
        ocr_total_amount: 'Total Amount',
        ai_bank_name: 'Bank',
        ai_reference_number: 'Ref ID',
        ai_date: 'Date',
        ai_from_name: 'Sender',
        ai_to_name: 'Receiver',
        ai_amount: 'Amount',
        ai_description: 'Description',
        ai_model_used: 'Model',
    };

    const exportToExcel = () => {
        const formatAmountForExcel = (val: string | number | null | undefined): number => {
            if (val === null || val === undefined) return 0;
            if (typeof val === 'number') return val;
            const num = parseFloat(val.toString().replace(/,/g, '').trim());
            return isNaN(num) ? 0 : num;
        };

        const rows = processedResults.map((r, idx) => {
            const base: Record<string, any> = { '#': idx + 1, 'Image': r.image_name, 'Status': r.status };
            if (viewMode === 'all' || viewMode === 'ocr') {
                base['OCR Bank'] = r.ocr_bank_name || '';
                base['OCR Ref ID'] = r.ocr_transaction_id || '';
                base['OCR Date'] = r.ocr_date || '';
                base['OCR Sender'] = r.ocr_sender || '';
                base['OCR Receiver'] = r.ocr_receiver || '';
                base['OCR Amount'] = formatAmountForExcel(r.ocr_amount);
                if (r.ocr_total_amount) {
                    base['OCR Total Amount'] = formatAmountForExcel(r.ocr_total_amount);
                }
            }
            if (viewMode === 'all' || viewMode === 'ai') {
                base['AI Bank'] = r.ai_bank_name || '';
                base['AI Ref ID'] = r.ai_reference_number || '';
                base['AI Date'] = r.ai_date || '';
                base['AI Sender'] = r.ai_from_name || '';
                base['AI Receiver'] = r.ai_to_name || '';
                base['AI Amount'] = formatAmountForExcel(r.ai_amount);
                base['AI Model'] = r.ai_model_used || '';
            }
            if (viewMode === 'synced') {
                base['Bank'] = getSyncedBank(r.ocr_bank_name, r.ai_bank_name);
                base['Ref ID'] = getSyncedValue(r.ocr_transaction_id, r.ai_reference_number);
                base['Date'] = useAiDate ? (r.ai_date || r.ocr_date || '') : getSyncedValue(r.ocr_date, r.ai_date);
                base['Sender'] = getSyncedValue(r.ocr_sender, r.ai_from_name);
                base['Receiver'] = getSyncedValue(r.ocr_receiver, r.ai_to_name);

                const rawAmount = r.needs_attention && !takeAiResult
                    ? `Mismatch (OCR: ${r.ocr_amount || 'None'} / AI: ${r.ai_amount || 'None'})`
                    : (r.ai_amount || r.ocr_amount || '');
                base['Amount'] = formatAmountForExcel(rawAmount);
            }
            base['Needs Attention'] = r.needs_attention ? 'Yes' : 'No';
            return base;
        });

        const ws = XLSX.utils.json_to_sheet(rows);

        // Apply number formatting to amount columns
        const range = XLSX.utils.decode_range(ws['!ref'] || '');
        for (let C = range.s.c; C <= range.e.c; ++C) {
            const address = XLSX.utils.encode_col(C) + '1';
            if (!ws[address]) continue;
            const headerName = ws[address].v;
            if (['OCR Amount', 'OCR Total Amount', 'AI Amount', 'Amount'].includes(headerName)) {
                for (let R = range.s.r + 1; R <= range.e.r; ++R) {
                    const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
                    if (ws[cellAddress]) {
                        ws[cellAddress].t = 'n';
                        ws[cellAddress].z = '#,##0.00';
                    }
                }
            }
        }

        // Auto-size columns
        const colWidths = Object.keys(rows[0] || {}).map(key => ({ wch: Math.max(key.length + 2, 15) }));
        ws['!cols'] = colWidths;
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Results');
        const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        saveAs(new Blob([buf], { type: 'application/octet-stream' }), `analysis_results_${viewMode}.xlsx`);
    };

    const exportToPdf = () => {
        const showOcr = viewMode === 'all' || viewMode === 'ocr';
        const showAi = viewMode === 'all' || viewMode === 'ai';
        const showSynced = viewMode === 'synced';

        let headers = '<th>#</th><th>Image</th>';
        if (showSynced) {
            headers += '<th>Bank</th><th>Ref</th><th>Date</th><th>Sender</th><th>Receiver</th><th>Amount</th>';
        } else {
            if (showOcr) headers += '<th>OCR Bank</th><th>OCR Ref</th><th>OCR Date</th><th>OCR Sender</th><th>OCR Receiver</th><th>OCR Amount</th>';
            if (showAi) headers += '<th>AI Bank</th><th>AI Ref</th><th>AI Date</th><th>AI Sender</th><th>AI Receiver</th><th>AI Amount</th><th>Model</th>';
        }
        headers += '<th>Status</th>';

        let rows = '';
        processedResults.forEach((r, idx) => {
            rows += '<tr>';
            rows += `<td>${idx + 1}</td><td>${r.image_name}</td>`;
            if (showSynced) {
                const amountText = r.needs_attention && !takeAiResult ? '⚠️ Mismatch' : (r.ai_amount || r.ocr_amount || '');
                rows += `<td>${getSyncedBank(r.ocr_bank_name, r.ai_bank_name)}</td>
                         <td>${getSyncedValue(r.ocr_transaction_id, r.ai_reference_number)}</td>
                         <td>${useAiDate ? (r.ai_date || r.ocr_date || '') : getSyncedValue(r.ocr_date, r.ai_date)}</td>
                         <td>${getSyncedValue(r.ocr_sender, r.ai_from_name)}</td>
                         <td>${getSyncedValue(r.ocr_receiver, r.ai_to_name)}</td>
                         <td>${amountText}</td>`;
            } else {
                if (showOcr) {
                    rows += `<td>${r.ocr_bank_name || ''}</td><td>${r.ocr_transaction_id || ''}</td><td>${r.ocr_date || ''}</td><td>${r.ocr_sender || ''}</td><td>${r.ocr_receiver || ''}</td><td>${r.ocr_amount ? parseFloat(r.ocr_amount).toLocaleString() : ''}</td>`;
                }
                if (showAi) {
                    rows += `<td>${r.ai_bank_name || ''}</td><td>${r.ai_reference_number || ''}</td><td>${r.ai_date || ''}</td><td>${r.ai_from_name || ''}</td><td>${r.ai_to_name || ''}</td><td>${r.ai_amount ? parseFloat(r.ai_amount).toLocaleString() : ''}</td><td>${r.ai_model_used || ''}</td>`;
                }
            }
            rows += `<td>${r.status}</td>`;
            rows += '</tr>';
        });

        const html = `<!DOCTYPE html><html><head><title>Analysis Results</title>
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
        <h1>📊 Analysis Results — ${viewMode.toUpperCase()}</h1>
        <p>${processedResults.length} transactions • Exported ${new Date().toLocaleString()}</p>
        <table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>
        </body></html>`;

        const w = window.open('', '_blank');
        if (w) { w.document.write(html); w.document.close(); w.print(); }
    };

    return (
        <div className="results-table-wrapper">
            <div className="results-view-tabs" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <button
                    className={`btn tab-btn ${viewMode === 'all' ? 'active' : ''}`}
                    onClick={() => setViewMode('all')}
                >
                    📑 All Data
                </button>
                <button
                    className={`btn tab-btn ${viewMode === 'ocr' ? 'active' : ''}`}
                    onClick={() => setViewMode('ocr')}
                >
                    📄 OCR Only
                </button>
                <button
                    className={`btn tab-btn ${viewMode === 'ai' ? 'active' : ''}`}
                    onClick={() => setViewMode('ai')}
                >
                    🤖 AI Only
                </button>
                <button
                    className={`btn tab-btn ${viewMode === 'synced' ? 'active' : ''}`}
                    onClick={() => setViewMode('synced')}
                >
                    🔮 Synced
                </button>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {viewMode === 'synced' && (
                        <>
                            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '6px', marginRight: '8px', background: '#f3f4f6', padding: '4px 10px', borderRadius: '6px', fontSize: '13px', fontWeight: 500 }}>
                                <input
                                    type="checkbox"
                                    checked={applyDateFix}
                                    onChange={(e) => setApplyDateFix(e.target.checked)}
                                    style={{ accentColor: '#10b981' }}
                                />
                                📅 Apply Date Fix
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '6px', marginRight: '8px', background: '#f3f4f6', padding: '4px 10px', borderRadius: '6px', fontSize: '13px', fontWeight: 500 }}>
                                <input
                                    type="checkbox"
                                    checked={takeAiResult}
                                    onChange={(e) => setTakeAiResult(e.target.checked)}
                                    style={{ accentColor: '#7c3aed' }}
                                />
                                🤖 Take AI Result
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '6px', marginRight: '8px', background: '#f3f4f6', padding: '4px 10px', borderRadius: '6px', fontSize: '13px', fontWeight: 500 }}>
                                <input
                                    type="checkbox"
                                    checked={useAiDate}
                                    onChange={(e) => setUseAiDate(e.target.checked)}
                                    style={{ accentColor: '#0ea5e9' }}
                                />
                                📅 Use AI Date
                            </label>
                        </>
                    )}
                    <button
                        className="btn btn-sm"
                        onClick={exportToExcel}
                        disabled={results.length === 0}
                        style={{ background: '#217346', color: '#fff', border: 'none', borderRadius: '8px', padding: '6px 14px', fontSize: '13px', fontWeight: 600 }}
                    >
                        📊 Export Excel
                    </button>
                    <button
                        className="btn btn-sm"
                        onClick={exportToPdf}
                        disabled={results.length === 0}
                        style={{ background: '#dc3545', color: '#fff', border: 'none', borderRadius: '8px', padding: '6px 14px', fontSize: '13px', fontWeight: 600 }}
                    >
                        📄 Export PDF
                    </button>
                </div>
            </div>

            <table className="results-table">
                <thead>
                    <tr>
                        <th className="col-no">#</th>
                        <th className="col-type">Type</th>
                        <th className="col-image">Image</th>
                        <th className="col-bank">Bank</th>
                        <th className="col-ref">Ref ID</th>
                        <th className="col-date">Date</th>
                        <th className="col-sender">Sender</th>
                        <th className="col-receiver">Receiver</th>
                        <th className="col-amount">Amount</th>
                        <th className="col-status">Status</th>
                        <th className="col-actions">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {processedResults.map((result, idx) => {
                        const showOcr = viewMode === 'all' || viewMode === 'ocr';
                        const showAi = viewMode === 'all' || viewMode === 'ai';
                        const rowSpan = (showOcr && showAi) ? 2 : 1;

                        return (
                            <Fragment key={result.id}>
                                {/* OCR Row */}
                                {showOcr && (
                                    <tr
                                        key={`ocr-${result.id}`}
                                        className={`row-ocr ${result.needs_attention ? 'needs-attention' : ''}`}
                                    >
                                        <td rowSpan={rowSpan} className="col-no">
                                            <span className="row-number">{idx + 1}</span>
                                            {result.needs_attention && (
                                                <span className="attention-icon" title="Needs attention">⚠️</span>
                                            )}
                                        </td>
                                        <td className="type-badge ocr-badge">OCR</td>
                                        <td rowSpan={rowSpan} className="col-image">
                                            <div className="flex flex-col gap-2">
                                                <span className="text-xs font-mono bg-gray-100 px-2 py-1 rounded text-gray-600 truncate max-w-[120px]" title={result.image_name}>
                                                    {result.image_name}
                                                </span>
                                                {result.is_pdf && (
                                                    <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded bg-red-50 text-red-600 border border-red-100 w-fit">
                                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                        </svg>
                                                        PDF
                                                    </span>
                                                )}
                                                <div className="flex gap-2 mt-1">
                                                    <button
                                                        onClick={() => onViewImage(result)}
                                                        className="text-xs font-medium text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded transition-colors w-full text-center"
                                                    >
                                                        {result.is_pdf ? 'View Doc' : 'View Image'}
                                                    </button>
                                                </div>
                                            </div>
                                        </td>
                                        <td>{result.ocr_bank_name || '—'}</td>
                                        <td className="mono">{result.ocr_transaction_id || '—'}</td>
                                        <td>{result.ocr_date || '—'}</td>
                                        <td>{result.ocr_sender || '—'}</td>
                                        <td>{result.ocr_receiver || '—'}</td>
                                        <td className="amount-cell">
                                            {result.ocr_amount ? parseFloat(result.ocr_amount).toLocaleString() : '—'}
                                        </td>
                                        <td rowSpan={rowSpan}>
                                            <span className={`status-badge status-${result.status}`}>
                                                {result.status}
                                            </span>
                                        </td>
                                        <td rowSpan={rowSpan} className="col-actions">
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                <button
                                                    className="btn btn-sm btn-edit"
                                                    onClick={() => onEditResult(result)}
                                                >
                                                    ✏️ Edit
                                                </button>
                                                <button
                                                    className="btn btn-sm"
                                                    onClick={() => handleRedoOcr(result)}
                                                    disabled={!!redoLoading[`ocr-${result.id}`]}
                                                    style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', padding: '4px 8px', fontSize: '0.75rem', cursor: 'pointer', opacity: redoLoading[`ocr-${result.id}`] ? 0.6 : 1 }}
                                                >
                                                    {redoLoading[`ocr-${result.id}`] ? '⏳ Running...' : '🔄 OCR Redo'}
                                                </button>
                                                <button
                                                    className="btn btn-sm"
                                                    onClick={() => setAiRedoChooser(result)}
                                                    disabled={!!redoLoading[`ai-${result.id}`]}
                                                    style={{ background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '6px', padding: '4px 8px', fontSize: '0.75rem', cursor: 'pointer', opacity: redoLoading[`ai-${result.id}`] ? 0.6 : 1 }}
                                                >
                                                    {redoLoading[`ai-${result.id}`] ? '⏳ Running...' : '🤖 AI Redo'}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                )}

                                {/* AI Row */}
                                {showAi && (
                                    <tr
                                        key={`ai-${result.id}`}
                                        className={`row-ai ${result.needs_attention ? 'needs-attention' : ''}`}
                                    >
                                        <td className="type-badge ai-badge">
                                            {result.ai_model_used ? `AI (${result.ai_model_used})` : 'AI'}
                                        </td>
                                        <td>{result.ai_bank_name || '—'}</td>
                                        <td className="mono">{result.ai_reference_number || '—'}</td>
                                        <td>{result.ai_date || '—'}</td>
                                        <td>{result.ai_from_name || '—'}</td>
                                        <td>{result.ai_to_name || '—'}</td>
                                        <td className={`amount-cell ${result.needs_attention ? 'amount-mismatch' : ''}`}>
                                            {result.ai_amount ? parseFloat(result.ai_amount).toLocaleString() : '—'}
                                        </td>
                                        {/* If showing AI ONLY, we need to balance the columns since the OCR row isn't there doing it */}
                                        {!showOcr && (
                                            <>
                                                <td>
                                                    <span className={`status-badge status-${result.status}`}>{result.status}</span>
                                                </td>
                                                <td className="col-actions">
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                        <button className="btn btn-sm btn-edit" onClick={() => onEditResult(result)}>✏️ Edit</button>
                                                        <button
                                                            className="btn btn-sm"
                                                            onClick={() => handleRedoOcr(result)}
                                                            disabled={!!redoLoading[`ocr-${result.id}`]}
                                                            style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', padding: '4px 8px', fontSize: '0.75rem', cursor: 'pointer', opacity: redoLoading[`ocr-${result.id}`] ? 0.6 : 1 }}
                                                        >
                                                            {redoLoading[`ocr-${result.id}`] ? '⏳ Running...' : '🔄 OCR Redo'}
                                                        </button>
                                                        <button
                                                            className="btn btn-sm"
                                                            onClick={() => setAiRedoChooser(result)}
                                                            disabled={!!redoLoading[`ai-${result.id}`]}
                                                            style={{ background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '6px', padding: '4px 8px', fontSize: '0.75rem', cursor: 'pointer', opacity: redoLoading[`ai-${result.id}`] ? 0.6 : 1 }}
                                                        >
                                                            {redoLoading[`ai-${result.id}`] ? '⏳ Running...' : '🤖 AI Redo'}
                                                        </button>
                                                    </div>
                                                </td>
                                            </>
                                        )}
                                    </tr>
                                )}

                                {/* SYNCED Row */}
                                {viewMode === 'synced' && (
                                    <tr
                                        key={`synced-${result.id}`}
                                        className={`row-synced ${result.needs_attention ? 'needs-attention' : ''}`}
                                    >
                                        <td className="col-no">
                                            <span className="row-number">{idx + 1}</span>
                                            {result.needs_attention && (
                                                <span className="attention-icon" title="Needs attention">⚠️</span>
                                            )}
                                        </td>
                                        <td className="type-badge" style={{ backgroundColor: '#f3e8ff', color: '#9333ea', border: '1px solid #d8b4fe' }}>
                                            Synced
                                        </td>
                                        <td className="col-image">
                                            <div className="flex flex-col gap-2">
                                                <span className="text-xs font-mono bg-gray-100 px-2 py-1 rounded text-gray-600 truncate max-w-[120px]" title={result.image_name}>
                                                    {result.image_name}
                                                </span>
                                                {result.is_pdf && (
                                                    <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded bg-red-50 text-red-600 border border-red-100 w-fit">
                                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                        </svg>
                                                        PDF
                                                    </span>
                                                )}
                                                <div className="flex gap-2 mt-1">
                                                    <button
                                                        onClick={() => onViewImage(result)}
                                                        className="text-xs font-medium text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded transition-colors w-full text-center"
                                                    >
                                                        {result.is_pdf ? 'View Doc' : 'View Image'}
                                                    </button>
                                                </div>
                                            </div>
                                        </td>
                                        <td>{getSyncedBank(result.ocr_bank_name, result.ai_bank_name)}</td>
                                        <td className="mono" style={{ maxWidth: '180px', wordBreak: 'break-all' }}>
                                            {getSyncedValue(result.ocr_transaction_id, result.ai_reference_number)}
                                        </td>
                                        <td>{useAiDate ? (result.ai_date || result.ocr_date || '—') : getSyncedValue(result.ocr_date, result.ai_date)}</td>
                                        <td>{getSyncedValue(result.ocr_sender, result.ai_from_name)}</td>
                                        <td>{getSyncedValue(result.ocr_receiver, result.ai_to_name)}</td>
                                        <td className={`amount-cell ${result.needs_attention && !takeAiResult ? 'amount-mismatch' : ''}`} style={{ minWidth: '160px' }}>
                                            {result.needs_attention && !takeAiResult ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', padding: '6px', borderRadius: '6px', alignItems: 'center' }}>
                                                    <strong style={{ fontSize: '11px', color: '#dc2626', textTransform: 'uppercase' }}>⚠️ Needs Resolution</strong>
                                                    <div style={{ fontSize: '11px', lineHeight: '1.4' }}>
                                                        OCR: <strong>{result.ocr_amount ? parseFloat(result.ocr_amount).toLocaleString() : 'N/A'}</strong><br />
                                                        AI: <strong>{result.ai_amount ? parseFloat(result.ai_amount).toLocaleString() : 'N/A'}</strong>
                                                    </div>
                                                    <button
                                                        onClick={() => onEditResult(result)}
                                                        style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: '4px', padding: '4px 10px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer', width: '100%' }}
                                                    >
                                                        ✏️ Resolve Now
                                                    </button>
                                                </div>
                                            ) : (
                                                (result.ai_amount || result.ocr_amount) ? parseFloat((result.ai_amount || result.ocr_amount)!).toLocaleString() : '—'
                                            )}
                                        </td>
                                        <td>
                                            <span className={`status-badge status-${result.status}`}>{result.status}</span>
                                        </td>
                                        <td className="col-actions">
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                <button className="btn btn-sm btn-edit" onClick={() => onEditResult(result)}>✏️ Edit</button>
                                                <button
                                                    className="btn btn-sm"
                                                    onClick={() => handleRedoOcr(result)}
                                                    disabled={!!redoLoading[`ocr-${result.id}`]}
                                                    style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', padding: '4px 8px', fontSize: '0.75rem', cursor: 'pointer', opacity: redoLoading[`ocr-${result.id}`] ? 0.6 : 1 }}
                                                >
                                                    {redoLoading[`ocr-${result.id}`] ? '⏳ Running...' : '🔄 OCR Redo'}
                                                </button>
                                                <button
                                                    className="btn btn-sm"
                                                    onClick={() => setAiRedoChooser(result)}
                                                    disabled={!!redoLoading[`ai-${result.id}`]}
                                                    style={{ background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '6px', padding: '4px 8px', fontSize: '0.75rem', cursor: 'pointer', opacity: redoLoading[`ai-${result.id}`] ? 0.6 : 1 }}
                                                >
                                                    {redoLoading[`ai-${result.id}`] ? '⏳ Running...' : '🤖 AI Redo'}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </Fragment>
                        );
                    })}
                </tbody>
            </table>
            {
                processedResults.length === 0 && (
                    <div className="empty-state">
                        <p>No results yet. Start an analysis to see transaction data here.</p>
                    </div>
                )
            }

            {/* Redo Preview Modal */}
            {
                (redoPreview || redoError) && (
                    <div className="image-viewer-overlay" onClick={() => { setRedoPreview(null); setRedoError(null); }}>
                        <div className="image-viewer-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
                            <div className="modal-header">
                                <h3>
                                    {redoPreview ? (
                                        redoPreview.type === 'ocr' ? '🔄 OCR Redo Result' : `🤖 AI Redo Result (${redoPreview.model || 'gemini'})`
                                    ) : '❌ Redo Error'}
                                </h3>
                                <button className="btn btn-close" onClick={() => { setRedoPreview(null); setRedoError(null); }}>✕</button>
                            </div>
                            <div className="modal-body" style={{ padding: '1.5rem' }}>
                                {redoError && (
                                    <div className="attention-banner" style={{ marginBottom: '1rem' }}>
                                        ❌ {redoError}
                                    </div>
                                )}
                                {redoPreview && (
                                    <>
                                        <div className="data-card" style={{ marginBottom: '1.5rem' }}>
                                            <h4>{redoPreview.type === 'ocr' ? '📝 New OCR Data' : '🤖 New AI Data'}</h4>
                                            <div className="data-fields">
                                                {Object.entries(redoPreview.data).map(([key, value]) => (
                                                    <div className="field" key={key}>
                                                        <span>{fieldLabels[key] || key}:</span>{' '}
                                                        <strong>{value || '—'}</strong>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                                            <button
                                                className="btn btn-success"
                                                onClick={handleConfirmUpdate}
                                                disabled={updating}
                                                style={{ padding: '0.5rem 1.5rem', borderRadius: '8px', fontWeight: 600 }}
                                            >
                                                {updating ? '⏳ Updating...' : '✅ Update'}
                                            </button>
                                            <button
                                                className="btn btn-secondary"
                                                onClick={() => setRedoPreview(null)}
                                                style={{ padding: '0.5rem 1.5rem', borderRadius: '8px' }}
                                            >
                                                ❌ Cancel
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                )
            }
            {/* AI Model Chooser Modal */}
            {
                aiRedoChooser && (
                    <div className="image-viewer-overlay" onClick={() => setAiRedoChooser(null)}>
                        <div className="image-viewer-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '360px' }}>
                            <div className="modal-header">
                                <h3>🤖 Choose AI Model</h3>
                                <button className="btn btn-close" onClick={() => setAiRedoChooser(null)}>✕</button>
                            </div>
                            <div className="modal-body" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <p style={{ margin: 0, opacity: 0.7, fontSize: '0.9rem' }}>Select the AI model to re-analyze <strong>{aiRedoChooser.image_name}</strong>:</p>
                                <button
                                    onClick={() => handleRedoAi(aiRedoChooser, 'gemini')}
                                    style={{ padding: '12px 20px', borderRadius: '10px', border: '2px solid #4285f4', background: 'rgba(66,133,244,0.1)', color: '#4285f4', fontSize: '1rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}
                                >
                                    ✨ Gemini 2.0 Flash
                                    <span style={{ marginLeft: 'auto', fontSize: '0.75rem', opacity: 0.7 }}>Fast</span>
                                </button>
                                <button
                                    onClick={() => handleRedoAi(aiRedoChooser, 'chatgpt')}
                                    style={{ padding: '12px 20px', borderRadius: '10px', border: '2px solid #10a37f', background: 'rgba(16,163,127,0.1)', color: '#10a37f', fontSize: '1rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}
                                >
                                    🧠 ChatGPT (GPT-4o)
                                    <span style={{ marginLeft: 'auto', fontSize: '0.75rem', opacity: 0.7 }}>Precise</span>
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
}
