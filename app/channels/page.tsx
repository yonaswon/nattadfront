'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import api from '../api';

interface ChannelData {
    id?: number;
    telegram_id: number;
    title: string;
    channel_type: string;
    member_count: number;
    unread_count: number;
    last_message: string;
}

export default function ChannelsPage() {
    const router = useRouter();
    const [channels, setChannels] = useState<ChannelData[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        fetchChannels();
    }, []);

    const fetchChannels = async () => {
        try {
            const res = await api.get('/channels/');
            setChannels(res.data);
        } catch (err: any) {
            if (err.response?.status === 500 && err.response?.data?.error?.includes('not authorized')) {
                router.push('/login');
                return;
            }
            setError(err.response?.data?.error || 'Failed to load channels');
        } finally {
            setLoading(false);
        }
    };

    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'channel': return '📢';
            case 'group': return '👥';
            case 'supergroup': return '🏛️';
            default: return '💬';
        }
    };

    const filteredChannels = channels.filter(ch =>
        ch.title.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (loading) {
        return (
            <div className="page-loading">
                <div className="spinner"></div>
                <p>Loading channels from Telegram...</p>
            </div>
        );
    }

    return (
        <div className="channels-page">
            <div className="page-header">
                <h1>📋 Your Channels & Groups</h1>
                <p>{filteredChannels.length} of {channels.length} channels</p>
            </div>

            <div className="channel-search-bar" style={{ padding: '0 1rem', marginBottom: '1rem' }}>
                <input
                    type="text"
                    placeholder="🔍 Search channels..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="channel-search-input"
                    style={{
                        width: '100%',
                        padding: '0.75rem 1rem',
                        borderRadius: '10px',
                        border: '1px solid var(--border-color, #333)',
                        background: 'var(--card-bg, #1e1e2e)',
                        color: 'var(--text-primary, #fff)',
                        fontSize: '1rem',
                        outline: 'none',
                    }}
                />
            </div>

            {error && <div className="error-message">{error}</div>}

            <div className="channels-list">
                {filteredChannels.map((ch) => (
                    <Link
                        key={ch.telegram_id}
                        href={`/channels/${ch.id || ch.telegram_id}`}
                        className="channel-card"
                    >
                        <div className="channel-icon">{getTypeIcon(ch.channel_type)}</div>
                        <div className="channel-info">
                            <h3>{ch.title}</h3>
                            <p className="channel-meta">
                                <span className="channel-type">{ch.channel_type}</span>
                                {ch.member_count > 0 && <span>• {ch.member_count.toLocaleString()} members</span>}
                                {ch.unread_count > 0 && <span className="unread-badge">{ch.unread_count}</span>}
                            </p>
                            {ch.last_message && (
                                <p className="channel-last-message">{ch.last_message}</p>
                            )}
                        </div>
                        <div className="channel-arrow">→</div>
                    </Link>
                ))}
            </div>

            {filteredChannels.length === 0 && !error && (
                <div className="empty-state">
                    <p>{searchQuery ? `No channels matching "${searchQuery}"` : 'No channels or groups found. Make sure your Telegram account has joined some channels.'}</p>
                </div>
            )}
        </div>
    );
}
