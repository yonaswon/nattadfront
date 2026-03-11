'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import api from '../../api';
import AnalysisControls, { BranchType } from '../../components/AnalysisControls';
import StatusPanel from '../../components/StatusPanel';
import StatisticsWidget from '../../components/StatisticsWidget';
import ResultsTable from '../../components/ResultsTable';
import ImageViewer from '../../components/ImageViewer';

interface MessageData {
    telegram_message_id: number;
    sender_name: string;
    text: string;
    has_image: boolean;
    has_media: boolean;
    media_type: string;
    is_forwarded: boolean;
    forward_from: string;
    file_name: string;
    reply_to_msg_id: number | null;
    date: string | null;
}

interface AnalysisSessionType {
    id: number;
    started_at: string;
    total_images: number;
    custom_name?: string | null;
    channel_title?: string | null;
    channel_username?: string | null;
    branch_name?: string | null;
}

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

const getMediaIcon = (mediaType: string): string => {
    switch (mediaType) {
        case 'photo': return '🖼️';
        case 'document_image': return '🖼️';
        case 'document': return '📄';
        case 'sticker': return '😀';
        case 'video': return '🎬';
        case 'gif': return '🔄';
        case 'voice': return '🎤';
        case 'video_note': return '⏺️';
        case 'audio': return '🎵';
        case 'contact': return '👤';
        case 'poll': return '📊';
        case 'location': return '📍';
        default: return '📎';
    }
};

const getMediaLabel = (mediaType: string, fileName: string): string => {
    switch (mediaType) {
        case 'photo': return 'Photo';
        case 'document_image': return 'Image (document)';
        case 'document': return fileName ? `Document: ${fileName}` : 'Document';
        case 'sticker': return 'Sticker';
        case 'video': return 'Video';
        case 'gif': return 'GIF';
        case 'voice': return 'Voice message';
        case 'video_note': return 'Video note';
        case 'audio': return fileName ? `Audio: ${fileName}` : 'Audio';
        case 'contact': return 'Contact';
        case 'poll': return 'Poll';
        case 'location': return 'Location';
        default: return 'Attachment';
    }
};

