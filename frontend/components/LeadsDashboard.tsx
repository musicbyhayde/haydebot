'use client';

import { useState, useEffect, useMemo } from 'react';
import { Lead, Task } from '@/types';
import { Calendar, MapPin, Music, Users, ArrowRight, CheckCircle, Clock, AlertCircle, Menu, Plus, FileText, ChevronDown, Search, X, Filter } from 'lucide-react';
import { AppUser } from '@/lib/auth';
import AddLeadModal from './AddLeadModal';
import LeadDetailPanel from './LeadDetailPanel';
import { api } from '@/lib/api';
import clsx from 'clsx';

interface LeadsDashboardProps {
    leads: Lead[];
    onSelectLead: (id: string) => void;
    onMenuClick?: () => void;
    currentUser?: AppUser | null;
    onRefresh?: () => void;
    onNavigateToTasks?: () => void;
    unreadStatus?: Record<string, { count: number; lastMessage: string | null; lastTime: string | null }>;
}

const STATUS_MAP: Record<string, { label: string; class: string }> = {
    'New': { label: 'חדש', class: 'bg-blue-50 text-blue-700 border-blue-200' },
    'Talking': { label: 'רק דיבורים', class: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
    'Processing': { label: 'בטיפול', class: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
    'Quote_Sent': { label: 'נשלחה הצ"מ', class: 'bg-amber-50 text-amber-700 border-amber-200' },
    'Waiting_Payment': { label: 'מחכה לתשלום', class: 'bg-orange-50 text-orange-700 border-orange-200' },
    'Distributed': { label: 'הופץ', class: 'bg-purple-50 text-purple-700 border-purple-200' },
    'Assigned': { label: 'שובץ', class: 'bg-green-50 text-green-700 border-green-200' },
    'Manual': { label: 'ידני', class: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
    'Closed': { label: 'נסגר', class: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    'Lost': { label: 'אבוד', class: 'bg-red-50 text-red-700 border-red-200' },
};

const OWNER_COLORS: Record<string, string> = {
    'אילן': 'bg-blue-100 text-blue-700',
    'קובי': 'bg-purple-100 text-purple-700',
};

export default function LeadsDashboard({ leads, onSelectLead, onMenuClick, currentUser, onRefresh, onNavigateToTasks, unreadStatus = {} }: LeadsDashboardProps) {
    const [showAddModal, setShowAddModal] = useState(false);
    const [showClosed, setShowClosed] = useState(false);
    const [showLost, setShowLost] = useState(false);
    const [showWaitingPayment, setShowWaitingPayment] = useState(false);
    const [detailLead, setDetailLead] = useState<Lead | null>(null);
    const [tasks, setTasks] = useState<Task[]>([]);

    // ─── Search & Filter State ──────────────────────────
    const [searchQuery, setSearchQuery] = useState('');
    const [filterService, setFilterService] = useState<string>('');
    const [filterOwner, setFilterOwner] = useState<string>('');
    const [filterStatus, setFilterStatus] = useState<string>('');
    const [showFilters, setShowFilters] = useState(false);

    useEffect(() => {
        api.getTasks().then(setTasks).catch(console.error);
    }, []);

    const activeTasks = tasks.filter(t => !t.fields.Is_Completed);

    // ─── Derived unique values for filter dropdowns ─────
    const uniqueServices = useMemo(() => {
        const services = new Set(leads.map(l => l.fields.Service).filter(Boolean));
        return Array.from(services) as string[];
    }, [leads]);

    const uniqueOwners = useMemo(() => {
        const owners = new Set(leads.map(l => l.fields.Owner).filter(Boolean));
        return Array.from(owners) as string[];
    }, [leads]);

    // ─── Filtering Logic ───────────────────────────────
    const filteredLeads = useMemo(() => {
        return leads.filter(l => {
            // Text search (name or phone)
            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                const name = (l.fields.Name || '').toLowerCase();
                const phone = (l.fields.Phone || '').toLowerCase();
                if (!name.includes(q) && !phone.includes(q)) return false;
            }
            // Service filter
            if (filterService && l.fields.Service !== filterService) return false;
            // Owner filter
            if (filterOwner && l.fields.Owner !== filterOwner) return false;
            // Status filter
            if (filterStatus && l.fields.Status !== filterStatus) return false;
            return true;
        });
    }, [leads, searchQuery, filterService, filterOwner, filterStatus]);

    const hasActiveFilters = searchQuery || filterService || filterOwner || filterStatus;

    const clearAllFilters = () => {
        setSearchQuery('');
        setFilterService('');
        setFilterOwner('');
        setFilterStatus('');
    };

    const stats = {
        total: leads.length,
        new: leads.filter(l => l.fields.Status === 'New').length,
        processing: leads.filter(l => ['Processing', 'Talking', 'Quote_Sent'].includes(l.fields.Status)).length,
        assigned: leads.filter(l => ['Assigned', 'Closed', 'Waiting_Payment'].includes(l.fields.Status)).length,
    };

    const activeLeads = filteredLeads.filter(l => !['Closed', 'Lost', 'Waiting_Payment'].includes(l.fields.Status));
    const closedLeads = filteredLeads.filter(l => l.fields.Status === 'Closed');
    const lostLeads = filteredLeads.filter(l => l.fields.Status === 'Lost');
    const waitingPaymentLeads = filteredLeads.filter(l => l.fields.Status === 'Waiting_Payment');

    const renderArchiveTable = (items: Lead[], isOpen: boolean, toggle: () => void, title: string, emoji: string, badgeColor: string) => {
        if (items.length === 0) return null;
        return (
            <div className="mt-4">
                <button
                    onClick={toggle}
                    className="w-full flex items-center justify-between px-5 py-3 bg-white rounded-2xl border border-slate-200 shadow-sm hover:bg-slate-50 transition-colors"
                >
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-600">{emoji} {title}</span>
                        <span className={clsx("text-[10px] px-2 py-0.5 rounded-full font-bold", badgeColor)}>{items.length}</span>
                    </div>
                    <ChevronDown size={18} className={clsx("text-slate-400 transition-transform", isOpen && "rotate-180")} />
                </button>
                {isOpen && (
                    <div className="mt-2 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden opacity-80">
                        <div className="overflow-x-auto">
                                <div className="flex flex-col min-w-full md:min-w-[500px]">
                                {/* Header Row */}
                                <div className="flex items-center px-4 py-2 text-[10px] font-bold text-slate-400 border-b border-slate-100 uppercase bg-slate-50">
                                    <div className="flex-1 min-w-[120px]">לקוח</div>
                                <div className="w-32 hidden md:block">שירות</div>
                                <div className="w-32 hidden md:block">סכום / סיבה</div>
                                <div className="w-12 text-center flex-shrink-0">פרטים</div>
                            </div>
                            {/* Rows */}
                            {items.map(lead => (
                                <div key={lead.id} className="flex items-center px-4 py-2 text-xs border-b border-slate-50 hover:bg-slate-50 transition-colors bg-white">
                                    <div className="flex-1 min-w-[120px] flex flex-col justify-center">
                                        <span className="font-bold text-slate-600">{lead.fields.Name || 'ללא שם'}</span>
                                        <span className="text-[10px] text-slate-400">{lead.fields.Phone}</span>
                                    </div>
                                    <div className="w-32 hidden md:flex items-center text-slate-500">
                                        {lead.fields.Service || '—'}
                                    </div>
                                    <div className="w-32 hidden md:flex items-center text-slate-500">
                                        {lead.fields.Closing_Amount ? `₪${lead.fields.Closing_Amount.toLocaleString()}` : (lead.fields.Lost_Reason || '—')}
                                    </div>
                                    <div className="w-12 flex justify-center">
                                        <button onClick={() => setDetailLead(lead)} className="text-slate-400 hover:text-blue-600 transition-colors" title="פרטים">
                                            <FileText size={14} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="flex-1 overflow-y-auto bg-slate-50 p-4 md:p-8" dir="rtl">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <header className="mb-6 md:mb-8 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        {onMenuClick && (
                            <button onClick={onMenuClick} className="md:hidden p-2 bg-white rounded-lg shadow-sm border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
                                <Menu size={24} />
                            </button>
                        )}
                        <div>
                            <h1 className="text-xl md:text-3xl font-extrabold text-slate-900 mb-0.5 md:mb-2">Hayde Dashboard 🎸</h1>
                            <p className="text-xs md:text-sm text-slate-500">ניהול לידים ומעקב אירועים בזמן אמת</p>
                        </div>
                    </div>
                    <button
                        onClick={() => setShowAddModal(true)}
                        className="flex items-center gap-1.5 px-3 md:px-5 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
                    >
                        <Plus size={16} /> <span className="hidden md:inline">ליד חדש</span>
                    </button>
                </header>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6 mb-6 md:mb-8">
                    {[
                        { label: 'סה"כ לידים', value: stats.total, color: 'bg-white', text: 'text-slate-900' },
                        { label: 'חדשים', value: stats.new, color: 'bg-blue-500', text: 'text-white' },
                        { label: 'בטיפול', value: stats.processing, color: 'bg-yellow-400', text: 'text-slate-900' },
                        { label: 'סגורים/שויכו', value: stats.assigned, color: 'bg-green-500', text: 'text-white' },
                    ].map((stat, i) => (
                        <div key={i} className={clsx("p-4 md:p-6 rounded-2xl shadow-sm border border-slate-200 transition-all hover:shadow-md", stat.color)}>
                            <p className={clsx("text-xs md:text-sm font-medium mb-1 opacity-80", stat.text)}>{stat.label}</p>
                            <p className={clsx("text-2xl md:text-3xl font-bold", stat.text)}>{stat.value}</p>
                        </div>
                    ))}
                </div>

                {/* Tasks Alert Widget */}
                {activeTasks.length > 0 && (
                    <div
                        onClick={onNavigateToTasks}
                        className="mb-6 bg-emerald-50 border border-emerald-200 rounded-2xl p-4 md:p-5 flex items-center justify-between cursor-pointer hover:bg-emerald-100 transition-colors shadow-sm"
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
                                <AlertCircle size={20} />
                            </div>
                            <div>
                                <h3 className="font-bold text-emerald-800 text-sm md:text-base">יש לך {activeTasks.length} משימות פתוחות</h3>
                                <p className="text-xs md:text-sm text-emerald-600">לחץ כאן למעבר ללוח המשימות המלא</p>
                            </div>
                        </div>
                        <ChevronDown size={20} className="text-emerald-400 -rotate-90 hidden md:block" />
                    </div>
                )}

                {/* ─── Search & Filters Bar ─────────────────────── */}
                <div className="mb-4 space-y-3">
                    <div className="flex gap-2">
                        {/* Search Input */}
                        <div className="flex-1 relative">
                            <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder="חיפוש לפי שם או טלפון..."
                                className="w-full pr-10 pl-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition-all shadow-sm"
                            />
                            {searchQuery && (
                                <button onClick={() => setSearchQuery('')} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                                    <X size={14} />
                                </button>
                            )}
                        </div>

                        {/* Filter Toggle */}
                        <button
                            onClick={() => setShowFilters(!showFilters)}
                            className={clsx(
                                "flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold transition-all border shadow-sm",
                                hasActiveFilters
                                    ? "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
                                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                            )}
                        >
                            <Filter size={14} />
                            <span className="hidden md:inline">סינון</span>
                            {hasActiveFilters && (
                                <span className="w-2 h-2 rounded-full bg-blue-500" />
                            )}
                        </button>
                    </div>

                    {/* Filter Dropdowns */}
                    {showFilters && (
                        <div className="flex flex-wrap gap-2 p-4 bg-white rounded-2xl border border-slate-200 shadow-sm animate-in slide-in-from-top-2 duration-200">
                            <select
                                value={filterService}
                                onChange={e => setFilterService(e.target.value)}
                                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-100"
                            >
                                <option value="">כל השירותים</option>
                                {uniqueServices.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>

                            <select
                                value={filterOwner}
                                onChange={e => setFilterOwner(e.target.value)}
                                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-100"
                            >
                                <option value="">כל המובילים</option>
                                {uniqueOwners.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>

                            <select
                                value={filterStatus}
                                onChange={e => setFilterStatus(e.target.value)}
                                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-100"
                            >
                                <option value="">כל הסטטוסים</option>
                                {Object.entries(STATUS_MAP).map(([key, val]) => (
                                    <option key={key} value={key}>{val.label}</option>
                                ))}
                            </select>

                            {hasActiveFilters && (
                                <button
                                    onClick={clearAllFilters}
                                    className="flex items-center gap-1 px-3 py-2 text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
                                >
                                    <X size={12} /> נקה הכל
                                </button>
                            )}
                        </div>
                    )}

                    {/* Active filter summary */}
                    {hasActiveFilters && !showFilters && (
                        <div className="flex items-center gap-2 text-xs text-slate-500 px-1">
                            <span>מציג {filteredLeads.length} מתוך {leads.length} לידים</span>
                            <button onClick={clearAllFilters} className="text-blue-600 hover:text-blue-800 font-bold">נקה סינון</button>
                        </div>
                    )}
                </div>

                {/* Leads Table */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="px-4 md:px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                        <h2 className="font-bold text-base md:text-lg text-slate-800">
                            לידים פעילים ({activeLeads.length})
                            {hasActiveFilters && <span className="text-xs text-slate-400 font-medium mr-2">מסונן</span>}
                        </h2>
                        <span className="text-xs text-slate-400 flex items-center gap-1">
                            <Clock size={12} /> עדכון אחרון: {new Date().toLocaleTimeString()}
                        </span>
                    </div>
                    <div className="overflow-x-auto">
                        <div className="flex flex-col min-w-full md:min-w-[700px]">
                            {/* Header Row */}
                            <div className="flex items-center px-4 md:px-6 py-2 text-[10px] font-bold text-slate-400 border-b border-slate-100 uppercase bg-slate-50">
                                <div className="flex-1 min-w-[100px] md:min-w-[120px]">לקוח</div>
                            <div className="w-20 md:w-24 shrink-0">סטטוס</div>
                            <div className="w-16 shrink-0 hidden md:block">מוביל</div>
                            <div className="w-28 shrink-0 hidden md:block">שירות</div>
                            <div className="w-24 shrink-0 hidden md:block">תאריך</div>
                            <div className="w-24 shrink-0 hidden lg:block">מיקום</div>
                            <div className="w-20 md:w-28 shrink-0 flex justify-end">פעולות</div>
                        </div>
                        {/* Rows */}
                        {activeLeads.length === 0 && hasActiveFilters ? (
                            <div className="px-6 py-12 text-center text-slate-400">
                                <Search size={32} className="mx-auto mb-3 opacity-30" />
                                <p className="font-bold text-sm">לא נמצאו תוצאות</p>
                                <p className="text-xs mt-1">נסה לשנות את החיפוש או הסינון</p>
                                <button onClick={clearAllFilters} className="mt-3 text-xs font-bold text-blue-600 hover:text-blue-800">נקה סינון</button>
                            </div>
                        ) : (
                        activeLeads.map((lead) => {
                            const statusInfo = STATUS_MAP[lead.fields.Status] || { label: lead.fields.Status, class: 'bg-gray-50 text-gray-700 border-gray-200' };
                            const ownerColor = OWNER_COLORS[lead.fields.Owner || ''] || 'bg-slate-100 text-slate-600';

                            return (
                                <div key={lead.id} className="flex items-center px-4 md:px-6 py-2 text-xs border-b border-slate-50 hover:bg-slate-50 transition-colors bg-white group">
                                    <div className="flex-1 min-w-[100px] md:min-w-[120px] flex flex-col justify-center overflow-hidden pr-2">
                                        <div className="flex items-center gap-1.5 mb-0.5">
                                            <span className="font-bold text-slate-800 truncate">{lead.fields.Name || 'ללא שם'}</span>
                                            {unreadStatus?.[lead.id]?.count > 0 && (
                                                <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 text-[8px] font-bold text-white shadow-sm ring-1 ring-white shrink-0">
                                                    {unreadStatus[lead.id].count}
                                                </span>
                                            )}
                                        </div>
                                        <span className="text-[10px] text-slate-400 truncate">{lead.fields.Phone}</span>
                                    </div>
                                    <div className="w-20 md:w-24 shrink-0 flex items-center">
                                        <span className={clsx("inline-flex items-center px-1.5 md:px-2 py-0.5 rounded-full text-[9px] md:text-[10px] font-bold border", statusInfo.class)}>
                                            {statusInfo.label}
                                        </span>
                                    </div>
                                    <div className="w-16 shrink-0 hidden md:flex items-center">
                                        {lead.fields.Owner ? (
                                            <span className={clsx("text-[10px] px-1.5 py-0.5 rounded-md font-bold", ownerColor)}>
                                                {lead.fields.Owner}
                                            </span>
                                        ) : <span className="text-slate-300">—</span>}
                                    </div>
                                    <div className="w-28 shrink-0 hidden md:flex items-center text-slate-500">
                                        {lead.fields.Service ? (
                                            <>
                                                <Music size={11} className="ml-1 text-slate-400" />
                                                <span className="truncate pr-1">{lead.fields.Service}</span>
                                            </>
                                        ) : <span className="text-slate-300">—</span>}
                                    </div>
                                    <div className="w-24 shrink-0 hidden md:flex items-center text-slate-500 font-medium">
                                        {lead.fields.Event_Date ? lead.fields.Event_Date : <span className="text-slate-300">—</span>}
                                    </div>
                                    <div className="w-24 shrink-0 hidden lg:flex items-center text-slate-500 pr-1">
                                        {lead.fields.Location ? (
                                            <span className="truncate" title={lead.fields.Location}>{lead.fields.Location}</span>
                                        ) : <span className="text-slate-300">—</span>}
                                    </div>
                                    <div className="w-20 md:w-28 shrink-0 flex items-center justify-end gap-1 md:gap-1.5">
                                        <button
                                            onClick={() => setDetailLead(lead)}
                                            className="text-slate-300 hover:text-blue-600 transition-colors p-1 hidden sm:block"
                                            title="פרטים ועדכונים"
                                        >
                                            <FileText size={14} />
                                        </button>
                                        <button
                                            onClick={() => onSelectLead(lead.id)}
                                            className={clsx(
                                                "flex items-center justify-center md:justify-start gap-1 text-[10px] font-bold transition-all px-2 md:px-2.5 py-1 rounded-md max-w-full",
                                                unreadStatus?.[lead.id]?.count > 0 
                                                    ? "bg-emerald-50 text-emerald-600 border border-emerald-100 hover:bg-emerald-100" 
                                                    : "bg-blue-50 text-blue-600 border border-blue-50 hover:bg-blue-100"
                                            )}
                                        >
                                            <span className="hidden sm:inline">צ'אט</span> <ArrowRight size={11} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })
                        )}
                        </div>
                    </div>
                </div>

                {/* Waiting Payment Leads */}
                {renderArchiveTable(
                    waitingPaymentLeads, showWaitingPayment, () => setShowWaitingPayment(!showWaitingPayment),
                    'מחכים לתשלום', '⏳', 'bg-orange-100 text-orange-700'
                )}

                {/* Closed Leads */}
                {renderArchiveTable(
                    closedLeads, showClosed, () => setShowClosed(!showClosed),
                    'לידים סגורים', '✅', 'bg-green-100 text-green-700'
                )}

                {/* Lost Leads */}
                {renderArchiveTable(
                    lostLeads, showLost, () => setShowLost(!showLost),
                    'לידים אבודים', '❌', 'bg-red-100 text-red-700'
                )}
            </div>

            {/* Modals */}
            <AddLeadModal
                isOpen={showAddModal}
                onClose={() => setShowAddModal(false)}
                onCreated={() => onRefresh?.()}
                currentUserName={currentUser?.displayName}
            />

            {detailLead && (
                <LeadDetailPanel
                    lead={detailLead}
                    currentUserName={currentUser?.displayName || ''}
                    isAdmin={currentUser?.role === 'admin' || currentUser?.role === 'partner'}
                    onClose={() => setDetailLead(null)}
                    onStatusChange={() => { setDetailLead(null); onRefresh?.(); }}
                />
            )}
        </div>
    );
}
