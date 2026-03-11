'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import api from '../api';
import ResultsTable from '../components/ResultsTable';
import ImageViewer from '../components/ImageViewer';
import StatisticsWidget from '../components/StatisticsWidget';
import ReconcileModal from '../components/ReconcileModal';

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

interface AnalysisSessionType {
    id: number;
    started_at: string;
    total_images: number;
    channel?: number;
    custom_name?: string | null;
    channel_title?: string | null;
    channel_username?: string | null;
}

function ResultsContent() {
    const searchParams = useSearchParams();
    const filterParam = searchParams.get('filter');
    const [results, setResults] = useState<TransactionResult[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'need_attention'>(
        filterParam === 'need_attention' ? 'need_attention' : 'all'
    );
    const [considerCents, setConsiderCents] = useState<boolean>(true);
    const [showUnavailable, setShowUnavailable] = useState<boolean>(false);
    const [sessions, setSessions] = useState<AnalysisSessionType[]>([]);
    const [filterSessionId, setFilterSessionId] = useState<string>('all');
    const [selectedResult, setSelectedResult] = useState<TransactionResult | null>(null);
    const [showReconcile, setShowReconcile] = useState(false);

    const fetchSessions = async () => {
        try {
            const res = await api.get('/sessions/');
            setSessions(res.data);
        } catch (err) {
            console.error('Failed to fetch sessions:', err);
        }
    };

    const fetchResults = useCallback(async () => {
        setLoading(true);
        try {
            const params: Record<string, string> = {};
            // We fetch ALL results and do "needs_attention" filtering dynamically on the frontend
            // so that considerCents toggle works without refetching.
            if (filterSessionId !== 'all') params.session_id = filterSessionId;
            const res = await api.get('/results/', { params });
            setResults(res.data);
        } catch (err) {
            console.error('Failed to fetch results:', err);
        } finally {
            setLoading(false);
        }
    }, [filter, filterSessionId]);

    useEffect(() => {
        fetchSessions();
        fetchResults();
    }, [fetchResults]);

    const handleSaveResult = (updated: TransactionResult) => {
        setResults(prev => prev.map(r => r.id === updated.id ? updated : r));
        setSelectedResult(null);
    };

    const processedResults = results.map(r => {
        if (showUnavailable) {
            // Toggle mode: flag items where one or both amounts are unavailable/missing/zero
            const ocrMissing = r.ocr_amount === null || r.ocr_amount === '' || parseFloat(r.ocr_amount) === 0;
            const aiMissing = r.ai_amount === null || r.ai_amount === '' || parseFloat(r.ai_amount) === 0;
            return { ...r, needs_attention: ocrMissing || aiMissing };
        }

        // Default mode: flag items where BOTH amounts exist but differ (original behavior)
        // Flag zero amounts as needs_attention (likely extraction failure)
        const ocrZero = r.ocr_amount !== null && parseFloat(r.ocr_amount) === 0;
        const aiZero = r.ai_amount !== null && parseFloat(r.ai_amount) === 0;
        const zeroFlag = ocrZero || aiZero;

        if (!considerCents) {
            if (r.ocr_amount && r.ai_amount) {
                const diff = Math.abs(parseFloat(r.ocr_amount) - parseFloat(r.ai_amount));
                return { ...r, needs_attention: diff >= 1.00 || zeroFlag };
            }
        }
        return zeroFlag ? { ...r, needs_attention: true } : r;
    });

    const filteredResults = filter === 'need_attention'
        ? processedResults.filter(r => r.needs_attention)
        : processedResults;

    if (loading) {
        return (
            <div className="page-loading">
                <div className="spinner"></div>
                <p>Loading results...</p>
            </div>
        );
    }

    return (
        <div className="results-page">
            <div className="page-header">
                <h1>📊 Analysis Results</h1>
                <p>{filteredResults.length} results found</p>
            </div>

            <StatisticsWidget results={filteredResults} />

            <div className="results-filter-bar mt-4">
                <span style={{ fontWeight: 'bold', marginRight: '8px' }}>Analysis: </span>
                <select
                    className="model-select"
                    style={{ minWidth: '250px', padding: '0.4rem', borderRadius: '4px' }}
                    value={filterSessionId}
                    onChange={(e) => setFilterSessionId(e.target.value)}
                >
                    <option value="all">All Sessions</option>
                    {sessions.map(s => {
                        let displayName = `#${s.id} (${new Date(s.started_at).toLocaleDateString()})`;
                        if (s.custom_name) {
                            displayName = s.custom_name;
                        }
                        if (s.channel_title) {
                            displayName += ` - ${s.channel_title}`;
                            if (s.channel_username) displayName += ` (@${s.channel_username})`;
                        }

                        return (
                            <option key={s.id} value={s.id.toString()}>
                                {displayName}
                            </option>
                        );
                    })}
                </select>

                <div style={{ marginLeft: 'auto', display: 'flex', gap: '16px', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '4px' }}>
                            <input
                                type="checkbox"
                                checked={considerCents}
                                onChange={(e) => setConsiderCents(e.target.checked)}
                            />
                            <span>Consider Cents</span>
                        </label>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '4px' }}>
                            <input
                                type="checkbox"
                                checked={showUnavailable}
                                onChange={(e) => setShowUnavailable(e.target.checked)}
                            />
                            <span>Show Unavailable</span>
                        </label>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                        <span style={{ fontWeight: 'bold', alignSelf: 'center' }}>Status: </span>
                        <button
                            className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
                            onClick={() => setFilter('all')}
                        >
                            All ({processedResults.length})
                        </button>
                        <button
                            className={`filter-btn ${filter === 'need_attention' ? 'active' : ''}`}
                            onClick={() => setFilter('need_attention')}
                        >
                            ⚠️ Need Attention ({processedResults.filter(r => r.needs_attention).length})
                        </button>
                        <button className="btn btn-sm" onClick={fetchResults}>
                            🔄 Refresh
                        </button>
                    </div>

                    <div style={{ marginLeft: '16px', borderLeft: '1px solid #cbd5e1', paddingLeft: '16px' }}>
                        <button
                            className="btn btn-sm"
                            onClick={() => setShowReconcile(true)}
                            style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', padding: '6px 14px', fontSize: '13px', fontWeight: 600 }}
                        >
                            ⚖️ Reconcile CBE
                        </button>
                    </div>
                </div>
            </div>

            <ResultsTable
                results={filteredResults}
                onViewImage={setSelectedResult}
                onEditResult={setSelectedResult}
                onResultUpdated={(updated) => setResults(prev => prev.map(r => r.id === updated.id ? updated : r))}
            />

            {selectedResult && (
                <ImageViewer
                    result={selectedResult}
                    onClose={() => setSelectedResult(null)}
                    onSave={handleSaveResult}
                />
            )}

            {showReconcile && (
                <ReconcileModal
                    onClose={() => setShowReconcile(false)}
                    filteredResults={filteredResults}
                />
            )}
        </div>
    );
}

export default function ResultsPage() {
    return (
        <Suspense fallback={
            <div className="page-loading">
                <div className="spinner"></div>
                <p>Loading...</p>
            </div>
        }>
            <ResultsContent />
        </Suspense>
    );
}
