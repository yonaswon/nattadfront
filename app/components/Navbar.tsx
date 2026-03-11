'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from './ThemeProvider';
import api from '../api';

export default function Navbar() {
    const { theme, toggleTheme } = useTheme();
    const pathname = usePathname();
    const router = useRouter();
    const [loggingOut, setLoggingOut] = useState(false);

    const navLinks = [
        { href: '/dashboard', label: '📊 Dashboard' },
        { href: '/channels', label: 'Channels' },
        { href: '/results', label: 'All Results' },
        { href: '/results?filter=need_attention', label: 'Need Attention' },
        { href: '/reconciliations', label: '⚖️ Reconciliations' },
    ];

    const handleLogout = async () => {
        if (!confirm('Are you sure you want to logout? This will disconnect your Telegram session.')) return;
        setLoggingOut(true);
        try {
            await api.post('/auth/logout/');
            router.push('/login');
        } catch (err) {
            console.error('Logout failed:', err);
            alert('Logout failed. Please try again.');
        } finally {
            setLoggingOut(false);
        }
    };

    return (
        <nav className="navbar">
            <div className="navbar-brand">
                <Link href="/">
                    <span className="brand-icon">🏦</span>
                    <span className="brand-text">Bank Analyzer</span>
                </Link>
            </div>

            <div className="navbar-links">
                {navLinks.map(link => (
                    <Link
                        key={link.href}
                        href={link.href}
                        className={`nav-link ${pathname === link.href || (pathname + '?' + new URLSearchParams(link.href.split('?')[1] || '').toString()).includes(link.href) ? 'active' : ''}`}
                    >
                        {link.label}
                        {link.label === 'Need Attention' && (
                            <span className="attention-badge">!</span>
                        )}
                    </Link>
                ))}
            </div>

            <div className="navbar-actions">
                <button onClick={toggleTheme} className="theme-toggle" title="Toggle theme">
                    {theme === 'dark' ? '☀️' : '🌙'}
                </button>
                <button
                    onClick={handleLogout}
                    disabled={loggingOut}
                    title="Logout from Telegram"
                    style={{
                        background: 'transparent',
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px',
                        padding: '8px 12px',
                        fontSize: '14px',
                        color: 'var(--danger)',
                        fontWeight: 500,
                        transition: 'all 0.2s',
                        opacity: loggingOut ? 0.5 : 1,
                        cursor: loggingOut ? 'not-allowed' : 'pointer',
                    }}
                >
                    {loggingOut ? '⏳' : '🚪'} Logout
                </button>
            </div>
        </nav>
    );
}
