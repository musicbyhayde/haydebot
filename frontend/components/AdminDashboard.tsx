'use client';

import { useState, useEffect, useMemo } from 'react';
import { Lead, Task, Activity } from '@/types';
import { AppUser } from '@/lib/auth';
import { api } from '@/lib/api';
import { normalizeEventDate, parseDateToSortable } from '@/lib/formatters';
import {
    LayoutDashboard, Users, CalendarDays, ListTodo, AlertCircle,
    MessageSquare, Clock, ChevronLeft, TrendingUp, DollarSign,
    Menu, CheckCircle2, MapPin, Music, FileText, ArrowLeft
} from 'lucide-react';
import clsx from 'clsx';

interface AdminDashboardProps {
    leads: Lead[];
    currentUser?: AppUser | null;
    onMenuClick?: () => void;
    onRefresh?: () => void;
    unreadStatus?: Record<string, { count: number; lastMessage: string | null; lastTime: string | null }>;
    onNavigateToTasks?: () => void;
    onNavigateToLeads?: () => void;
    onOpenDetails?: (id: string) => void;
}

export default function AdminDashboard({
    leads,
    currentUser,
    onMenuClick,
    onRefresh,
    unreadStatus = {},
    onNavigateToTasks,
    onNavigateToLeads,
    onOpenDetails,
}: AdminDashboardProps) {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [activities, setActivities] = useState<Activity[]>([]);
    const [financeSummary, setFinanceSummary] = useState<Record<string, { income: number; expenses: number; balance: number }> | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        Promise.all([
            api.getTasks().catch(() => []),
            api.getActivities().catch(() => []),
            api.getFinanceSummary().catch(() => null),
        ]).then(([t, a, f]) => {
            setTasks(t);
            setActivities(a);
            setFinanceSummary(f);
        }).finally(() => setLoading(false));
    }, []);

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    // ─── KPI calculations ───────────────────────────
    const activeLeads = useMemo(() =>
        leads.filter(l => !['Closed', 'Lost', 'Completed'].includes(l.fields.Status)),
    [leads]);

    const newLeads7d = useMemo(() => {
        const weekAgo = new Date(now.getTime() - 7 * 86400000);
        return leads.filter(l => new Date(l.createdTime) >= weekAgo);
    }, [leads]);

    const upcomingEvents30d = useMemo(() => {
        const in30 = new Date(now.getTime() + 30 * 86400000);
        return leads.filter(l => {
            const d = parseDateToSortable(l.fields.Event_Date);
            return d && d >= todayStr && d <= in30.toISOString().split('T')[0];
        });
    }, [leads]);

    const activeTasks = useMemo(() => tasks.filter(t => !t.fields.Is_Completed), [tasks]);

    // ─── Action items: leads needing attention ──────
    const staleNewLeads = useMemo(() => {
        const dayAgo = new Date(now.getTime() - 24 * 3600000);
        return leads.filter(l => l.fields.Status === 'New' && new Date(l.createdTime) < dayAgo);
    }, [leads]);

    const unreadLeads = useMemo(() =>
        leads.filter(l => (unreadStatus[l.id]?.count || 0) > 0),
    [leads, unreadStatus]);

    const eventsThisWeek = useMemo(() => {
        const in7 = new Date(now.getTime() + 7 * 86400000);
        const in7Str = in7.toISOString().split('T')[0];
        return leads.filter(l => {
            const d = parseDateToSortable(l.fields.Event_Date);
            return d && d >= todayStr && d <= in7Str;
        }).sort((a, b) => {
            const da = parseDateToSortable(a.fields.Event_Date) || '';
            const db = parseDateToSortable(b.fields.Event_Date) || '';
            return da.localeCompare(db);
        });
    }, [leads]);

    // ─── Urgent tasks (nearest due date) ────────────
    const urgentTasks = useMemo(() => {
        return activeTasks
            .filter(t => t.fields.Due_Date)
            .sort((a, b) => (a.fields.Due_Date || '').localeCompare(b.fields.Due_Date || ''))
            .slice(0, 5);
    }, [activeTasks]);

    // ─── Recent activities ──────────────────────────
    const recentActivities = useMemo(() =>
        activities.slice(0, 8),
    [activities]);

    // ─── Finance this month ─────────────────────────
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthFinance = financeSummary?.[currentMonth];

    const pendingCommissions = useMemo(() =>
        leads.filter(l => l.fields.Status === 'Referred' && (l.fields.Commission_Status === 'ממתין לגבייה')),
    [leads]);

    // ─── Task completion handler ────────────────────
    const handleCompleteTask = async (taskId: string) => {
        try {
            await api.updateTask(taskId, { Is_Completed: true });
            setTasks(prev => prev.map(t => t.id === taskId ? { ...t, fields: { ...t.fields, Is_Completed: true } } : t));
        } catch (e) {
            console.error(e);
        }
    };

    const formatDate = (dateStr: string) => {
        try {
            const d = new Date(dateStr);
            return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });
        } catch { return dateStr; }
    };

    const formatTime = (dateStr: string) => {
        try {
            const d = new Date(dateStr);
            return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
        } catch { return ''; }
    };

    const formatCurrency = (n: number) => `₪${n.toLocaleString('he-IL', { maximumFractionDigits: 0 })}`;

    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center bg-slate-50">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-3 border-slate-200 border-t-slate-600 rounded-full animate-spin" />
                    <span className="text-sm font-medium text-slate-400">טוען דשבורד...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-y-auto bg-slate-50 p-4 md:p-8" dir="rtl">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <header className="mb-8 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        {onMenuClick && (
                            <button onClick={onMenuClick} className="md:hidden p-2 bg-white rounded-lg shadow-sm border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
                                <Menu size={24} />
                            </button>
                        )}
                        <div>
                            <h1 className="text-xl md:text-3xl font-extrabold text-slate-900 mb-1">
                                שלום{currentUser ? `, ${currentUser.displayName}` : ''} 👋
                            </h1>
                            <p className="text-xs md:text-sm text-slate-400 font-medium">תמונת מצב ניהולית • {now.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
                        </div>
                    </div>
                </header>

                {/* ─── KPI Cards ─────────────────────────── */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-8">
                    {[
                        { icon: Users, label: 'לידים פעילים', value: activeLeads.length, accent: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' },
                        { icon: TrendingUp, label: 'חדשים (7 ימים)', value: newLeads7d.length, accent: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
                        { icon: CalendarDays, label: 'אירועים (30 יום)', value: upcomingEvents30d.length, accent: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-100' },
                        { icon: ListTodo, label: 'משימות פתוחות', value: activeTasks.length, accent: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' },
                    ].map((kpi, i) => (
                        <div key={i} className={clsx("p-4 md:p-5 rounded-2xl border bg-white transition-all hover:shadow-md", kpi.border)}>
                            <div className="flex items-center gap-2.5 mb-3">
                                <div className={clsx("w-9 h-9 rounded-xl flex items-center justify-center", kpi.bg)}>
                                    <kpi.icon size={18} className={kpi.accent} />
                                </div>
                            </div>
                            <p className="text-2xl md:text-3xl font-extrabold text-slate-900 mb-0.5">{kpi.value}</p>
                            <p className="text-[11px] md:text-xs font-medium text-slate-400">{kpi.label}</p>
                        </div>
                    ))}
                </div>

                {/* ─── Action Items (Needs Attention) ────── */}
                {(staleNewLeads.length > 0 || unreadLeads.length > 0) && (
                    <div className="mb-6 bg-white rounded-2xl border border-slate-200 overflow-hidden">
                        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
                            <AlertCircle size={16} className="text-red-500" />
                            <h2 className="font-bold text-sm text-slate-800">דורש תשומת לב</h2>
                        </div>
                        <div className="divide-y divide-slate-50">
                            {staleNewLeads.map(lead => (
                                <button
                                    key={`stale-${lead.id}`}
                                    onClick={() => onOpenDetails?.(lead.id)}
                                    className="w-full flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors text-right"
                                >
                                    <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
                                        <Clock size={14} className="text-red-500" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-bold text-slate-700 truncate">{lead.fields.Name || lead.fields.Phone}</p>
                                        <p className="text-[10px] text-slate-400">ליד חדש — ממתין לטיפול מעל 24 שעות</p>
                                    </div>
                                    <ChevronLeft size={14} className="text-slate-300 shrink-0" />
                                </button>
                            ))}
                            {unreadLeads.map(lead => (
                                <button
                                    key={`unread-${lead.id}`}
                                    onClick={() => onOpenDetails?.(lead.id)}
                                    className="w-full flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors text-right"
                                >
                                    <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                                        <MessageSquare size={14} className="text-emerald-500" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-bold text-slate-700 truncate">{lead.fields.Name || lead.fields.Phone}</p>
                                        <p className="text-[10px] text-slate-400">
                                            {unreadStatus[lead.id]?.count} הודעות שלא נקראו
                                            {unreadStatus[lead.id]?.lastMessage && ` — "${unreadStatus[lead.id].lastMessage}"`}
                                        </p>
                                    </div>
                                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white shrink-0">
                                        {unreadStatus[lead.id]?.count}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                    {/* ─── Upcoming Events ────────────────── */}
                    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <CalendarDays size={16} className="text-violet-500" />
                                <h2 className="font-bold text-sm text-slate-800">אירועים קרובים</h2>
                                {eventsThisWeek.length > 0 && (
                                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-violet-50 text-violet-600 border border-violet-100">{eventsThisWeek.length}</span>
                                )}
                            </div>
                        </div>
                        {eventsThisWeek.length === 0 ? (
                            <div className="px-5 py-10 text-center">
                                <CalendarDays size={28} className="mx-auto mb-2 text-slate-200" />
                                <p className="text-xs text-slate-400 font-medium">אין אירועים בשבוע הקרוב</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-50">
                                {eventsThisWeek.slice(0, 6).map(lead => (
                                    <button
                                        key={lead.id}
                                        onClick={() => onOpenDetails?.(lead.id)}
                                        className="w-full flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors text-right"
                                    >
                                        <div className="w-10 h-10 rounded-xl bg-violet-50 flex flex-col items-center justify-center shrink-0">
                                            <span className="text-[10px] font-bold text-violet-500 leading-none">
                                                {normalizeEventDate(lead.fields.Event_Date || '').split('/')[0]}
                                            </span>
                                            <span className="text-[8px] text-violet-400">
                                                {normalizeEventDate(lead.fields.Event_Date || '').split('/')[1]}
                                            </span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-bold text-slate-700 truncate">{lead.fields.Name || 'ללא שם'}</p>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                {lead.fields.Service && (
                                                    <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                                                        <Music size={9} /> {lead.fields.Service}
                                                    </span>
                                                )}
                                                {lead.fields.Location && (
                                                    <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                                                        <MapPin size={9} /> {lead.fields.Location}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <ChevronLeft size={14} className="text-slate-300 shrink-0" />
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* ─── Urgent Tasks ───────────────────── */}
                    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <ListTodo size={16} className="text-amber-500" />
                                <h2 className="font-bold text-sm text-slate-800">משימות דחופות</h2>
                                {activeTasks.length > 0 && (
                                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-50 text-amber-600 border border-amber-100">{activeTasks.length}</span>
                                )}
                            </div>
                            {onNavigateToTasks && (
                                <button onClick={onNavigateToTasks} className="text-[11px] font-bold text-blue-600 hover:text-blue-700 transition-colors">
                                    הכל →
                                </button>
                            )}
                        </div>
                        {urgentTasks.length === 0 ? (
                            <div className="px-5 py-10 text-center">
                                <CheckCircle2 size={28} className="mx-auto mb-2 text-slate-200" />
                                <p className="text-xs text-slate-400 font-medium">אין משימות דחופות 🎉</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-50">
                                {urgentTasks.map(task => {
                                    const isOverdue = task.fields.Due_Date && task.fields.Due_Date < todayStr;
                                    const linkedLead = task.fields.Lead_ID ? leads.find(l => l.id === task.fields.Lead_ID) : null;
                                    return (
                                        <div key={task.id} className="flex items-center gap-3 px-5 py-3 group">
                                            <button
                                                onClick={() => handleCompleteTask(task.id)}
                                                className="w-5 h-5 rounded-md border-2 border-slate-300 hover:border-emerald-500 hover:bg-emerald-50 transition-all shrink-0 flex items-center justify-center"
                                                title="סמן כבוצע"
                                            >
                                                <CheckCircle2 size={12} className="text-transparent group-hover:text-emerald-500 transition-colors" />
                                            </button>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-bold text-slate-700 truncate">{task.fields.Title}</p>
                                                <div className="flex items-center gap-1.5 mt-0.5">
                                                    {task.fields.Assignee && (
                                                        <span className="text-[10px] text-slate-400">{task.fields.Assignee}</span>
                                                    )}
                                                    {linkedLead && (
                                                        <>
                                                            {task.fields.Assignee && <span className="text-[10px] text-slate-300">•</span>}
                                                            <button
                                                                onClick={() => onOpenDetails?.(linkedLead.id)}
                                                                className="text-[10px] text-blue-500 hover:text-blue-700 font-medium transition-colors truncate"
                                                                title={`פתח ליד: ${linkedLead.fields.Name || linkedLead.fields.Phone}`}
                                                            >
                                                                🔗 {linkedLead.fields.Name || linkedLead.fields.Phone}
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                            {task.fields.Due_Date && (
                                                <span className={clsx(
                                                    "text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0",
                                                    isOverdue
                                                        ? "bg-red-50 text-red-600 border border-red-100"
                                                        : "bg-slate-50 text-slate-500 border border-slate-100"
                                                )}>
                                                    {formatDate(task.fields.Due_Date)}
                                                </span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                    {/* ─── Recent Activity ────────────────── */}
                    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
                            <Clock size={16} className="text-slate-400" />
                            <h2 className="font-bold text-sm text-slate-800">פעילות אחרונה</h2>
                        </div>
                        {recentActivities.length === 0 ? (
                            <div className="px-5 py-10 text-center">
                                <Clock size={28} className="mx-auto mb-2 text-slate-200" />
                                <p className="text-xs text-slate-400 font-medium">אין פעילות אחרונה</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-50">
                                {recentActivities.map(a => (
                                    <div key={a.id} className="flex items-start gap-3 px-5 py-3">
                                        <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center shrink-0 mt-0.5">
                                            <span className="text-[10px]">
                                                {a.fields.action_type === 'status_change' ? '🔄' :
                                                 a.fields.action_type === 'note_added' ? '📝' :
                                                 a.fields.action_type === 'lead_created' ? '✨' :
                                                 a.fields.action_type === 'message_sent' ? '💬' : '📌'}
                                            </span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[11px] text-slate-600 leading-relaxed">{a.fields.description}</p>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <span className="text-[10px] text-slate-400 font-medium">{a.fields.actor}</span>
                                                <span className="text-[10px] text-slate-300">•</span>
                                                <span className="text-[10px] text-slate-400">{formatTime(a.fields.created_at)}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* ─── Financial Summary ──────────────── */}
                    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
                            <DollarSign size={16} className="text-amber-500" />
                            <h2 className="font-bold text-sm text-slate-800">סיכום כספי — {now.toLocaleDateString('he-IL', { month: 'long' })}</h2>
                        </div>
                        <div className="p-5">
                            {monthFinance ? (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-3 gap-3">
                                        <div className="text-center p-3 rounded-xl bg-emerald-50 border border-emerald-100">
                                            <p className="text-lg font-extrabold text-emerald-700">{formatCurrency(monthFinance.income)}</p>
                                            <p className="text-[10px] font-medium text-emerald-500 mt-0.5">הכנסות</p>
                                        </div>
                                        <div className="text-center p-3 rounded-xl bg-red-50 border border-red-100">
                                            <p className="text-lg font-extrabold text-red-600">{formatCurrency(monthFinance.expenses)}</p>
                                            <p className="text-[10px] font-medium text-red-400 mt-0.5">הוצאות</p>
                                        </div>
                                        <div className="text-center p-3 rounded-xl bg-slate-50 border border-slate-200">
                                            <p className={clsx("text-lg font-extrabold", monthFinance.balance >= 0 ? "text-slate-800" : "text-red-600")}>{formatCurrency(monthFinance.balance)}</p>
                                            <p className="text-[10px] font-medium text-slate-400 mt-0.5">יתרה</p>
                                        </div>
                                    </div>
                                    {pendingCommissions.length > 0 && (
                                        <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-50 border border-amber-100">
                                            <span className="text-sm">💰</span>
                                            <span className="text-xs font-bold text-amber-700">
                                                {pendingCommissions.length} עמלות ממתינות לגבייה
                                            </span>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="text-center py-6">
                                    <DollarSign size={28} className="mx-auto mb-2 text-slate-200" />
                                    <p className="text-xs text-slate-400 font-medium">אין נתונים כספיים לחודש זה</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
