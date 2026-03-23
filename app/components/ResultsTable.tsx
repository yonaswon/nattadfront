'use client';

import { useState, useMemo, Fragment } from 'react';
import api from '../api';
import * as XLSX from 'xlsx-js-style';
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
            if (!d || d === '—') return null;
            const parts = d.split(/[-/]/);
            if (parts.length < 3) return null;
            const ds = parseInt(parts[0], 10);
            const ms = parseInt(parts[1], 10);
            const ys = parseInt(parts[2], 10);
            if (isNaN(ds) || isNaN(ms) || isNaN(ys)) return null;
            return { d: ds, m: ms, y: ys > 100 ? ys : ys + 2000, delim: d.includes('-') ? '-' : '/' };
        };

        const toTimestamp = (y: number, m: number, d: number): number | null => {
            if (m < 1 || m > 12 || d < 1 || d > 31) return null;
            return new Date(y, m - 1, d).getTime();
        };

        const formatDate = (d: number, m: number, y: number, delim: string) =>
            `${d.toString().padStart(2, '0')}${delim}${m.toString().padStart(2, '0')}${delim}${y}`;

        // ── Pass 1: Determine majority year from all dates ──
        const yearCounts: Record<number, number> = {};
        fixed.forEach(r => {
            const p = parseDate(getSyncedValue(r.ocr_date, r.ai_date));
            if (p && p.y > 2000 && p.y < 2100) {
                yearCounts[p.y] = (yearCounts[p.y] || 0) + 1;
            }
        });
        let majorityYear = new Date().getFullYear();
        let maxCount = 0;
        for (const [y, count] of Object.entries(yearCounts)) {
            if (count > maxCount) { maxCount = count; majorityYear = parseInt(y, 10); }
        }

        // ── Pass 2: Build resolved dates array ──
        // For each row, determine the correct DD/MM/YYYY interpretation.
        // resolved[i] = { day, month, year, ts, delim } or null if no date
        type Resolved = { day: number; month: number; year: number; ts: number; delim: string };
        const resolved: (Resolved | null)[] = new Array(fixed.length).fill(null);

        // First resolve UNAMBIGUOUS dates (where one part > 12, so we know which is day vs month)
        for (let i = 0; i < fixed.length; i++) {
            const dateStr = getSyncedValue(fixed[i].ocr_date, fixed[i].ai_date);
            const p = parseDate(dateStr);
            if (!p) continue;

            let { d, m, y, delim } = p;
            // Fix year
            if (Math.abs(y - majorityYear) > 1) y = majorityYear;

            if (d > 12 && m <= 12) {
                // d must be the day (>12 can't be month) → DD/MM format, correct as-is
                const ts = toTimestamp(y, m, d);
                if (ts !== null) resolved[i] = { day: d, month: m, year: y, ts, delim };
            } else if (m > 12 && d <= 12) {
                // m position holds a value >12, so it must actually be the day → swap
                const ts = toTimestamp(y, d, m);
                if (ts !== null) resolved[i] = { day: m, month: d, year: y, ts, delim };
            }
            // If both <= 12, it's ambiguous — skip for now
        }

        // ── Pass 3: Determine sort direction from unambiguous dates ──
        // Compare pairs of resolved dates to vote on ascending vs descending
        let ascVotes = 0, descVotes = 0;
        let prevResolved: Resolved | null = null;
        for (let i = 0; i < resolved.length; i++) {
            if (resolved[i]) {
                if (prevResolved) {
                    if (resolved[i]!.ts < prevResolved.ts) descVotes++;
                    else if (resolved[i]!.ts > prevResolved.ts) ascVotes++;
                }
                prevResolved = resolved[i];
            }
        }
        const isDescending = descVotes >= ascVotes; // true = newest first (most common)

        // ── Pass 4: Resolve ambiguous dates ITERATIVELY using nearby anchors ──
        // After resolving each date, it immediately becomes an anchor for neighbors.
        // Search up to 20 rows in each direction for anchors.
        const ANCHOR_SEARCH = 20;

        const resolveAmbiguous = (idx: number) => {
            if (resolved[idx]) return; // already resolved

            const dateStr = getSyncedValue(fixed[idx].ocr_date, fixed[idx].ai_date);
            const p = parseDate(dateStr);
            if (!p) return;

            let { d, m, y, delim } = p;
            if (Math.abs(y - majorityYear) > 1) y = majorityYear;

            if (!(d <= 12 && m <= 12)) return; // not ambiguous

            // Collect resolved anchor dates above and below
            const anchorsAbove: Resolved[] = [];
            const anchorsBelow: Resolved[] = [];
            for (let j = idx - 1; j >= 0 && anchorsAbove.length < ANCHOR_SEARCH; j--) {
                if (resolved[j]) anchorsAbove.push(resolved[j]!);
            }
            for (let j = idx + 1; j < fixed.length && anchorsBelow.length < ANCHOR_SEARCH; j++) {
                if (resolved[j]) anchorsBelow.push(resolved[j]!);
            }

            const allAnchors = [...anchorsAbove, ...anchorsBelow];

            const ts1 = toTimestamp(y, m, d);
            const ts2 = toTimestamp(y, d, m);

            if (ts1 !== null && ts2 !== null && allAnchors.length > 0) {
                let score1 = 0, score2 = 0;
                const PENALTY = 365 * 24 * 60 * 60 * 1000; // 1 year penalty for breaking sort order

                if (anchorsAbove.length > 0) {
                    const nearestAbove = anchorsAbove[0];
                    if (isDescending) {
                        if (ts1 > nearestAbove.ts) score1 += PENALTY;
                        if (ts2 > nearestAbove.ts) score2 += PENALTY;
                    } else {
                        if (ts1 < nearestAbove.ts) score1 += PENALTY;
                        if (ts2 < nearestAbove.ts) score2 += PENALTY;
                    }
                }

                if (anchorsBelow.length > 0) {
                    const nearestBelow = anchorsBelow[0];
                    if (isDescending) {
                        if (ts1 < nearestBelow.ts) score1 += PENALTY;
                        if (ts2 < nearestBelow.ts) score2 += PENALTY;
                    } else {
                        if (ts1 > nearestBelow.ts) score1 += PENALTY;
                        if (ts2 > nearestBelow.ts) score2 += PENALTY;
                    }
                }

                for (const a of allAnchors) {
                    score1 += Math.abs(ts1 - a.ts);
                    score2 += Math.abs(ts2 - a.ts);
                }

                if (score2 < score1) {
                    resolved[idx] = { day: m, month: d, year: y, ts: ts2, delim };
                } else {
                    resolved[idx] = { day: d, month: m, year: y, ts: ts1, delim };
                }
            } else if (ts1 !== null && d === m) {
                // Same value (e.g. 03/03), no swap needed
                resolved[idx] = { day: d, month: m, year: y, ts: ts1, delim };
            } else if (ts1 !== null) {
                resolved[idx] = { day: d, month: m, year: y, ts: ts1, delim };
            } else if (ts2 !== null) {
                resolved[idx] = { day: m, month: d, year: y, ts: ts2, delim };
            }
        };

        // Forward pass: resolve from top to bottom
        for (let i = 0; i < fixed.length; i++) resolveAmbiguous(i);
        // Backward pass: catch any still-unresolved dates using newly resolved anchors
        for (let i = fixed.length - 1; i >= 0; i--) resolveAmbiguous(i);

        // ── Pass 4.5: Fix years that don't match their chronological neighborhood ──
        for (let i = 0; i < resolved.length; i++) {
            const res = resolved[i];
            if (!res) continue;

            // Collect years from up to 5 resolved neighbors above and below
            const neighborYears: number[] = [];
            let count = 0;
            for (let j = i - 1; j >= 0 && count < 5; j--) {
                if (resolved[j]) { neighborYears.push(resolved[j]!.year); count++; }
            }
            count = 0;
            for (let j = i + 1; j < resolved.length && count < 5; j++) {
                if (resolved[j]) { neighborYears.push(resolved[j]!.year); count++; }
            }

            if (neighborYears.length < 2) continue; // not enough context

            // Find majority year among neighbors
            const yCounts: Record<number, number> = {};
            for (const ny of neighborYears) {
                yCounts[ny] = (yCounts[ny] || 0) + 1;
            }
            let neighborMajorYear = res.year;
            let neighborMaxCount = 0;
            for (const [yr, cnt] of Object.entries(yCounts)) {
                if (cnt > neighborMaxCount) { neighborMaxCount = cnt; neighborMajorYear = parseInt(yr, 10); }
            }

            // If this date's year differs from the neighbor majority and most neighbors agree
            if (res.year !== neighborMajorYear && neighborMaxCount >= Math.ceil(neighborYears.length * 0.6)) {
                const newTs = toTimestamp(neighborMajorYear, res.month, res.day);
                if (newTs !== null) {
                    resolved[i] = { ...res, year: neighborMajorYear, ts: newTs };
                }
            }
        }

        // ── Pass 5: Apply resolved dates back to the data ──
        for (let i = 0; i < fixed.length; i++) {
            const r = fixed[i];
            const res = resolved[i];
            if (!res) continue;

            const dateStr = getSyncedValue(r.ocr_date, r.ai_date);
            const p = parseDate(dateStr);
            if (!p) continue;

            // Check if the resolved date differs from the raw parsed date
            const rawY = p.y > 100 ? p.y : p.y + 2000;
            if (p.d !== res.day || p.m !== res.month || rawY !== res.year) {
                const newStr = formatDate(res.day, res.month, res.year, res.delim);
                if (r.ai_date) r.ai_date = newStr;
                if (r.ocr_date) r.ocr_date = newStr;
            }
        }

        // ── Pass 6: Fill empty dates from nearest neighbors ──
        for (let i = 0; i < fixed.length; i++) {
            const dateStr = getSyncedValue(fixed[i].ocr_date, fixed[i].ai_date);
            if (dateStr && dateStr !== '—') continue;

            let aboveRes: Resolved | null = null;
            let belowRes: Resolved | null = null;
            for (let j = i - 1; j >= 0; j--) { if (resolved[j]) { aboveRes = resolved[j]; break; } }
            for (let j = i + 1; j < fixed.length; j++) { if (resolved[j]) { belowRes = resolved[j]; break; } }

            let filledDate: Date | null = null;
            let usedDelim = '/';

            if (aboveRes && belowRes) {
                filledDate = new Date((aboveRes.ts + belowRes.ts) / 2);
                usedDelim = aboveRes.delim;
            } else if (aboveRes) {
                filledDate = new Date(aboveRes.ts);
                usedDelim = aboveRes.delim;
            } else if (belowRes) {
                filledDate = new Date(belowRes.ts);
                usedDelim = belowRes.delim;
            }

            if (filledDate) {
                const filled = formatDate(filledDate.getDate(), filledDate.getMonth() + 1, filledDate.getFullYear(), usedDelim);
                fixed[i].ocr_date = filled;
                fixed[i].ai_date = filled;
            }
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

    const exportToExcelMonthly = () => {
        const formatAmountForExcel = (val: string | number | null | undefined): number => {
            if (val === null || val === undefined) return 0;
            if (typeof val === 'number') return val;
            const strVal = val.toString().trim();
            const match = strVal.match(/-?[\d,]+(\.\d+)?/);
            if (match) {
                const num = parseFloat(match[0].replace(/,/g, ''));
                return isNaN(num) ? 0 : num;
            }
            return 0;
        };

        const parseDateForGroup = (dateStr: string): { day: number; month: number; year: number } | null => {
            const parts = dateStr.split(/[-/]/);
            if (parts.length < 3) return null;
            const d = parseInt(parts[0], 10);
            const m = parseInt(parts[1], 10);
            let y = parseInt(parts[2], 10);
            if (isNaN(d) || isNaN(m) || isNaN(y)) return null;
            if (y < 100) y += 2000;
            return { day: d, month: m, year: y };
        };

        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'];

        // Read display dates directly from processedResults — same data the dashboard and normal export use
        const getDisplayDate = (r: typeof processedResults[0]) =>
            useAiDate ? (r.ai_date || r.ocr_date || '') : getSyncedValue(r.ocr_date, r.ai_date);

        // Group results by month using display dates
        const groupMap = new Map<string, { idx: number; r: typeof processedResults[0]; displayDate: string }[]>();
        const groupOrder: string[] = [];

        for (let i = 0; i < processedResults.length; i++) {
            const dateStr = getDisplayDate(processedResults[i]);
            let groupKey = 'Unknown';
            if (dateStr && dateStr !== '—') {
                const parsed = parseDateForGroup(dateStr);
                if (parsed && parsed.month >= 1 && parsed.month <= 12) {
                    groupKey = `${parsed.year}-${parsed.month.toString().padStart(2, '0')}`;
                }
            }
            if (!groupMap.has(groupKey)) {
                groupMap.set(groupKey, []);
                groupOrder.push(groupKey);
            }
            groupMap.get(groupKey)!.push({ idx: i, r: processedResults[i], displayDate: dateStr });
        }

        const groups = groupOrder.map(key => {
            const items = groupMap.get(key)!;
            const displayDate = items[0].displayDate;
            let label = 'Unknown Date';
            if (displayDate && displayDate !== '—') {
                const parsed = parseDateForGroup(displayDate);
                if (parsed && parsed.month >= 1 && parsed.month <= 12) {
                    label = `${monthNames[parsed.month - 1]} ${parsed.year}`;
                }
            }
            return { key, label, items };
        });

        // Build flat array of Excel rows with headers and totals
        const excelRows: Record<string, any>[] = [];
        const amountColName = 'Amount';

        for (const group of groups) {
            // Month header row
            excelRows.push({ '#': group.label, 'Bank': '', 'Ref ID': '', 'Date': '', 'Sender': '', 'Receiver': '', [amountColName]: '' });

            let monthTotal = 0;
            group.items.forEach((item, idx) => {
                const r = item.r;
                const amount = formatAmountForExcel(r.ai_amount || r.ocr_amount);
                monthTotal += amount;

                excelRows.push({
                    '#': idx + 1,
                    'Bank': getSyncedBank(r.ocr_bank_name, r.ai_bank_name),
                    'Ref ID': getSyncedValue(r.ocr_transaction_id, r.ai_reference_number),
                    'Date': item.displayDate,
                    'Sender': getSyncedValue(r.ocr_sender, r.ai_from_name),
                    'Receiver': getSyncedValue(r.ocr_receiver, r.ai_to_name),
                    [amountColName]: amount,
                });
            });

            // Total row
            excelRows.push({ '#': '', 'Bank': '', 'Ref ID': '', 'Date': '', 'Sender': '', 'Receiver': 'TOTAL', [amountColName]: monthTotal });
            // Empty separator row
            excelRows.push({ '#': '', 'Bank': '', 'Ref ID': '', 'Date': '', 'Sender': '', 'Receiver': '', [amountColName]: '' });
        }

        const ws = XLSX.utils.json_to_sheet(excelRows);

        // Track which rows are month headers, data rows, and total rows for styling
        const range = XLSX.utils.decode_range(ws['!ref'] || '');
        const numCols = range.e.c + 1;

        // Apply alternating month shading and bold headers/totals
        let currentRowIdx = 1; // row 0 is the sheet header
        let monthIndex = 0;
        for (const group of groups) {
            const headerRowIdx = currentRowIdx;
            const dataStart = currentRowIdx + 1;
            const dataEnd = dataStart + group.items.length - 1;
            const totalRowIdx = dataEnd + 1;
            const separatorRowIdx = totalRowIdx + 1;

            const isGray = monthIndex % 2 === 1;
            const fillColor = isGray ? 'E8E8E8' : 'FFFFFF';
            const headerFill = isGray ? 'D0D0D0' : 'E2E8F0';

            // Style month header row - bold, darker background
            for (let C = 0; C < numCols; C++) {
                const addr = XLSX.utils.encode_cell({ r: headerRowIdx, c: C });
                if (!ws[addr]) ws[addr] = { v: '', t: 's' };
                ws[addr].s = {
                    font: { bold: true, sz: 13 },
                    fill: { fgColor: { rgb: headerFill } },
                    alignment: { horizontal: 'left' }
                };
            }

            // Style data rows with alternating fill
            for (let R = dataStart; R <= dataEnd; R++) {
                for (let C = 0; C < numCols; C++) {
                    const addr = XLSX.utils.encode_cell({ r: R, c: C });
                    if (!ws[addr]) ws[addr] = { v: '', t: 's' };
                    ws[addr].s = { fill: { fgColor: { rgb: fillColor } } };
                }
            }

            // Style total row - bold
            for (let C = 0; C < numCols; C++) {
                const addr = XLSX.utils.encode_cell({ r: totalRowIdx, c: C });
                if (!ws[addr]) ws[addr] = { v: '', t: 's' };
                ws[addr].s = {
                    font: { bold: true, sz: 12 },
                    fill: { fgColor: { rgb: headerFill } },
                };
            }

            currentRowIdx = separatorRowIdx + 1;
            monthIndex++;
        }

        // Apply number formatting to Amount column
        for (let C = range.s.c; C <= range.e.c; ++C) {
            const headerAddr = XLSX.utils.encode_col(C) + '1';
            if (!ws[headerAddr]) continue;
            if (ws[headerAddr].v === amountColName) {
                for (let R = range.s.r + 1; R <= range.e.r; ++R) {
                    const cellAddr = XLSX.utils.encode_cell({ r: R, c: C });
                    if (ws[cellAddr] && typeof ws[cellAddr].v === 'number') {
                        ws[cellAddr].t = 'n';
                        ws[cellAddr].z = '#,##0.00';
                    }
                }
            }
        }

        // Set column widths (wider for Sender and Receiver)
        ws['!cols'] = [
            { wch: 18 },  // # / month label
            { wch: 18 },  // Bank
            { wch: 20 },  // Ref ID
            { wch: 14 },  // Date
            { wch: 30 },  // Sender
            { wch: 30 },  // Receiver
            { wch: 16 },  // Amount
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Monthly Results');
        const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        saveAs(new Blob([buf], { type: 'application/octet-stream' }), `analysis_results_monthly.xlsx`);
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
                        onClick={exportToExcelMonthly}
                        disabled={results.length === 0}
                        style={{ background: '#0d6efd', color: '#fff', border: 'none', borderRadius: '8px', padding: '6px 14px', fontSize: '13px', fontWeight: 600 }}
                    >
                        📊 Export Monthly
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
