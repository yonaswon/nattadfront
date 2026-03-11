'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import api from '../api';

interface StatusPanelProps {
    sessionId: number | null;
    onComplete?: () => void;
    onContinue?: () => void;
}

interface WsMessage {
    event: string;
    message?: string;
    image_name?: string;
    processed?: number;
    total?: number;
    percent?: number;
    total_images?: number;
    result_id?: number;
    error?: string;
    model?: string;
    ocr_data?: Record<string, string | null>;
    ai_data?: Record<string, string | null>;
    needs_attention?: boolean;
}

export default function StatusPanel({ sessionId, onComplete }: StatusPanelProps) {
    const [messages, setMessages] = useState<WsMessage[]>([]);
    const [progress, setProgress] = useState(0);
    const [total, setTotal] = useState(0);
    const [processed, setProcessed] = useState(0);
    const [currentImage, setCurrentImage] = useState('');
    const [status, setStatus] = useState('idle');
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const logRef = useRef<HTMLDivElement>(null);

    const connectWs = useCallback(() => {
        if (!sessionId) return;
        const apiBaseUrl = api.defaults.baseURL || 'http://localhost:8000/api';
        const urlObj = new URL(apiBaseUrl);
        const wsProtocol = urlObj.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsHost = urlObj.host; // includes port if specified
        const ws = new WebSocket(`${wsProtocol}//${wsHost}/ws/analysis/${sessionId}/`);

        ws.onopen = () => {
            if (status !== 'error') {
                setStatus('connected');
            }
        };

        ws.onmessage = (e) => {
            const data: WsMessage = JSON.parse(e.data);
            setMessages(prev => [...prev.slice(-100), data]);

            if (data.total_images) setTotal(data.total_images);
            if (data.total) setTotal(data.total);
            if (data.processed !== undefined) setProcessed(data.processed);
            if (data.percent !== undefined) setProgress(data.percent);
            if (data.image_name) setCurrentImage(data.image_name);

            if (data.event === 'analysis_complete') {
                setStatus('complete');
                setErrorMsg(null);
                onComplete?.();
            }
            if (data.event === 'analysis_paused') {
                setStatus('paused');
            }
            if (data.event === 'error') {
                setStatus('error');
                if (data.message) {
                    setErrorMsg(data.message);
                }
            }
        };

        ws.onclose = () => {
            setStatus('disconnected');
        };

        wsRef.current = ws;
    }, [sessionId, onComplete]);

    useEffect(() => {
        connectWs();
        return () => { wsRef.current?.close(); };
    }, [connectWs]);

    useEffect(() => {
        if (logRef.current) {
            logRef.current.scrollTop = logRef.current.scrollHeight;
        }
    }, [messages]);

    const handleStop = () => {
        wsRef.current?.send(JSON.stringify({ command: 'stop' }));
        setStatus('stopping');
    };

    const handleContinue = async () => {
        if (!sessionId) return;
        try {
            setStatus('connected');
            setErrorMsg(null);
            // We can hit the existing /analyze/continue/ endpoint
            const res = await fetch('http://localhost:8000/api/analyze/continue/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: sessionId })
            });
            if (!res.ok) {
                console.error("Failed to continue", await res.text());
                setStatus('error');
            }
        } catch (err) {
            console.error(err);
            setStatus('error');
        }
    };

    if (!sessionId) return null;

    return (
        <div className="status-panel">
            <div className="status-header">
                <h3>📊 Analysis Status</h3>
                <div className="status-badge" data-status={status}>
                    {status === 'connected' ? '🟢 Running' :
                        status === 'complete' ? '✅ Complete' :
                            status === 'paused' ? '⏸️ Paused' :
                                status === 'error' ? '❌ Error' :
                                    status === 'stopping' ? '⏹️ Stopping...' :
                                        '⚪ Disconnected'}
                </div>
            </div>

            <div className="progress-section">
                <div className="progress-bar-container">
                    <div className="progress-bar" style={{ width: `${progress}%` }}>
                        <span>{progress}%</span>
                    </div>
                </div>
                <p className="progress-text">{processed} / {total} images processed</p>
                {currentImage && <p className="current-image">Current: {currentImage}</p>}
            </div>

            <div className="status-actions">
                {(status === 'connected') && (
                    <button onClick={handleStop} className="btn btn-danger">
                        ⏹ Stop Analysis
                    </button>
                )}
                {status === 'error' && (
                    <div style={{ marginTop: '10px', padding: '10px', backgroundColor: '#fee2e2', border: '1px solid #ef4444', borderRadius: '4px', color: '#b91c1c' }}>
                        <strong>⚠️ Analysis Halted!</strong>
                        <p style={{ margin: '4px 0', fontSize: '14px' }}>{errorMsg || "An unknown error stopped the pipeline."}</p>
                        <button
                            onClick={handleContinue}
                            style={{ marginTop: '8px', padding: '6px 16px', backgroundColor: '#ef4444', color: 'white', borderRadius: '4px', fontWeight: 'bold' }}
                        >
                            🔄 Fix Issue & Continue
                        </button>
                    </div>
                )}
            </div>

            <div className="status-log" ref={logRef}>
                {messages.slice(-30).map((msg, i) => (
                    <div key={i} className={`log-entry log-${msg.event}`}>
                        <span className="log-icon">
                            {msg.event === 'ocr_complete' ? '📝' :
                                msg.event === 'ai_complete' ? '🤖' :
                                    msg.event === 'processing_image' ? '🔄' :
                                        msg.event === 'error' || msg.event === 'image_error' ? '❌' :
                                            msg.event === 'images_fetched' ? '📥' :
                                                msg.event === 'analysis_complete' ? '🎉' :
                                                    '📌'}
                        </span>
                        <span className="log-message">{msg.message || msg.event}</span>
                        {msg.needs_attention && <span className="attention-flag">⚠️ MISMATCH</span>}
                    </div>
                ))}
            </div>
        </div>
    );
}
