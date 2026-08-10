'use client';

import { useState, useEffect, useMemo } from 'react';
import { Lead, Task } from '@/types';
import { Calendar, MapPin, Music, Users, ArrowRight, CheckCircle, Clock, AlertCircle, Menu, Plus, FileText, ChevronDown, ChevronUp, ChevronsUpDown, Search, X, Filter } from 'lucide-react';
import { AppUser } from '@/lib/auth';
import AddLeadModal from './AddLeadModal';
import LeadDetailPanel from './LeadDetailPanel';
import { api } from '@/lib/api';
import clsx from 'clsx';
import { toDisplayPhone, normalizeEventDate, parseDateToSortable } from '@/lib/formatters';
import TaskActionModal from './TaskActionModal';
import { useToast } from '@/components/ui';

interface LeadsDashboardProps {
    leads: Lead[];
    onSelectLead: (id: string) => void;
    onMenuClick?: () => void;
    currentUser?: AppUser | null;
    onRefresh?: () => void;
    onNavigateToTasks?: () => void;
    unreadStatus?: Record<string, { count: number; lastMessage: string | null; lastTime: string | null }>;
    onOpenDetails?: (id: string) => void;
}

const STATUS_MAP: Record<string, { label: string; class: string }> = {
    'New': { label: 'חדש', class: 'bg-blue-50 text-blue-700 border-blue-200' },
    'Processing': { label: 'בטיפול בוט', class: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
    'Manual': { label: 'בטיפול ידני', class: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
    'Talking': { label: 'בשיחה', class: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
    'Quote_Sent': { label: 'נשלחה הצ"מ', class: 'bg-amber-50 text-amber-700 border-amber-200' },
    'Waiting_Payment': { label: 'מחכה לתשלום', class: 'bg-orange-50 text-orange-700 border-orange-200' },
    'Distributed': { label: 'הופץ', class: 'bg-purple-50 text-purple-700 border-purple-200' },
    'Assigned': { label: 'שובץ', class: 'bg-green-50 text-green-700 border-green-200' },
    'Closed': { label: 'נסגר', class: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    'Lost': { label: 'אבוד', class: 'bg-red-50 text-red-700 border-red-200' },
    'Referred': { label: 'הופנה', class: 'bg-teal-50 text-teal-700 border-teal-200' },
    'Completed': { label: 'הושלם', class: 'bg-slate-100 text-slate-600 border-slate-300' },
    'Cold': { label: 'ליד קר', class: 'bg-sky-50 text-sky-700 border-sky-200' },
};

// Pipeline stage order for sorting statuses logically
const STATUS_ORDER: Record<string, number> = {
    'New': 0, 'Processing': 1, 'Manual': 2, 'Talking': 3, 'Quote_Sent': 4,
    'Distributed': 5, 'Assigned': 6, 'Waiting_Payment': 7, 'Closed': 8,
    'Lost': 9, 'Referred': 10, 'Completed': 11, 'Cold': 12,
};

const OWNER_COLORS: Record<string, string> = {
    'אילן': 'bg-blue-100 text-blue-700',
    'קובי': 'bg-purple-100 text-purple-700',
};

const BOUZOUKI_STATUS_LIST = ['New', 'Processing', 'Distributed', 'Assigned', 'Closed', 'Lost', 'Referred', 'Cold', 'Completed'];
const MANUAL_STATUS_LIST = ['New', 'Manual', 'Talking', 'Quote_Sent', 'Waiting_Payment', 'Closed', 'Lost', 'Referred', 'Cold', 'Completed'];

export default function LeadsDashboard({ leads, onSelectLead, onMenuClick, currentUser, onRefresh, onNavigateToTasks, unreadStatus = {}, onOpenDetails }: LeadsDashboardProps) {
    const { error, success, confirm } = useToast();
    const [showAddModal, setShowAddModal] = useState(false);
    const [showClosed, setShowClosed] = useState(false);
    const [showLost, setShowLost] = useState(false);
    const [showWaitingPayment, setShowWaitingPayment] = useState(false);
    const [showCompleted, setShowCompleted] = useState(false);
    const [showReferred, setShowReferred] = useState(true);
    const [showCold, setShowCold] = useState(true);

    const [commissionModalOpen, setCommissionModalOpen] = useState(false);
    const [collectLead, setCollectLead] = useState<Lead | null>(null);
    const [collectOwner, setCollectOwner] = useState<string>(currentUser?.displayName || 'אילן');
    const [collectAmount, setCollectAmount] = useState<string>('');

    const [tasks, setTasks] = useState<Task[]>([]);
    const [taskPrompt, setTaskPrompt] = useState<{
        leadId: string;
        newStatus: string;
        taskCount: number;
    } | null>(null);

    // ─── Search & Filter State ──────────────────────────
    const [searchQuery, setSearchQuery] = useState('');
    const [filterService, setFilterService] = useState<string>('');
    const [filterOwner, setFilterOwner] = useState<string>('');
    const [filterStatus, setFilterStatus] = useState<string>('');
    const [showFilters, setShowFilters] = useState(false);
    const [sortBy, setSortBy] = useState<'interaction' | 'created'>('interaction');
    const [dateSortOrder, setDateSortOrder] = useState<'asc' | 'desc' | null>(null);
    const [statusSortOrder, setStatusSortOrder] = useState<'asc' | 'desc' | null>(null);
    const [serviceSortOrder, setServiceSortOrder] = useState<'asc' | 'desc' | null>(null);

    // Referred leads sort state
    const [referredDateSort, setReferredDateSort] = useState<'asc' | 'desc' | null>(null);
    const [referredStatusSort, setReferredStatusSort] = useState<'asc' | 'desc' | null>(null);
    const [referredLocationSort, setReferredLocationSort] = useState<'asc' | 'desc' | null>(null);

    // Toggle a column sort and clear the others so only one is active at a time
    const toggleColumnSort = (column: 'date' | 'status' | 'service') => {
        const cycle = (prev: 'asc' | 'desc' | null) => prev === null ? 'asc' : prev === 'asc' ? 'desc' : null;
        if (column === 'date') {
            setDateSortOrder(cycle);
            setStatusSortOrder(null);
            setServiceSortOrder(null);
        } else if (column === 'status') {
            setStatusSortOrder(cycle);
            setDateSortOrder(null);
            setServiceSortOrder(null);
        } else {
            setServiceSortOrder(cycle);
            setDateSortOrder(null);
            setStatusSortOrder(null);
        }
    };

    const COMMISSION_STATUS_ORDER: Record<string, number> = {
        'ממתין לאישור': 0, 'ממתין': 0, 'ממתין לגבייה': 1, 'נגבה': 2, 'בוטל': 3,
    };

    const toggleReferredSort = (column: 'date' | 'status' | 'location') => {
        const cycle = (prev: 'asc' | 'desc' | null) => prev === null ? 'asc' : prev === 'asc' ? 'desc' : null;
        if (column === 'date') {
            setReferredDateSort(cycle);
            setReferredStatusSort(null);
            setReferredLocationSort(null);
        } else if (column === 'status') {
            setReferredStatusSort(cycle);
            setReferredDateSort(null);
            setReferredLocationSort(null);
        } else {
            setReferredLocationSort(cycle);
            setReferredDateSort(null);
            setReferredStatusSort(null);
        }
    };

    useEffect(() => {
        api.getTasks().then(setTasks).catch(console.error);
    }, []);

    const handleStatusUpdate = async (leadId: string, newStatus: string) => {
        try {
            // When setting to Lost, check for linked incomplete tasks and prompt user
            if (newStatus === 'Lost') {
                const linkedTasks = tasks.filter(t => t.fields.Lead_ID === leadId && !t.fields.Is_Completed);
                if (linkedTasks.length > 0) {
                    setTaskPrompt({ leadId, newStatus, taskCount: linkedTasks.length });
                    return; // Stop here, modal will continue the process
                }
            }

            await executeStatusUpdate(leadId, newStatus);
        } catch (e) {
            console.error(e);
            error('שגיאה בעדכון הסטטוס');
        }
    };

    const executeStatusUpdate = async (leadId: string, newStatus: string) => {
        await api.updateLead(leadId, { Status: newStatus });
        onRefresh?.();
    };

    const handleTaskAction = async (action: 'complete' | 'delete' | 'ignore') => {
        if (!taskPrompt) return;
        const { leadId, newStatus } = taskPrompt;
        setTaskPrompt(null);

        try {
            if (action === 'complete') {
                await api.handleLeadTasks(leadId, 'complete');
                setTasks(tasks.map(t => t.fields.Lead_ID === leadId ? { ...t, fields: { ...t.fields, Is_Completed: true } } : t));
            } else if (action === 'delete') {
                await api.handleLeadTasks(leadId, 'delete');
                setTasks(tasks.filter(t => t.fields.Lead_ID !== leadId || t.fields.Is_Completed));
            }
            await executeStatusUpdate(leadId, newStatus);
        } catch (e) {
            console.error(e);
            error('שגיאה בעדכון המשימות או הסטטוס');
        }
    };

    const handleCommissionUpdate = async (leadId: string, amount: string) => {
        try {
            await api.updateLead(leadId, { Commission_Amount: parseFloat(amount) || 0 });
            onRefresh?.();
        } catch (e) {
            console.error(e);
            error('שגיאה בעדכון סכום העמלה');
        }
    };

    const handleReferredToUpdate = async (leadId: string, to: string) => {
        try {
            await api.updateLead(leadId, { Referred_To: to });
            onRefresh?.();
        } catch (e) {
            console.error(e);
            error('שגיאה בעדכון היעד');
        }
    };

    const handleCollectCommission = async () => {
        if (!collectLead) return;
        try {
            const vatText = collectLead.fields.Commission_Includes_VAT ? ' (כולל מע"מ)' : ' (+ מע"מ)';
            // Create finance entry
            await api.createFinanceEntry({
                Owner: collectOwner,
                Type: 'income',
                Date: new Date().toISOString().split('T')[0],
                Description: `עמלת הפניה - ${collectLead.fields.Name || 'לקוח'}${vatText}`,
                Event_Name: `עמלת הפניה - ${collectLead.fields.Name || 'לקוח'}${vatText}`,
                Amount: parseFloat(collectAmount) || 0,
                Payment_Status: 'שולם',
                Payment_Method: 'חשבון',
                Lead_ID: collectLead.id
            });
            // Update lead status
            await api.updateLead(collectLead.id, { 
                Status: 'Completed', 
                Commission_Status: 'נגבה'
            });
            setCommissionModalOpen(false);
            setCollectLead(null);
            onRefresh?.();
            success('העמלה נרשמה בהצלחה!');
        } catch (e) {
            console.error(e);
            error('שגיאה ביצירת פעולה כספית');
        }
    };

    // Sync detailLead with updated data from props when leads list changes
    // Replaced synchronous setState effect with useMemo derived state

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
    }, [leads, searchQuery, filterService, filterOwner, filterStatus, currentUser]);

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
        processing: leads.filter(l => ['Processing', 'Manual', 'Talking', 'Quote_Sent'].includes(l.fields.Status)).length,
        assigned: leads.filter(l => ['Assigned', 'Closed', 'Waiting_Payment'].includes(l.fields.Status)).length,
    };

    const activeLeads = useMemo(() => {
        const active = filteredLeads.filter(l => !['Closed', 'Lost', 'Waiting_Payment', 'Completed', 'Referred', 'Cold'].includes(l.fields.Status));
        
        // Column sort: only one can be active at a time
        if (dateSortOrder) {
            return active.sort((a, b) => {
                const dateA = parseDateToSortable(a.fields.Event_Date);
                const dateB = parseDateToSortable(b.fields.Event_Date);
                if (!dateA && !dateB) return 0;
                if (!dateA) return 1;
                if (!dateB) return -1;
                const cmp = dateA.localeCompare(dateB);
                return dateSortOrder === 'asc' ? cmp : -cmp;
            });
        }
        
        if (statusSortOrder) {
            return active.sort((a, b) => {
                const orderA = STATUS_ORDER[a.fields.Status] ?? 99;
                const orderB = STATUS_ORDER[b.fields.Status] ?? 99;
                return statusSortOrder === 'asc' ? orderA - orderB : orderB - orderA;
            });
        }
        
        if (serviceSortOrder) {
            return active.sort((a, b) => {
                const svcA = (a.fields.Service || '').toLowerCase();
                const svcB = (b.fields.Service || '').toLowerCase();
                if (!svcA && !svcB) return 0;
                if (!svcA) return 1;
                if (!svcB) return -1;
                const cmp = svcA.localeCompare(svcB);
                return serviceSortOrder === 'asc' ? cmp : -cmp;
            });
        }
        
        if (sortBy === 'created') {
            return active.sort((a, b) => new Date(b.createdTime || 0).getTime() - new Date(a.createdTime || 0).getTime());
        }
        return active.sort((a, b) => new Date(b.fields.Last_Interaction || 0).getTime() - new Date(a.fields.Last_Interaction || 0).getTime());
    }, [filteredLeads, sortBy, dateSortOrder, statusSortOrder, serviceSortOrder]);

    const closedLeads = filteredLeads.filter(l => l.fields.Status === 'Closed');
    const lostLeads = filteredLeads.filter(l => l.fields.Status === 'Lost');
    const waitingPaymentLeads = filteredLeads.filter(l => l.fields.Status === 'Waiting_Payment');
    const completedLeads = filteredLeads.filter(l => l.fields.Status === 'Completed');
    const coldLeads = filteredLeads.filter(l => l.fields.Status === 'Cold');
    const referredLeads = useMemo(() => {
        const items = filteredLeads.filter(l => l.fields.Status === 'Referred');

        if (referredDateSort) {
            return [...items].sort((a, b) => {
                const dateA = parseDateToSortable(a.fields.Event_Date);
                const dateB = parseDateToSortable(b.fields.Event_Date);
                if (!dateA && !dateB) return 0;
                if (!dateA) return 1;
                if (!dateB) return -1;
                const cmp = dateA.localeCompare(dateB);
                return referredDateSort === 'asc' ? cmp : -cmp;
            });
        }

        if (referredStatusSort) {
            return [...items].sort((a, b) => {
                const sA = (!a.fields.Commission_Status || (a.fields.Commission_Status as string) === 'ממתין') ? 'ממתין לאישור' : a.fields.Commission_Status;
                const sB = (!b.fields.Commission_Status || (b.fields.Commission_Status as string) === 'ממתין') ? 'ממתין לאישור' : b.fields.Commission_Status;
                const orderA = COMMISSION_STATUS_ORDER[sA] ?? 99;
                const orderB = COMMISSION_STATUS_ORDER[sB] ?? 99;
                return referredStatusSort === 'asc' ? orderA - orderB : orderB - orderA;
            });
        }

        if (referredLocationSort) {
            return [...items].sort((a, b) => {
                const locA = (a.fields.Location || '').trim();
                const locB = (b.fields.Location || '').trim();
                if (!locA && !locB) return 0;
                if (!locA) return 1;
                if (!locB) return -1;
                const cmp = locA.localeCompare(locB, 'he');
                return referredLocationSort === 'asc' ? cmp : -cmp;
            });
        }

        return items;
    }, [filteredLeads, referredDateSort, referredStatusSort, referredLocationSort]);

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
                                        <div className="flex items-center gap-1.5">
                                            <button 
                                                onClick={() => onOpenDetails?.(lead.id)}
                                                className="font-bold text-slate-600 text-right hover:text-blue-600 transition-colors"
                                            >
                                                {lead.fields.Name || 'ללא שם'}
                                            </button>
                                            {lead.fields.Referred_To && (
                                                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-teal-50 text-teal-600 border border-teal-200 font-bold shrink-0" title={`הופנה ל: ${lead.fields.Referred_To}`}>
                                                    🤝 הפניה
                                                </span>
                                            )}
                                        </div>
                                        <span className="text-[10px] text-slate-400">{toDisplayPhone(lead.fields.Phone)}</span>
                                    </div>
                                    <div className="w-32 hidden md:flex items-center text-slate-500">
                                        {lead.fields.Service || '—'}
                                    </div>
                                    <div className="w-32 hidden md:flex items-center text-slate-500">
                                        {lead.fields.Closing_Amount ? `₪${lead.fields.Closing_Amount.toLocaleString()}` : (lead.fields.Lost_Reason || '—')}
                                    </div>
                                    <div className="w-12 flex justify-center">
                                        <button onClick={() => onOpenDetails?.(lead.id)} className="text-slate-400 hover:text-blue-600 transition-colors" title="פרטים">
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

    const renderReferredTable = (items: Lead[]) => {
        if (items.length === 0) return null;

        const getCommissionBadge = (status: string | undefined) => {
            // Handle legacy 'ממתין' as 'ממתין לאישור'
            const s = (!status || (status as string) === 'ממתין') ? 'ממתין לאישור' : status;
            switch (s) {
                case 'ממתין לאישור':
                    return { label: 'ממתין לאישור', class: 'bg-amber-50 text-amber-700 border-amber-200' };
                case 'ממתין לגבייה':
                    return { label: 'ממתין לגבייה', class: 'bg-blue-50 text-blue-700 border-blue-200' };
                case 'נגבה':
                    return { label: 'נגבה', class: 'bg-green-50 text-green-700 border-green-200' };
                case 'בוטל':
                    return { label: 'בוטל', class: 'bg-red-50 text-red-700 border-red-200' };
                default:
                    return { label: s, class: 'bg-slate-50 text-slate-600 border-slate-200' };
            }
        };

        const getEffectiveStatus = (status: string | undefined) =>
            (!status || (status as string) === 'ממתין') ? 'ממתין לאישור' : status;

        return (
            <div className="mt-4">
                <button
                    onClick={() => setShowReferred(!showReferred)}
                    className="w-full flex items-center justify-between px-5 py-3 bg-white rounded-2xl border border-slate-200 shadow-sm hover:bg-slate-50 transition-colors"
                >
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-600">🤝 לידים שהופנו</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-teal-100 text-teal-700">{items.length}</span>
                    </div>
                    <ChevronDown size={18} className={clsx("text-slate-400 transition-transform", showReferred && "rotate-180")} />
                </button>
                {showReferred && (
                    <div className="mt-2 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                        <div className="overflow-x-auto">
                            <div className="flex flex-col min-w-full md:min-w-[800px]">
                                {/* Header Row */}
                                <div className="flex items-center px-4 py-2 text-[10px] font-bold text-slate-400 border-b border-slate-100 uppercase bg-slate-50">
                                    <div className="flex-1 min-w-[120px]">לקוח</div>
                                    <div className="w-24 hidden md:block">
                                        <button
                                            onClick={() => toggleReferredSort('date')}
                                            className="flex items-center gap-1 hover:text-blue-600 transition-colors cursor-pointer select-none"
                                            title="מיין לפי תאריך"
                                        >
                                            תאריך
                                            {referredDateSort === 'asc' ? <ChevronUp size={12} className="text-blue-500" /> : 
                                             referredDateSort === 'desc' ? <ChevronDown size={12} className="text-blue-500" /> : 
                                             <ChevronsUpDown size={12} className="text-slate-300" />}
                                        </button>
                                    </div>
                                    <div className="w-24 hidden md:block">
                                        <button
                                            onClick={() => toggleReferredSort('location')}
                                            className="flex items-center gap-1 hover:text-blue-600 transition-colors cursor-pointer select-none"
                                            title="מיין לפי מיקום"
                                        >
                                            מיקום
                                            {referredLocationSort === 'asc' ? <ChevronUp size={12} className="text-blue-500" /> : 
                                             referredLocationSort === 'desc' ? <ChevronDown size={12} className="text-blue-500" /> : 
                                             <ChevronsUpDown size={12} className="text-slate-300" />}
                                        </button>
                                    </div>
                                    <div className="w-28 hidden md:block">הופנה ל...</div>
                                    <div className="w-32">עמלה</div>
                                    <div className="w-28 text-center">
                                        <button
                                            onClick={() => toggleReferredSort('status')}
                                            className="flex items-center gap-1 hover:text-blue-600 transition-colors cursor-pointer select-none w-full justify-center"
                                            title="מיין לפי מצב"
                                        >
                                            מצב
                                            {referredStatusSort === 'asc' ? <ChevronUp size={12} className="text-blue-500" /> : 
                                             referredStatusSort === 'desc' ? <ChevronDown size={12} className="text-blue-500" /> : 
                                             <ChevronsUpDown size={12} className="text-slate-300" />}
                                        </button>
                                    </div>
                                    <div className="w-28 text-center">פעולות</div>
                                </div>
                                {/* Rows */}
                                {items.map(lead => {
                                    const effectiveStatus = getEffectiveStatus(lead.fields.Commission_Status);
                                    const badge = getCommissionBadge(lead.fields.Commission_Status);

                                    return (
                                    <div key={lead.id} className="flex items-center px-4 py-2 text-xs border-b border-slate-50 hover:bg-slate-50 transition-colors bg-white">
                                        <div className="flex-1 min-w-[120px] flex flex-col justify-center">
                                            <button 
                                                onClick={() => onOpenDetails?.(lead.id)}
                                                className="font-bold text-slate-600 text-right hover:text-blue-600 transition-colors"
                                            >
                                                {lead.fields.Name || 'ללא שם'}
                                            </button>
                                            <span className="text-[10px] text-slate-400">{toDisplayPhone(lead.fields.Phone)}</span>
                                        </div>
                                        <div className="w-24 hidden md:flex items-center text-slate-500 font-medium">
                                            {lead.fields.Event_Date ? normalizeEventDate(lead.fields.Event_Date) : <span className="text-slate-300">—</span>}
                                        </div>
                                        <div className="w-24 hidden md:flex items-center text-slate-500">
                                            {lead.fields.Location ? (
                                                <span className="truncate" title={lead.fields.Location}>{lead.fields.Location}</span>
                                            ) : <span className="text-slate-300">—</span>}
                                        </div>
                                        <div className="w-28 hidden md:flex items-center text-slate-500">
                                            {lead.fields.Referred_To || <span className="text-slate-300">—</span>}
                                        </div>
                                        <div className="w-32 flex items-center font-medium text-slate-600 gap-1">
                                            {lead.fields.Commission_Amount ? `₪${lead.fields.Commission_Amount.toLocaleString()}` : <span className="text-slate-300">—</span>}
                                            {lead.fields.Commission_Amount && (
                                                <span className="text-[9px] text-slate-400 font-normal">
                                                    {lead.fields.Commission_Includes_VAT ? '(כולל)' : '(לא כולל)'}
                                                </span>
                                            )}
                                        </div>

                                        <div className="w-28 flex justify-center">
                                            <span className={clsx(
                                                "px-2 py-0.5 rounded-full text-[10px] font-bold border",
                                                badge.class
                                            )}>
                                                {badge.label}
                                            </span>
                                        </div>
                                        <div className="w-28 flex justify-center gap-1">
                                            {/* ממתין לאישור: show "confirm closed" + "cancel" */}
                                            {effectiveStatus === 'ממתין לאישור' && (
                                                <>
                                                    <button 
                                                        onClick={async () => {
                                                            await api.updateLead(lead.id, { Commission_Status: 'ממתין לגבייה' });
                                                            onRefresh?.();
                                                        }}
                                                        className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 p-1 rounded transition-colors text-[10px] font-bold flex items-center gap-0.5" 
                                                        title="אשר שהעסקה נסגרה — מחכה לגביית עמלה"
                                                    >
                                                        ✅ נסגר
                                                    </button>
                                                    <button 
                                                        onClick={async () => {
                                                            const isConfirmed = await confirm({
                                                                title: 'ביטול הפניה',
                                                                message: 'לבטל את ההפניה ולהעביר לאבוד?',
                                                                variant: 'danger',
                                                                confirmLabel: 'בטל'
                                                            });
                                                            if (isConfirmed) {
                                                                await api.updateLead(lead.id, { Commission_Status: 'בוטל' });
                                                                await handleStatusUpdate(lead.id, 'Lost');
                                                            }
                                                        }}
                                                        className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1 rounded transition-colors" 
                                                        title="בטל הפניה"
                                                    >
                                                        ❌
                                                    </button>
                                                </>
                                            )}
                                            {/* ממתין לגבייה: show "collect" + "cancel" */}
                                            {effectiveStatus === 'ממתין לגבייה' && (
                                                <>
                                                    <button 
                                                        onClick={() => {
                                                            let amt = lead.fields.Commission_Amount || 0;
                                                            if (lead.fields.Commission_Includes_VAT) {
                                                                amt = amt / 1.18; // Subtract 18% VAT
                                                            }
                                                            setCollectAmount(Math.round(amt).toString());
                                                            setCollectLead(lead); 
                                                            setCommissionModalOpen(true); 
                                                        }}
                                                        className="text-green-600 hover:text-green-700 hover:bg-green-50 p-1 rounded transition-colors" 
                                                        title="סמן כנגבה וצור פעולה כספית"
                                                    >
                                                        💰
                                                    </button>
                                                    <button 
                                                        onClick={async () => {
                                                            const isConfirmed = await confirm({
                                                                title: 'ביטול עמלה',
                                                                message: 'לבטל את העמלה ולהעביר לאבוד?',
                                                                variant: 'danger',
                                                                confirmLabel: 'בטל'
                                                            });
                                                            if (isConfirmed) {
                                                                await api.updateLead(lead.id, { Commission_Status: 'בוטל' });
                                                                await handleStatusUpdate(lead.id, 'Lost');
                                                            }
                                                        }}
                                                        className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1 rounded transition-colors" 
                                                        title="בטל הפניה"
                                                    >
                                                        ❌
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    };


    return (
        <div className="flex-1 overflow-y-auto bg-slate-50 p-4 md:p-8" dir="rtl">
            <TaskActionModal
                isOpen={taskPrompt !== null}
                taskCount={taskPrompt?.taskCount || 0}
                onClose={() => setTaskPrompt(null)}
                onAction={handleTaskAction}
            />
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

                            <select
                                value={sortBy}
                                onChange={e => setSortBy(e.target.value as 'interaction' | 'created')}
                                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-100"
                            >
                                <option value="interaction">מיון לפי: אינטראקציה אחרונה</option>
                                <option value="created">מיון לפי: תאריך יצירה</option>
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
                            <div className="w-20 md:w-24 shrink-0">
                                <button
                                    onClick={() => toggleColumnSort('status')}
                                    className="flex items-center gap-1 hover:text-blue-600 transition-colors cursor-pointer select-none"
                                    title="מיין לפי סטטוס"
                                >
                                    סטטוס
                                    {statusSortOrder === 'asc' ? <ChevronUp size={12} className="text-blue-500" /> : 
                                     statusSortOrder === 'desc' ? <ChevronDown size={12} className="text-blue-500" /> : 
                                     <ChevronsUpDown size={12} className="text-slate-300" />}
                                </button>
                            </div>
                            <div className="w-16 shrink-0 hidden md:block">מוביל</div>
                            <div className="w-28 shrink-0 hidden md:block">
                                <button
                                    onClick={() => toggleColumnSort('service')}
                                    className="flex items-center gap-1 hover:text-blue-600 transition-colors cursor-pointer select-none"
                                    title="מיין לפי שירות"
                                >
                                    שירות
                                    {serviceSortOrder === 'asc' ? <ChevronUp size={12} className="text-blue-500" /> : 
                                     serviceSortOrder === 'desc' ? <ChevronDown size={12} className="text-blue-500" /> : 
                                     <ChevronsUpDown size={12} className="text-slate-300" />}
                                </button>
                            </div>
                            <div className="w-24 shrink-0 hidden md:block">
                                <button
                                    onClick={() => toggleColumnSort('date')}
                                    className="flex items-center gap-1 hover:text-blue-600 transition-colors cursor-pointer select-none"
                                    title="מיין לפי תאריך"
                                >
                                    תאריך
                                    {dateSortOrder === 'asc' ? <ChevronUp size={12} className="text-blue-500" /> : 
                                     dateSortOrder === 'desc' ? <ChevronDown size={12} className="text-blue-500" /> : 
                                     <ChevronsUpDown size={12} className="text-slate-300" />}
                                </button>
                            </div>
                            <div className="w-24 shrink-0 hidden lg:block">מיקום</div>
                            <div className="w-24 md:w-28 shrink-0 flex justify-end">פעולות</div>
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
                                        <div className="flex items-center gap-1.5 mb-0.5 overflow-hidden">
                                            <button 
                                                onClick={() => onOpenDetails?.(lead.id)}
                                                className="font-bold text-slate-800 truncate text-right hover:text-blue-600 transition-colors cursor-pointer"
                                                title="לחץ לפתיחת פרטי הליד"
                                            >
                                                {lead.fields.Name || 'ללא שם'}
                                            </button>
                                            {unreadStatus?.[lead.id]?.count > 0 && (
                                                <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 text-[8px] font-bold text-white shadow-sm ring-1 ring-white shrink-0">
                                                    {unreadStatus[lead.id].count}
                                                </span>
                                            )}
                                        </div>
                                        <span className="text-[10px] text-slate-400 truncate">{toDisplayPhone(lead.fields.Phone)}</span>
                                    </div>
                                    <div className="w-20 md:w-24 shrink-0 flex items-center">
                                        <select
                                            value={lead.fields.Status}
                                            onChange={(e) => handleStatusUpdate(lead.id, e.target.value)}
                                            onClick={(e) => e.stopPropagation()}
                                            className={clsx(
                                                "appearance-none inline-flex items-center px-1.5 md:px-2 py-0.5 rounded-full text-[9px] md:text-[10px] font-bold border cursor-pointer hover:shadow-sm transition-all focus:outline-none focus:ring-1 focus:ring-blue-400",
                                                statusInfo.class
                                            )}
                                            style={{ textAlignLast: 'center' }}
                                        >
                                            {(lead.fields.Service === 'Bouzouki' ? BOUZOUKI_STATUS_LIST : MANUAL_STATUS_LIST).map(s => (
                                                <option key={s} value={s} className="bg-white text-slate-800">
                                                    {STATUS_MAP[s]?.label || s}
                                                </option>
                                            ))}
                                        </select>
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
                                        {lead.fields.Event_Date ? normalizeEventDate(lead.fields.Event_Date) : <span className="text-slate-300">—</span>}
                                    </div>
                                    <div className="w-24 shrink-0 hidden lg:flex items-center text-slate-500 pr-1">
                                        {lead.fields.Location ? (
                                            <span className="truncate" title={lead.fields.Location}>{lead.fields.Location}</span>
                                        ) : <span className="text-slate-300">—</span>}
                                    </div>
                                    <div className="w-24 md:w-28 shrink-0 flex items-center justify-end gap-1 md:gap-1.5">
                                        <button
                                            onClick={() => onOpenDetails?.(lead.id)}
                                            className="text-slate-400 hover:text-blue-600 transition-colors p-1"
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
                                            <span className="hidden sm:inline">צ&apos;אט</span> <ArrowRight size={11} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })
                        )}
                        </div>
                    </div>
                </div>
                {/* Referred Leads */}
                {renderReferredTable(referredLeads)}

                {/* Cold Leads */}
                {renderArchiveTable(
                    coldLeads, showCold, () => setShowCold(!showCold),
                    'לידים קרים', '🥶', 'bg-sky-100 text-sky-700'
                )}

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

                {/* Completed Leads (Archive) */}
                {renderArchiveTable(
                    completedLeads, showCompleted, () => setShowCompleted(!showCompleted),
                    'הושלמו (ארכיון)', '🏆', 'bg-slate-200 text-slate-600'
                )}
            </div>

            {/* Modals */}
            <AddLeadModal
                isOpen={showAddModal}
                onClose={() => setShowAddModal(false)}
                onCreated={() => onRefresh?.()}
                currentUserName={currentUser?.displayName}
            />

            {/* Commission Modal */}
            {commissionModalOpen && collectLead && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4" dir="rtl">
                    <div className="bg-white rounded-2xl p-6 shadow-xl w-full max-w-sm">
                        <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                            <span className="text-2xl">💰</span>
                            גביית עמלת הפניה
                        </h3>
                        
                        <div className="space-y-4 mb-6">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">לקוח</label>
                                <div className="p-2 bg-slate-50 rounded-lg text-sm text-slate-700">{collectLead.fields.Name || 'ללא שם'}</div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">סכום לגבייה (₪)</label>
                                <input
                                    type="number"
                                    value={collectAmount}
                                    onChange={(e) => setCollectAmount(e.target.value)}
                                    className="w-full p-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500 transition-colors"
                                    dir="ltr"
                                />
                                <p className="text-[10px] text-slate-400 mt-1">
                                    הסכום המוצע הוא ללא מע"מ. ניתן לערוך.
                                </p>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-2">לזכות את:</label>
                                <select 
                                    value={collectOwner}
                                    onChange={(e) => setCollectOwner(e.target.value)}
                                    className="w-full p-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500 transition-colors"
                                >
                                    <option value="אילן">אילן</option>
                                    <option value="קובי">קובי</option>
                                    <option value="עסק">עסק (כללי)</option>
                                </select>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <button 
                                onClick={handleCollectCommission}
                                className="flex-1 bg-green-500 hover:bg-green-600 text-white font-bold py-2 rounded-xl transition-colors"
                            >
                                אישור וסיום
                            </button>
                            <button 
                                onClick={() => { setCommissionModalOpen(false); setCollectLead(null); }}
                                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-2 rounded-xl transition-colors"
                            >
                                ביטול
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

