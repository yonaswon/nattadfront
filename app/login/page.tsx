'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '../api';

export default function LoginPage() {
    const router = useRouter();
    const [step, setStep] = useState<'phone' | 'code' | '2fa'>('phone');
    const [phone, setPhone] = useState('');
    const [code, setCode] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSendCode = async () => {
        setLoading(true);
        setError('');
        try {
            const res = await api.post('/auth/send-code/', { phone_number: phone });
            if (res.data.status === 'code_sent') {
                setStep('code');
            } else {
                setError(res.data.message || 'Failed to send code');
            }
        } catch (err: any) {
            setError(err.response?.data?.error || 'Network error');
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyCode = async () => {
        setLoading(true);
        setError('');
        try {
            const res = await api.post('/auth/verify-code/', { phone_number: phone, code });
            if (res.data.status === 'authenticated') {
                router.push('/channels');
            } else if (res.data.status === 'needs_2fa') {
                setStep('2fa');
            } else {
                setError(res.data.message || 'Invalid code');
            }
        } catch (err: any) {
            setError(err.response?.data?.error || 'Network error');
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyPassword = async () => {
        setLoading(true);
        setError('');
        try {
            const res = await api.post('/auth/verify-password/', { password });
            if (res.data.status === 'authenticated') {
                router.push('/channels');
            } else {
                setError(res.data.message || 'Invalid password');
            }
        } catch (err: any) {
            setError(err.response?.data?.error || 'Network error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-page">
            <div className="login-card">
                <div className="login-header">
                    <div className="login-icon">🔐</div>
                    <h1>Telegram Login</h1>
                    <p>Connect to your Telegram account to analyze bank screenshots</p>
                </div>

                {error && <div className="error-message">{error}</div>}

                {step === 'phone' && (
                    <div className="login-form">
                        <div className="form-group">
                            <label>Phone Number</label>
                            <input
                                type="tel"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                placeholder="+251912345678"
                                className="form-input"
                                autoFocus
                            />
                            <p className="form-help">Include country code (e.g. +251)</p>
                        </div>
                        <button
                            className="btn btn-primary btn-full"
                            onClick={handleSendCode}
                            disabled={!phone || loading}
                        >
                            {loading ? '📱 Sending Code...' : '📱 Send Code'}
                        </button>
                    </div>
                )}

                {step === 'code' && (
                    <div className="login-form">
                        <div className="step-indicator">
                            <span className="step done">1. Phone ✓</span>
                            <span className="step active">2. Code</span>
                            <span className="step">3. Login</span>
                        </div>
                        <div className="form-group">
                            <label>Verification Code</label>
                            <input
                                type="text"
                                value={code}
                                onChange={(e) => setCode(e.target.value)}
                                placeholder="12345"
                                className="form-input code-input"
                                autoFocus
                                maxLength={6}
                            />
                            <p className="form-help">Enter the code sent to {phone}</p>
                        </div>
                        <button
                            className="btn btn-primary btn-full"
                            onClick={handleVerifyCode}
                            disabled={!code || loading}
                        >
                            {loading ? '🔄 Verifying...' : '✅ Verify Code'}
                        </button>
                    </div>
                )}

                {step === '2fa' && (
                    <div className="login-form">
                        <div className="step-indicator">
                            <span className="step done">1. Phone ✓</span>
                            <span className="step done">2. Code ✓</span>
                            <span className="step active">3. Password</span>
                        </div>
                        <div className="form-group">
                            <label>Two-Factor Password</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Enter your 2FA password"
                                className="form-input"
                                autoFocus
                            />
                            <p className="form-help">Your Telegram account has 2FA enabled</p>
                        </div>
                        <button
                            className="btn btn-primary btn-full"
                            onClick={handleVerifyPassword}
                            disabled={!password || loading}
                        >
                            {loading ? '🔄 Verifying...' : '🔓 Login'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