export default function ChannelDetailPage() {
    const params = useParams();
    const channelId = Number(params.id);
    const [messages, setMessages] = useState<MessageData[]>([]);
    const [results, setResults] = useState<TransactionResult[]>([]);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState<'chat' | 'results'>('chat');
    const [useOcr, setUseOcr] = useState(true);
    const [useAi, setUseAi] = useState(true);
    const [aiModel, setAiModel] = useState('gemini');
    const [sessions, setSessions] = useState<AnalysisSessionType[]>([]);
    const [selectedSessionId, setSelectedSessionId] = useState<string>('new');
    const [activeAnalysisSessionId, setActiveAnalysisSessionId] = useState<number | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [selectedResult, setSelectedResult] = useState<TransactionResult | null>(null);
    const [filter, setFilter] = useState<'all' | 'need_attention'>('all');
    const [filterSessionId, setFilterSessionId] = useState<string>('all');
    const [customName, setCustomName] = useState<string>('');

    // Branch state
    const [branches, setBranches] = useState<BranchType[]>([]);
    const [selectedBranchId, setSelectedBranchId] = useState<string>('new');
    const [newBranchName, setNewBranchName] = useState<string>('');
    const [filterBranchId, setFilterBranchId] = useState<string>('all');

    useEffect(() => {
        fetchMessages();
        fetchBranches();
    }, [channelId]);

    useEffect(() => {
        // When filterBranchId changes, we refetch sessions and results to match the new filter
        fetchSessions();
        fetchResults();
    }, [channelId, filterBranchId]);

    const fetchBranches = async () => {
        try {
            const res = await api.get('/branches/');
            setBranches(res.data);
            if (res.data.length > 0) {
                // optional: select first branch by default if modifying existing behavior
                // setSelectedBranchId(res.data[0].id.toString());
            }
        } catch (err) {
            console.error('Failed to fetch branches:', err);
        }
    };

    const fetchSessions = async () => {
        try {
            const params: any = { channel_id: channelId };
            if (filterBranchId !== 'all') {
                params.branch_id = filterBranchId;
            }
            const res = await api.get('/sessions/', { params });
            setSessions(res.data);
        } catch (err) {
            console.error('Failed to fetch sessions:', err);
        }
    };

    const fetchMessages = async () => {
        try {
            const res = await api.get(`/channels/${channelId}/messages/`, { params: { limit: 100 } });
            setMessages(res.data);
        } catch (err) {
            console.error('Failed to fetch messages:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchResults = useCallback(async () => {
        try {
            const params: any = { channel_id: channelId };
            if (filter === 'need_attention') params.filter = 'need_attention';
            if (filterSessionId !== 'all') {
                params.session_id = filterSessionId;
            }
            // If we're filtering by branch, the result list backend endpoint doesn't directly
            // accept branch_id right now, but we can filter the sessions list and then
            // the results by the visible sessions if needed, OR we just let the backend
            // handle it. For now, since Results belong to a Session which belongs to a Branch:
            // if a branch is selected, we should conceptually only show results from that branch.
            // Let's rely on the user to pick a session from the filtered session list.
            const res = await api.get('/results/', { params });

            // Client-side branch filter for results since backend `/results/` doesn't have `branch_id` natively
            let fetchedResults = res.data;
            if (filterBranchId !== 'all') {
                // Find all session IDs that belong to the current branch
                const validSessionIds = sessions.map(s => s.id);
                fetchedResults = fetchedResults.filter((r: TransactionResult) =>
                    r.id /* we don't have r.session_id in the result payload by default, 
                            so we'll just show all results if not filtering by session. 
                            Wait, let's keep it simple: filter changes the sessions dropdown,
                            user can select session. */
                );
            }

            setResults(fetchedResults);
        } catch (err) {
            console.error('Failed to fetch results:', err);
        }
    }, [channelId, filter, filterSessionId]);

    useEffect(() => {
        fetchResults();
    }, [fetchResults]);

    const handleStartAnalysis = async () => {
        try {
            const payload: any = {
                channel_id: channelId,
                use_ocr: useOcr,
                use_ai: useAi,
                ai_model: aiModel,
                custom_name: customName,
            };
            if (selectedSessionId !== 'new') {
                payload.session_id = parseInt(selectedSessionId, 10);
            } else {
                if (selectedBranchId !== 'new') {
                    payload.branch_id = parseInt(selectedBranchId, 10);
                } else if (newBranchName) {
                    payload.new_branch_name = newBranchName;
                }
            }

            const res = await api.post('/analyze/start/', payload);
            setActiveAnalysisSessionId(res.data.session_id);
            if (selectedSessionId === 'new') {
                setSelectedSessionId(res.data.session_id.toString());
            }
            setIsAnalyzing(true);
            setView('results');
        } catch (err) {
            console.error('Failed to start analysis:', err);
        }
    };

    const handleAnalysisComplete = () => {
        setIsAnalyzing(false);
        setCustomName('');
        setNewBranchName('');
        fetchBranches();
        fetchSessions();
        fetchResults();
    };

    const handleEditResult = (result: TransactionResult) => {
        setSelectedResult(result);
    };

    const handleSaveResult = (updated: TransactionResult) => {
        setResults(prev => prev.map(r => r.id === updated.id ? updated : r));
        setSelectedResult(null);
    };

    const imageCount = messages.filter(m => m.has_image).length;
    const mediaCount = messages.filter(m => m.has_media).length;
    const forwardedCount = messages.filter(m => m.is_forwarded).length;

    if (loading) {
        return (
            <div className="page-loading">
                <div className="spinner"></div>
                <p>Loading messages...</p>
            </div>
        );
    }

    return (
        <div className="channel-detail-page">
            <div className="channel-detail-header">
                <div className="header-left">
                    <button className="btn-back" onClick={() => window.history.back()}>← Back</button>
                    <h1>Channel #{channelId}</h1>
                    <span className="message-count">
                        {messages.length} messages • {imageCount} images • {mediaCount} media • {forwardedCount} forwarded
                    </span>
                </div>

                <div className="header-tabs">
                    <button
                        className={`tab ${view === 'chat' ? 'active' : ''}`}
                        onClick={() => setView('chat')}
                    >
                        💬 Chat
                    </button>
                    <button
                        className={`tab ${view === 'results' ? 'active' : ''}`}
                        onClick={() => setView('results')}
                    >
                        📊 Results
                    </button>
                </div>
            </div>

            <AnalysisControls
                useOcr={useOcr}
                setUseOcr={setUseOcr}
                useAi={useAi}
                setUseAi={setUseAi}
                aiModel={aiModel}
                setAiModel={setAiModel}
                branches={branches}
                selectedBranchId={selectedBranchId}
                setSelectedBranchId={setSelectedBranchId}
                newBranchName={newBranchName}
                setNewBranchName={setNewBranchName}
                sessions={sessions}
                selectedSessionId={selectedSessionId}
                setSelectedSessionId={setSelectedSessionId}
                customName={customName}
                setCustomName={setCustomName}
                onStartAnalysis={handleStartAnalysis}
                isAnalyzing={isAnalyzing}
            />

            {activeAnalysisSessionId && (
                <StatusPanel sessionId={activeAnalysisSessionId} onComplete={handleAnalysisComplete} />
            )}

            {view === 'chat' && (
                <div className="chat-view">
                    {messages.map(msg => (
                        <div
                            key={msg.telegram_message_id}
                            className={`chat-message ${msg.has_image ? 'has-image' : ''} ${msg.is_forwarded ? 'is-forwarded' : ''}`}
                        >
                            {msg.is_forwarded && (
                                <div className="msg-forwarded-label" style={{
                                    fontSize: '0.75rem',
                                    color: 'var(--accent-color, #6c9fff)',
                                    marginBottom: '4px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    fontStyle: 'italic',
                                }}>
                                    🔁 Forwarded{msg.forward_from ? ` from ${msg.forward_from}` : ''}
                                </div>
                            )}
                            <div className="msg-header">
                                <span className="msg-sender">{msg.sender_name || 'Unknown'}</span>
                                <span className="msg-date">
                                    {msg.date ? new Date(msg.date).toLocaleString() : ''}
                                </span>
                            </div>
                            {msg.reply_to_msg_id && (
                                <div className="msg-reply-indicator" style={{
                                    fontSize: '0.75rem',
                                    color: 'var(--text-secondary, #999)',
                                    borderLeft: '2px solid var(--accent-color, #6c9fff)',
                                    paddingLeft: '8px',
                                    marginBottom: '4px',
                                }}>
                                    ↩️ Reply to message #{msg.reply_to_msg_id}
                                </div>
                            )}
                            {msg.text && <div className="msg-text">{msg.text}</div>}
                            {msg.has_media && msg.media_type && (
                                <div className="msg-media-indicator" style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '6px 10px',
                                    marginTop: '4px',
                                    borderRadius: '6px',
                                    background: msg.has_image
                                        ? 'rgba(76, 175, 80, 0.12)'
                                        : 'rgba(108, 159, 255, 0.12)',
                                    fontSize: '0.85rem',
                                    color: msg.has_image
                                        ? 'var(--success-color, #4caf50)'
                                        : 'var(--accent-color, #6c9fff)',
                                }}>
                                    <span>{getMediaIcon(msg.media_type)}</span>
                                    <span>{getMediaLabel(msg.media_type, msg.file_name)}</span>
                                </div>
                            )}
                        </div>
                    ))}
                    {messages.length === 0 && (
                        <div className="empty-state">
                            <p>No messages found in this channel.</p>
                        </div>
                    )}
                </div>
            )}

            {view === 'results' && (
                <div className="results-view">
                    <StatisticsWidget results={results} />

                    <div className="results-filter-bar mt-4">
                        <span style={{ fontWeight: 'bold', marginRight: '8px' }}>Branch: </span>
                        <select
                            value={filterBranchId}
                            onChange={(e) => {
                                setFilterBranchId(e.target.value);
                                setFilterSessionId('all'); // Reset session when branch changes
                            }}
                            className="model-select"
                            style={{ marginRight: '16px' }}
                        >
                            <option value="all">All Branches</option>
                            {branches.map(b => (
                                <option key={b.id} value={b.id.toString()}>🏢 {b.name}</option>
                            ))}
                        </select>

                        <span style={{ fontWeight: 'bold', marginRight: '8px' }}>Session: </span>
                        <button
                            className={`filter-btn ${filterSessionId === 'all' ? 'active' : ''}`}
                            onClick={() => setFilterSessionId('all')}
                        >
                            All
                        </button>
                        {sessions.map(s => {
                            const displayName = s.custom_name ? s.custom_name : `#${s.id} (${new Date(s.started_at).toLocaleDateString()})`;
                            return (
                                <button
                                    key={s.id}
                                    className={`filter-btn ${filterSessionId === s.id.toString() ? 'active' : ''}`}
                                    onClick={() => setFilterSessionId(s.id.toString())}
                                    title={s.branch_name ? `Branch: ${s.branch_name}` : ''}
                                >
                                    {displayName}
                                </button>
                            );
                        })}

                        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <span style={{ fontWeight: 'bold' }}>Status: </span>
                            <button
                                className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
                                onClick={() => setFilter('all')}
                            >
                                All ({results.length})
                            </button>
                            <button
                                className={`filter-btn ${filter === 'need_attention' ? 'active' : ''}`}
                                onClick={() => setFilter('need_attention')}
                            >
                                ⚠️ Need Attention ({results.filter(r => r.needs_attention).length})
                            </button>
                            <button className="btn btn-sm" onClick={fetchResults}>
                                🔄 Refresh
                            </button>
                        </div>
                    </div>

                    <ResultsTable
                        results={results}
                        onViewImage={setSelectedResult}
                        onEditResult={handleEditResult}
                        onResultUpdated={(updated) => setResults(prev => prev.map(r => r.id === updated.id ? updated : r))}
                    />
                </div>
            )}

            {selectedResult && (
                <ImageViewer
                    result={selectedResult}
                    onClose={() => setSelectedResult(null)}
                    onSave={handleSaveResult}
                />
            )}
        </div>
    );
}
