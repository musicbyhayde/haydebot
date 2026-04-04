'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { AppUser } from '@/lib/auth';
import { BarChart3, TrendingUp, Users, Music, DollarSign, AlertTriangle, Menu, ArrowDown, ArrowUp, Minus, Loader2 } from 'lucide-react';
import clsx from 'clsx';

interface AnalyticsPageProps {
    currentUser?: AppUser | null;
    onMenuClick?: () => void;
}

interface Analytics {
    funnel: { total: number; completedBot: number; assigned: number; closed: number; lost: number };
    monthly: Record<string, { new: number; closed: number; lost: number; revenue: number }>;
    services: Record<string, { count: number; closed: number; revenue: number }>;
    musicianPerformance: Array<{ name: string; received: number; closed: number; lost: number; revenue: number }>;
    revenue: { total: number; commission: number };
    lostReasons: Record<string, number>;
    conversionRate: number;
}

export default function AnalyticsPage({ currentUser, onMenuClick }: AnalyticsPageProps) {
    const [data, setData] = useState<Analytics | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.getAnalytics()
            .then(setData)
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center bg-slate-50 dark:bg-[#0b141a]">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 size={32} className="animate-spin text-blue-500" />
                    <span className="text-sm font-bold text-slate-500 dark:text-slate-400">טוען אנליטיקות...</span>
                </div>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="flex-1 flex items-center justify-center bg-slate-50 dark:bg-[#0b141a]">
                <p className="text-slate-500 dark:text-slate-400 font-medium">שגיאה בטעינת הנתונים</p>
            </div>
        );
    }

    const { funnel, monthly, services, musicianPerformance, revenue, lostReasons, conversionRate } = data;

    // Sorted months for the chart (oldest first)
    const monthKeys = Object.keys(monthly).sort();
    const maxNewInMonth = Math.max(...monthKeys.map(k => monthly[k].new), 1);

    // Service data sorted by count
    const serviceEntries = Object.entries(services).sort((a, b) => b[1].count - a[1].count);
    const maxServiceCount = Math.max(...serviceEntries.map(([, v]) => v.count), 1);

    // Lost reason sorted
    const lostReasonEntries = Object.entries(lostReasons).sort((a, b) => b[1] - a[1]);

    const funnelSteps = [
        { label: 'לידים נכנסו', value: funnel.total, color: 'bg-blue-500', pct: 100 },
        { label: 'סיימו בוט', value: funnel.completedBot, color: 'bg-cyan-500', pct: funnel.total > 0 ? Math.round(funnel.completedBot / funnel.total * 100) : 0 },
        { label: 'שויכו לנגן', value: funnel.assigned, color: 'bg-purple-500', pct: funnel.total > 0 ? Math.round(funnel.assigned / funnel.total * 100) : 0 },
        { label: 'נסגרו', value: funnel.closed, color: 'bg-emerald-500', pct: funnel.total > 0 ? Math.round(funnel.closed / funnel.total * 100) : 0 },
    ];

    const formatCurrency = (n: number) => `₪${n.toLocaleString('he-IL', { maximumFractionDigits: 0 })}`;

    const formatMonth = (key: string) => {
        const [y, m] = key.split('-');
        const months = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
        return months[parseInt(m) - 1] || m;
    };

    return (
        <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-[#0b141a] p-4 md:p-8" dir="rtl">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <header className="mb-6 md:mb-8 flex items-center gap-3">
                    {onMenuClick && (
                        <button onClick={onMenuClick} className="md:hidden p-2 bg-white dark:bg-[#111b21] rounded-lg shadow-sm border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:bg-[#0b141a] transition-colors">
                            <Menu size={24} />
                        </button>
                    )}
                    <div>
                        <h1 className="text-xl md:text-3xl font-extrabold text-slate-900 dark:text-slate-100 mb-0.5 md:mb-2">אנליטיקות 📊</h1>
                        <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400">סטטיסטיקות ומגמות מערכת</p>
                    </div>
                </header>

                {/* ─── Top KPI Cards ─────────────────────── */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-5 mb-6">
                    <div className="p-4 md:p-5 bg-white dark:bg-[#111b21] rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600"><Users size={16} /></div>
                            <span className="text-[10px] md:text-xs font-bold text-slate-400 uppercase">סה"כ לידים</span>
                        </div>
                        <p className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-slate-100">{funnel.total}</p>
                    </div>
                    <div className="p-4 md:p-5 bg-white dark:bg-[#111b21] rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600"><TrendingUp size={16} /></div>
                            <span className="text-[10px] md:text-xs font-bold text-slate-400 uppercase">אחוז סגירה</span>
                        </div>
                        <p className="text-2xl md:text-3xl font-extrabold text-emerald-600">{conversionRate}%</p>
                    </div>
                    <div className="p-4 md:p-5 bg-white dark:bg-[#111b21] rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center text-amber-600"><DollarSign size={16} /></div>
                            <span className="text-[10px] md:text-xs font-bold text-slate-400 uppercase">הכנסות</span>
                        </div>
                        <p className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-slate-100">{formatCurrency(revenue.total)}</p>
                    </div>
                    <div className="p-4 md:p-5 bg-white dark:bg-[#111b21] rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center text-purple-600"><Music size={16} /></div>
                            <span className="text-[10px] md:text-xs font-bold text-slate-400 uppercase">עמלות נגנים</span>
                        </div>
                        <p className="text-2xl md:text-3xl font-extrabold text-purple-600">{formatCurrency(revenue.commission)}</p>
                    </div>
                </div>

                {/* ─── Conversion Funnel ─────────────────── */}
                <div className="bg-white dark:bg-[#111b21] rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-5 md:p-6 mb-6">
                    <h2 className="font-bold text-base md:text-lg text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
                        <BarChart3 size={18} className="text-blue-500" /> משפך המרה
                    </h2>
                    <div className="space-y-3">
                        {funnelSteps.map((step, i) => (
                            <div key={i} className="flex items-center gap-3">
                                <span className="text-xs font-bold text-slate-600 dark:text-slate-400 w-20 md:w-28 shrink-0 text-left">{step.label}</span>
                                <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-full h-7 overflow-hidden relative">
                                    <div
                                        className={clsx("h-full rounded-full transition-all duration-700 ease-out", step.color)}
                                        style={{ width: `${step.pct}%` }}
                                    />
                                    <span className="absolute inset-0 flex items-center justify-center text-[11px] font-extrabold text-slate-700 dark:text-slate-300">
                                        {step.value} ({step.pct}%)
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    {/* ─── Monthly Trends ───────────────── */}
                    <div className="bg-white dark:bg-[#111b21] rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-5 md:p-6">
                        <h2 className="font-bold text-base md:text-lg text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
                            <TrendingUp size={18} className="text-cyan-500" /> מגמות חודשיות
                        </h2>
                        <div className="space-y-2">
                            {monthKeys.map(key => {
                                const m = monthly[key];
                                const barWidth = Math.max((m.new / maxNewInMonth) * 100, 4);
                                return (
                                    <div key={key} className="flex items-center gap-2">
                                        <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 w-16 shrink-0">{formatMonth(key)}</span>
                                        <div className="flex-1 flex items-center gap-1.5">
                                            <div className="flex-1 bg-slate-50 dark:bg-[#0b141a] rounded-full h-5 overflow-hidden">
                                                <div className="h-full bg-blue-400 rounded-full transition-all" style={{ width: `${barWidth}%` }} />
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0 text-[10px] font-bold">
                                                <span className="text-blue-600">{m.new} חדש</span>
                                                <span className="text-emerald-600">{m.closed} ✓</span>
                                                {m.lost > 0 && <span className="text-red-500">{m.lost} ✗</span>}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* ─── Service Breakdown ───────────── */}
                    <div className="bg-white dark:bg-[#111b21] rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-5 md:p-6">
                        <h2 className="font-bold text-base md:text-lg text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
                            <Music size={18} className="text-purple-500" /> התפלגות שירותים
                        </h2>
                        <div className="space-y-2">
                            {serviceEntries.map(([name, stats]) => {
                                const barWidth = Math.max((stats.count / maxServiceCount) * 100, 8);
                                const convRate = stats.count > 0 ? Math.round(stats.closed / stats.count * 100) : 0;
                                return (
                                    <div key={name} className="flex items-center gap-2">
                                        <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 w-20 shrink-0 truncate">{name}</span>
                                        <div className="flex-1 bg-slate-50 dark:bg-[#0b141a] rounded-full h-5 overflow-hidden">
                                            <div className="h-full bg-purple-400 rounded-full transition-all" style={{ width: `${barWidth}%` }} />
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0 text-[10px] font-bold">
                                            <span className="text-slate-600 dark:text-slate-400">{stats.count}</span>
                                            <span className="text-emerald-600">{convRate}%</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    {/* ─── Musician Performance Table ──── */}
                    <div className="bg-white dark:bg-[#111b21] rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-5 md:p-6">
                        <h2 className="font-bold text-base md:text-lg text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
                            <Users size={18} className="text-amber-500" /> ביצועי נגנים
                        </h2>
                        {musicianPerformance.length === 0 ? (
                            <p className="text-sm text-slate-400 text-center py-6">אין נתונים עדיין</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="border-b border-slate-100 dark:border-slate-800/60">
                                            <th className="text-right py-2 px-2 font-bold text-slate-400 text-[10px] uppercase">נגן</th>
                                            <th className="text-center py-2 px-1 font-bold text-slate-400 text-[10px] uppercase">קיבל</th>
                                            <th className="text-center py-2 px-1 font-bold text-slate-400 text-[10px] uppercase">סגר</th>
                                            <th className="text-center py-2 px-1 font-bold text-slate-400 text-[10px] uppercase">הפסיד</th>
                                            <th className="text-center py-2 px-1 font-bold text-slate-400 text-[10px] uppercase">% סגירה</th>
                                            <th className="text-left py-2 px-2 font-bold text-slate-400 text-[10px] uppercase">הכנסות</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {musicianPerformance.map((m, i) => {
                                            const rate = m.received > 0 ? Math.round(m.closed / m.received * 100) : 0;
                                            return (
                                                <tr key={i} className="border-b border-slate-50 dark:border-slate-800/40 hover:bg-slate-50 dark:bg-[#0b141a] transition-colors">
                                                    <td className="py-2 px-2 font-bold text-slate-800 dark:text-slate-200">{m.name}</td>
                                                    <td className="py-2 px-1 text-center text-slate-600 dark:text-slate-400">{m.received}</td>
                                                    <td className="py-2 px-1 text-center text-emerald-600 font-bold">{m.closed}</td>
                                                    <td className="py-2 px-1 text-center text-red-500">{m.lost}</td>
                                                    <td className="py-2 px-1 text-center">
                                                        <span className={clsx(
                                                            "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold",
                                                            rate >= 50 ? "bg-emerald-100 text-emerald-700" :
                                                            rate >= 25 ? "bg-amber-100 text-amber-700" :
                                                            "bg-red-100 text-red-700"
                                                        )}>
                                                            {rate >= 50 ? <ArrowUp size={10} /> : rate >= 25 ? <Minus size={10} /> : <ArrowDown size={10} />}
                                                            {rate}%
                                                        </span>
                                                    </td>
                                                    <td className="py-2 px-2 text-left font-bold text-slate-700 dark:text-slate-300">{formatCurrency(m.revenue)}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* ─── Lost Reasons ──────────────── */}
                    <div className="bg-white dark:bg-[#111b21] rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-5 md:p-6">
                        <h2 className="font-bold text-base md:text-lg text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
                            <AlertTriangle size={18} className="text-red-500" /> סיבות הפסד
                        </h2>
                        {lostReasonEntries.length === 0 ? (
                            <p className="text-sm text-slate-400 text-center py-6">אין לידים אבודים 🎉</p>
                        ) : (
                            <div className="space-y-2">
                                {lostReasonEntries.map(([reason, count], i) => (
                                    <div key={i} className="flex items-center justify-between p-3 bg-red-50/50 rounded-xl border border-red-100">
                                        <span className="text-xs font-medium text-slate-700 dark:text-slate-300 flex-1 truncate ml-3">{reason}</span>
                                        <span className="text-xs font-extrabold text-red-600 bg-red-100 px-2 py-0.5 rounded-full shrink-0">{count}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
