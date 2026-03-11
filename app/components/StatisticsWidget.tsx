'use client';

import { useMemo } from 'react';

interface TransactionResult {
    ocr_bank_name: string | null;
    ocr_amount: string | null;
    ai_bank_name: string | null;
    ai_amount: string | null;
}

interface StatisticsWidgetProps {
    results: TransactionResult[];
}

const BANK_COLORS: Record<string, { bg: string; border: string; icon: string }> = {
    'CBE': { bg: 'rgba(108, 92, 231, 0.12)', border: 'rgba(108, 92, 231, 0.4)', icon: '🏦' },
    'Telebirr': { bg: 'rgba(0, 214, 143, 0.12)', border: 'rgba(0, 214, 143, 0.4)', icon: '📱' },
    'Abyssinia': { bg: 'rgba(77, 166, 255, 0.12)', border: 'rgba(77, 166, 255, 0.4)', icon: '🏛️' },
    'Awash': { bg: 'rgba(255, 192, 72, 0.12)', border: 'rgba(255, 192, 72, 0.4)', icon: '💳' },
    'Dashen': { bg: 'rgba(255, 107, 107, 0.12)', border: 'rgba(255, 107, 107, 0.4)', icon: '🏦' },
    'Amhara': { bg: 'rgba(46, 213, 115, 0.12)', border: 'rgba(46, 213, 115, 0.4)', icon: '🏛️' },
    'Oromia': { bg: 'rgba(255, 159, 67, 0.12)', border: 'rgba(255, 159, 67, 0.4)', icon: '💳' },
    'default': { bg: 'rgba(136, 136, 160, 0.12)', border: 'rgba(136, 136, 160, 0.4)', icon: '🏦' },
};

function getBankStyle(bankName: string) {
    const name = bankName.toLowerCase();
    if (name.includes('cbe') || name.includes('commercial')) return BANK_COLORS['CBE'];
    if (name.includes('telebirr') || name.includes('tele')) return BANK_COLORS['Telebirr'];
    if (name.includes('abyssinia') || name.includes('boa')) return BANK_COLORS['Abyssinia'];
    if (name.includes('awash')) return BANK_COLORS['Awash'];
    if (name.includes('dashen')) return BANK_COLORS['Dashen'];
    if (name.includes('amhara')) return BANK_COLORS['Amhara'];
    if (name.includes('oromia') || name.includes('coop')) return BANK_COLORS['Oromia'];
    return BANK_COLORS['default'];
}

function normalizeBankName(name: string): string {
    const lower = name.toLowerCase();
    if (lower.includes('cbe') || lower.includes('commercial')) return 'CBE';
    if (lower.includes('telebirr') || lower.includes('tele birr')) return 'Telebirr';
    if (lower.includes('abyssinia') || lower.includes('boa')) return 'Bank of Abyssinia';
    if (lower.includes('awash')) return 'Awash Bank';
    if (lower.includes('dashen')) return 'Dashen Bank';
    if (lower.includes('amhara')) return 'Amhara Bank';
    if (lower.includes('oromia') || lower.includes('coop')) return 'Cooperative Bank of Oromia';
    return name;
}

export default function StatisticsWidget({ results }: StatisticsWidgetProps) {
    const stats = useMemo(() => {
        const bankData: Record<string, { total: number; count: number }> = {};
        let grandTotal = 0;
        let totalCount = 0;

        results.forEach(result => {
            let bankName = result.ai_bank_name || result.ocr_bank_name || 'Unknown Bank';
            bankName = normalizeBankName(bankName);

            const rawAmount = result.ai_amount || result.ocr_amount;
            if (rawAmount) {
                const amount = parseFloat(rawAmount);
                if (!isNaN(amount)) {
                    if (!bankData[bankName]) {
                        bankData[bankName] = { total: 0, count: 0 };
                    }
                    bankData[bankName].total += amount;
                    bankData[bankName].count += 1;
                    grandTotal += amount;
                    totalCount += 1;
                }
            }
        });

        // Sort by total descending
        const sorted = Object.entries(bankData).sort((a, b) => b[1].total - a[1].total);
        return { bankData: sorted, grandTotal, totalCount };
    }, [results]);

    if (results.length === 0) return null;

    return (
        <div style={{
            marginBottom: '24px',
        }}>
            {/* Grand Total Card */}
            <div style={{
                background: 'linear-gradient(135deg, var(--accent) 0%, #8b5cf6 100%)',
                borderRadius: '16px',
                padding: '20px 24px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                boxShadow: '0 4px 20px var(--accent-glow)',
            }}>
                <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>
                        📊 Grand Total
                    </div>
                    <div style={{ fontSize: '32px', fontWeight: 800, color: '#fff', letterSpacing: '-0.5px' }}>
                        {stats.grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        <span style={{ fontSize: '16px', fontWeight: 500, marginLeft: '6px', opacity: 0.7 }}>ETB</span>
                    </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '28px', fontWeight: 700, color: '#fff' }}>{stats.totalCount}</div>
                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>Transactions</div>
                </div>
            </div>

            {/* Per-Bank Cards Grid */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                gap: '12px',
            }}>
                {stats.bankData.map(([bank, data]) => {
                    const style = getBankStyle(bank);
                    const percentage = stats.grandTotal > 0 ? ((data.total / stats.grandTotal) * 100) : 0;
                    return (
                        <div key={bank} style={{
                            background: style.bg,
                            border: `1px solid ${style.border}`,
                            borderRadius: '14px',
                            padding: '16px 18px',
                            transition: 'all 0.2s',
                            position: 'relative',
                            overflow: 'hidden',
                        }}>
                            {/* Progress bar background */}
                            <div style={{
                                position: 'absolute',
                                bottom: 0,
                                left: 0,
                                height: '3px',
                                width: `${percentage}%`,
                                background: style.border,
                                borderRadius: '0 2px 0 14px',
                            }} />
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                                <span style={{ fontSize: '22px' }}>{style.icon}</span>
                                <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{bank}</span>
                                <span style={{
                                    marginLeft: 'auto',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    padding: '2px 8px',
                                    borderRadius: '10px',
                                    background: style.border,
                                    color: '#fff',
                                }}>
                                    {percentage.toFixed(1)}%
                                </span>
                            </div>
                            <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.3px' }}>
                                {data.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px', fontWeight: 500 }}>
                                {data.count} transaction{data.count !== 1 ? 's' : ''}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
