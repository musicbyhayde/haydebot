'use client';

import { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Edit, Check, X, TrendingUp, TrendingDown, Menu, AlertCircle, Link, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { FinanceEntry, Lead } from '@/types';
import { AppUser } from '@/lib/auth';
import clsx from 'clsx';

interface FinancePageProps {
    currentUser: AppUser | null;
    onMenuClick?: () => void;
}

const PAYMENT_STATUSES = ['תשלום', 'לא שולם', 'חלקי'];

interface FormErrors {
    Description?: string;
    Amount?: string;
    Date?: string;
}

export default function FinancePage({ currentUser, onMenuClick }: FinancePageProps) {
    const [entries, setEntries] = useState<FinanceEntry[]>([]);
    const [leads, setLeads] = useState<Lead[]>([]);
    const [summary, setSummary] = useState<Record<string, { income: number; expenses: number; balance: number; cash_balance: number; bank_balance: number }>>({});
    const [loading, setLoading] = useState(true);
    const [showAddForm, setShowAddForm] = useState(false);
    const [activeTab, setActiveTab] = useState<'אילן' | 'קובי'>('אילן');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<any>({});
    const [errors, setErrors] = useState<FormErrors>({});
    const [submitAttempted, setSubmitAttempted] = useState(false);
    const [leadSearch, setLeadSearch] = useState('');
    const [showLeadDropdown, setShowLeadDropdown] = useState(false);
    const leadDropdownRef = useRef<HTMLDivElement>(null);

    // Sorting and Grouping State
    const [sortBy, setSortBy] = useState<'date' | 'type'>('date');
    const [groupBy, setGroupBy] = useState<'none' | 'event'>('none');

    const [form, setForm] = useState({
        Type: 'income',
        Date: new Date().toISOString().split('T')[0],
        Description: '',
        Musician: '',
        Amount: '',
        Payment_Status: 'לא שולם',
        Payment_Method: 'חשבון',
        Lead_ID: '',
    });

    useEffect(() => {
        fetchData();
    }, []);

    useEffect(() => {
        if (currentUser?.displayName === 'קובי') setActiveTab('קובי');
    }, [currentUser]);

    const fetchData = async () => {
        try {
            const [entriesData, summaryData, leadsData] = await Promise.all([
                api.getFinanceEntries(),
                api.getFinanceSummary(),
                api.getLeads(),
            ]);
            setEntries(entriesData);
            setSummary(summaryData);
            setLeads(leadsData);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    // --- Validation ---
    const validateForm = (data: typeof form): FormErrors => {
        const errs: FormErrors = {};
        if (!data.Description.trim()) errs.Description = 'חובה להזין פירוט / שם אירוע';
        if (!data.Amount || isNaN(parseFloat(data.Amount)) || parseFloat(data.Amount) <= 0) errs.Amount = 'חובה להזין סכום חיובי';
        if (!data.Date) errs.Date = 'חובה לבחור תאריך';
        return errs;
    };

    const canAddForOwner = (owner: string): boolean => {
        if (!currentUser) return false;
        if (currentUser.role === 'admin') return true;
        return currentUser.displayName === owner;
    };

    const getAddOwner = (): string | null => {
        if (!currentUser) return null;
        if (currentUser.role === 'admin') return null;
        return currentUser.displayName;
    };

    // When a lead is selected, auto-fill description
    const handleLeadSelect = (leadId: string) => {
        setForm(prev => {
            const updated = { ...prev, Lead_ID: leadId };
            if (leadId) {
                const lead = leads.find(l => l.id === leadId);
                if (lead) {
                    const name = lead.fields.Name || lead.fields.Phone;
                    const service = lead.fields.Service ? ` - ${lead.fields.Service}` : '';
                    const date = lead.fields.Event_Date ? ` (${lead.fields.Event_Date})` : '';
                    updated.Description = `${name}${service}${date}`;
                }
            }
            return updated;
        });
    };

    // --- Add ---
    const handleAdd = async (owner: string) => {
        setSubmitAttempted(true);
        const validationErrors = validateForm(form);
        setErrors(validationErrors);
        if (Object.keys(validationErrors).length > 0) return;

        try {
            await api.createFinanceEntry({
                Owner: owner,
                Type: form.Type,
                Date: form.Date,
                Description: form.Description,
                Event_Name: form.Type === 'income' ? form.Description : undefined,
                Musician: form.Type === 'income' ? (form.Musician || undefined) : undefined,
                Amount: parseFloat(form.Amount),
                Payment_Status: form.Payment_Status,
                Payment_Method: form.Payment_Method,
                Lead_ID: form.Lead_ID || undefined,
            });
            setForm({ Type: 'income', Date: new Date().toISOString().split('T')[0], Description: '', Musician: '', Amount: '', Payment_Status: 'לא שולם', Payment_Method: 'חשבון', Lead_ID: '' });
            setShowAddForm(false);
            setSubmitAttempted(false);
            setErrors({});
            fetchData();
        } catch (e) {
            console.error(e);
        }
    };

    // --- Edit ---
    const startEdit = (entry: FinanceEntry) => {
        setEditingId(entry.id);
        setEditForm({
            Description: entry.fields.Event_Name || entry.fields.Description,
            Musician: entry.fields.Musician || '',
            Amount: String(entry.fields.Amount),
            Payment_Status: entry.fields.Payment_Status,
            Payment_Method: entry.fields.Payment_Method || 'חשבון',
            Date: entry.fields.Date,
        });
    };

    const saveEdit = async (id: string) => {
        try {
            await api.updateFinanceEntry(id, {
                Description: editForm.Description,
                Event_Name: editForm.Description,
                Musician: editForm.Musician || undefined,
                Amount: parseFloat(editForm.Amount),
                Payment_Status: editForm.Payment_Status,
                Payment_Method: editForm.Payment_Method,
                Date: editForm.Date,
            });
            setEditingId(null);
            fetchData();
        } catch (e) {
            console.error(e);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('האם למחוק את הרשומה?')) return;
        try {
            await api.deleteFinanceEntry(id);
            fetchData();
        } catch (e) {
            console.error(e);
        }
    };

    const canEdit = (entry: FinanceEntry) => {
        if (!currentUser) return false;
        if (currentUser.role === 'admin') return true;
        return entry.fields.Owner === currentUser.displayName;
    };

    const formatCurrency = (n: number) => {
        return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);
    };

    // Find linked lead name
    const getLinkedLeadName = (leadId?: string) => {
        if (!leadId) return null;
        const lead = leads.find(l => l.id === leadId);
        return lead ? (lead.fields.Name || lead.fields.Phone) : null;
    };

    const ownerEntries = (owner: string) => entries.filter(e => e.fields.Owner === owner);
    const incomeEntries = (owner: string) => ownerEntries(owner).filter(e => e.fields.Type === 'income');
    const expenseEntries = (owner: string) => ownerEntries(owner).filter(e => e.fields.Type === 'expense');

    const sortEntries = (list: FinanceEntry[]) => {
        return [...list].sort((a, b) => {
            if (sortBy === 'date') {
                return new Date(b.fields.Date || 0).getTime() - new Date(a.fields.Date || 0).getTime();
            } else {
                // type sorting: Income first, then Expense. Secondary sort by Date
                if (a.fields.Type !== b.fields.Type) return a.fields.Type === 'income' ? -1 : 1;
                return new Date(b.fields.Date || 0).getTime() - new Date(a.fields.Date || 0).getTime();
            }
        });
    };

    const FieldError = ({ error }: { error?: string }) => {
        if (!error || !submitAttempted) return null;
        return <p className="text-red-500 text-[10px] mt-0.5 flex items-center gap-0.5"><AlertCircle size={10} /> {error}</p>;
    };

    const renderRow = (e: FinanceEntry) => {
        const type = e.fields.Type;
        const isEditing = editingId === e.id;
        const editable = canEdit(e);
        const linkedLead = getLinkedLeadName(e.fields.Lead_ID);

        if (isEditing) {
            return (
                <tr key={e.id} className="bg-amber-50">
                    <td className="py-2 px-3"><input type="date" value={editForm.Date} onChange={(ev) => setEditForm({ ...editForm, Date: ev.target.value })} className="px-2 py-1 border border-slate-200 rounded-lg text-xs w-full bg-white" dir="ltr" /></td>
                    <td className="py-2 px-3"><input type="text" value={editForm.Description} onChange={(ev) => setEditForm({ ...editForm, Description: ev.target.value })} className="px-2 py-1 border border-slate-200 rounded-lg text-xs w-full bg-white" /></td>
                    {type === 'income' && <td className="py-2 px-3"><input type="text" value={editForm.Musician} onChange={(ev) => setEditForm({ ...editForm, Musician: ev.target.value })} className="px-2 py-1 border border-slate-200 rounded-lg text-xs w-full bg-white" /></td>}
                    <td className="py-2 px-3"><input type="number" value={editForm.Amount} onChange={(ev) => setEditForm({ ...editForm, Amount: ev.target.value })} className="px-2 py-1 border border-slate-200 rounded-lg text-xs w-20 bg-white" dir="ltr" /></td>
                    <td className="py-2 px-3">
                        <select value={editForm.Payment_Status} onChange={(ev) => setEditForm({ ...editForm, Payment_Status: ev.target.value })} className="px-2 py-1 border border-slate-200 rounded-lg text-xs bg-white mb-1">
                            {PAYMENT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <select value={editForm.Payment_Method} onChange={(ev) => setEditForm({ ...editForm, Payment_Method: ev.target.value })} className="px-2 py-1 border border-slate-200 rounded-lg text-[10px] bg-white text-slate-500">
                            <option value="חשבון">🏦 בנק</option>
                            <option value="מזומן">💵 מזומן</option>
                        </select>
                    </td>
                    <td className="py-2 px-3">
                        <div className="flex items-center gap-1">
                            <button onClick={() => saveEdit(e.id)} className="text-green-600 hover:text-green-800"><Check size={14} /></button>
                            <button onClick={() => setEditingId(null)} className="text-slate-400 hover:text-slate-600"><X size={14} /></button>
                        </div>
                    </td>
                </tr>
            );
        }

        return (
            <tr key={e.id} className="border-t border-slate-50 hover:bg-slate-50 transition-colors">
                <td className="py-2 px-3 text-xs text-slate-600">{e.fields.Date}</td>
                <td className="py-2 px-3">
                    <div className="flex flex-col">
                        <span className="text-xs font-medium text-slate-800">{e.fields.Event_Name || e.fields.Description}</span>
                        {linkedLead && (
                            <span className="text-[10px] text-blue-500 flex items-center gap-0.5 mt-0.5">
                                <Link size={9} /> {linkedLead}
                            </span>
                        )}
                    </div>
                </td>
                {type === 'income' && <td className="py-2 px-3 text-xs text-slate-600">{e.fields.Musician || '—'}</td>}
                <td className="py-2 px-3 text-xs font-bold text-left" dir="ltr">
                    <span className={type === 'income' ? 'text-green-700' : 'text-red-700'}>{formatCurrency(e.fields.Amount)}</span>
                </td>
                <td className="py-2 px-3">
                    <div className="flex flex-col gap-1 items-start">
                        <span className={clsx(
                            "text-[10px] px-2 py-0.5 rounded-full font-bold",
                            e.fields.Payment_Status === 'תשלום' ? 'bg-green-100 text-green-700' : e.fields.Payment_Status === 'חלקי' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                        )}>{e.fields.Payment_Status}</span>
                        <span className="text-[10px] text-slate-500 flex items-center gap-1 font-medium bg-slate-100 px-1.5 py-0.5 rounded-md">
                            {e.fields.Payment_Method === 'מזומן' ? '💵 מזומן' : '🏦 חשבון'}
                        </span>
                    </div>
                </td>
                <td className="py-2 px-3">
                    {editable && (
                        <div className="flex items-center gap-1.5">
                            <button onClick={() => startEdit(e)} className="text-slate-300 hover:text-blue-500 transition-colors" title="ערוך"><Edit size={13} /></button>
                            <button onClick={() => handleDelete(e.id)} className="text-slate-300 hover:text-red-500 transition-colors" title="מחק"><Trash2 size={13} /></button>
                        </div>
                    )}
                </td>
            </tr>
        );
    };

    const renderTable = (owner: string) => {
        const ownerSummary = summary[owner] || { income: 0, expenses: 0, balance: 0, cash_balance: 0, bank_balance: 0 };
        const rawEntries = ownerEntries(owner);
        const sortedEntries = sortEntries(rawEntries);

        let tableContent;

        if (groupBy === 'none') {
            tableContent = (
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-4">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-100 text-slate-700">
                                    <th className="py-2 px-3 text-right text-[11px] font-bold">תאריך</th>
                                    <th className="py-2 px-3 text-right text-[11px] font-bold">אירוע</th>
                                    <th className="py-2 px-3 text-right text-[11px] font-bold">נגן</th>
                                    <th className="py-2 px-3 text-left text-[11px] font-bold">סכום</th>
                                    <th className="py-2 px-3 text-right text-[11px] font-bold">סטטוס</th>
                                    <th className="py-2 px-3 w-16"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedEntries.length === 0 ? (
                                    <tr><td colSpan={6} className="text-center py-8 text-slate-400 text-sm">אין תנועות</td></tr>
                                ) : sortedEntries.map(e => renderRow(e))}
                            </tbody>
                        </table>
                    </div>
                </div>
            );
        } else {
            // Group by event
            const groups: Record<string, FinanceEntry[]> = {};
            sortedEntries.forEach(e => {
                const eventName = (e.fields.Event_Name || e.fields.Description || 'ללא שיוך').trim();
                if (!groups[eventName]) groups[eventName] = [];
                groups[eventName].push(e);
            });

            tableContent = (
                <div className="space-y-4 mb-4">
                    {Object.entries(groups).map(([eventName, groupEntries]) => {
                        const sum = groupEntries.reduce((acc, curr) => {
                            const val = curr.fields.Amount || 0;
                            return curr.fields.Type === 'income' ? acc + val : acc - val;
                        }, 0);
                        const isPositive = sum >= 0;

                        return (
                            <div key={eventName} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                                <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex justify-between items-center">
                                    <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                                        {eventName}
                                        <span className="text-[10px] text-slate-400 font-normal">({groupEntries.length} תנועות)</span>
                                    </h4>
                                    <div className={clsx("text-sm font-extrabold px-3 py-1 rounded-full", isPositive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700")} dir="ltr">
                                        {formatCurrency(sum)}
                                    </div>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="bg-white text-slate-500 border-b border-slate-100">
                                                <th className="py-2 px-3 text-right text-[11px] font-normal w-24">תאריך</th>
                                                <th className="py-2 px-3 text-right text-[11px] font-normal">תיאור</th>
                                                <th className="py-2 px-3 text-right text-[11px] font-normal w-32">נגן</th>
                                                <th className="py-2 px-3 text-left text-[11px] font-normal w-28">סכום</th>
                                                <th className="py-2 px-3 text-right text-[11px] font-normal w-28">סטטוס</th>
                                                <th className="py-2 px-3 w-16"></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {groupEntries.map(e => renderRow(e))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        );
                    })}
                </div>
            );
        }

        return (
            <div className="flex-1 min-w-0">
                <div className="grid grid-cols-3 gap-3 mb-6">
                    <div className="bg-green-50 border border-green-100 rounded-xl p-3 text-center">
                        <div className="text-[10px] font-bold text-green-600 uppercase">הכנסות</div>
                        <div className="text-lg font-extrabold text-green-700">{formatCurrency(ownerSummary.income)}</div>
                    </div>
                    <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-center">
                        <div className="text-[10px] font-bold text-red-600 uppercase">הוצאות</div>
                        <div className="text-lg font-extrabold text-red-700">{formatCurrency(ownerSummary.expenses)}</div>
                    </div>
                    <div className={clsx("border rounded-xl p-3 text-center shadow-sm", ownerSummary.balance >= 0 ? "bg-blue-50 border-blue-200" : "bg-orange-50 border-orange-200")}>
                        <div className="text-[10px] font-bold text-slate-600 uppercase">יתרה</div>
                        <div className={clsx("text-lg font-extrabold", ownerSummary.balance >= 0 ? "text-blue-700" : "text-orange-700")}>{formatCurrency(ownerSummary.balance)}</div>
                        <div className="flex justify-center gap-2 mt-2">
                            <span className="text-[10px] bg-white/80 px-2 py-0.5 rounded-md text-slate-700 border border-slate-200" title="יתרה בחשבון">🏦 {formatCurrency(ownerSummary.bank_balance || 0)}</span>
                            <span className="text-[10px] bg-white/80 px-2 py-0.5 rounded-md text-slate-700 border border-slate-200" title="יתרה במזומן">💵 {formatCurrency(ownerSummary.cash_balance || 0)}</span>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-between mb-4 bg-white p-2 border border-slate-200 rounded-xl gap-2 shadow-sm">
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                        <span className="text-xs font-bold text-slate-500 mr-2">מיון לפי:</span>
                        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as 'date' | 'type')} className="bg-slate-50 border border-slate-200 text-sm rounded-lg px-3 py-1.5 focus:ring-1 focus:ring-blue-500 min-w-[120px]">
                            <option value="date">📅 תאריך</option>
                            <option value="type">📈 עסקאות (הכנסה/הוצאה)</option>
                        </select>
                    </div>
                    <div className="flex items-center w-full sm:w-auto">
                        <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 w-full">
                            <button
                                onClick={() => setGroupBy('none')}
                                className={clsx("flex-1 text-xs px-4 py-1.5 rounded-md transition-all font-medium", groupBy === 'none' ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700")}
                            >
                                רשימה
                            </button>
                            <button
                                onClick={() => setGroupBy('event')}
                                className={clsx("flex-1 text-xs px-4 py-1.5 rounded-md transition-all font-medium", groupBy === 'event' ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700")}
                            >
                                לפי אירוע
                            </button>
                        </div>
                    </div>
                </div>

                {tableContent}
            </div>
        );
    };

    if (loading) {
        return <div className="flex-1 flex items-center justify-center text-slate-400 font-bold">טוען נתונים...</div>;
    }

    const isIncome = form.Type === 'income';
    const addOwner = getAddOwner();

    // Filter leads for the dropdown — show leads with events
    const linkableLeads = leads.filter(l => l.fields.Status !== 'Lost' && (l.fields.Name || l.fields.Service));
    const filteredLeads = linkableLeads.filter(l => {
        if (!leadSearch) return true;
        const q = leadSearch.toLowerCase();
        return (
            (l.fields.Name || '').toLowerCase().includes(q) ||
            (l.fields.Phone || '').includes(q) ||
            (l.fields.Service || '').toLowerCase().includes(q)
        );
    });

    const selectedLeadLabel = form.Lead_ID
        ? (() => {
            const l = leads.find(x => x.id === form.Lead_ID);
            return l ? `${l.fields.Name || l.fields.Phone}${l.fields.Service ? ` (${l.fields.Service})` : ''}` : '';
        })()
        : '';

    return (
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50" dir="rtl">
            {/* Header */}
            <div className="px-4 md:px-6 py-4 border-b border-slate-200 bg-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                    {onMenuClick && (
                        <button onClick={onMenuClick} className="md:hidden p-2 hover:bg-slate-100 rounded-lg">
                            <Menu size={20} />
                        </button>
                    )}
                    <div>
                        <h1 className="text-xl md:text-2xl font-extrabold text-slate-800">💰 ניהול כספים</h1>
                        <p className="text-xs text-slate-500">קופה רושמת — הייד מיוזיק</p>
                    </div>
                </div>
                {(canAddForOwner('אילן') || canAddForOwner('קובי')) && (
                    <button
                        onClick={() => { setShowAddForm(!showAddForm); setSubmitAttempted(false); setErrors({}); }}
                        className="flex items-center gap-1.5 px-4 py-2.5 bg-amber-500 text-white text-sm font-bold rounded-xl hover:bg-amber-600 transition-all shadow-md shadow-amber-200"
                    >
                        <Plus size={16} /> רשומה חדשה
                    </button>
                )}
            </div>

            {/* Add Form */}
            {showAddForm && (
                <div className="px-4 md:px-6 py-4 bg-amber-50 border-b border-amber-100">
                    {/* Row 1: Type + Date + Amount */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 mb-1">סוג תנועה *</label>
                            <select value={form.Type} onChange={(e) => setForm({ ...form, Type: e.target.value, Musician: '' })} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-all">
                                <option value="income">💰 הכנסה</option>
                                <option value="expense">💸 הוצאה</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 mb-1">תאריך *</label>
                            <input type="date" value={form.Date} onChange={(e) => setForm({ ...form, Date: e.target.value })} className={clsx("w-full px-3 py-2 border rounded-xl text-sm bg-white transition-all", errors.Date && submitAttempted ? 'border-red-300 ring-2 ring-red-100' : 'border-slate-200')} dir="ltr" />
                            <FieldError error={errors.Date} />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 mb-1">סכום (₪) *</label>
                            <input type="number" value={form.Amount} onChange={(e) => setForm({ ...form, Amount: e.target.value })} placeholder="0" className={clsx("w-full px-3 py-2 border rounded-xl text-sm bg-white transition-all", errors.Amount && submitAttempted ? 'border-red-300 ring-2 ring-red-100' : 'border-slate-200')} dir="ltr" />
                            <FieldError error={errors.Amount} />
                        </div>
                    </div>

                    {/* Row 2: Description + Lead link + Musician (income only) */}
                    <div className={clsx("grid gap-3 mb-3", isIncome ? "grid-cols-2 md:grid-cols-3" : "grid-cols-1 md:grid-cols-2")}>
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 mb-1">{isIncome ? 'שם אירוע / פירוט' : 'פירוט ההוצאה'} *</label>
                            <input
                                type="text"
                                value={form.Description}
                                onChange={(e) => setForm({ ...form, Description: e.target.value })}
                                placeholder={isIncome ? 'למשל: חתונה כהן 15.3' : 'למשל: קנייה של ציוד'}
                                className={clsx("w-full px-3 py-2 border rounded-xl text-sm bg-white transition-all", errors.Description && submitAttempted ? 'border-red-300 ring-2 ring-red-100' : 'border-slate-200')}
                            />
                            <FieldError error={errors.Description} />
                        </div>
                        <div className="relative" ref={leadDropdownRef}>
                            <label className="block text-[10px] font-bold text-slate-500 mb-1">
                                <Link size={9} className="inline ml-0.5" /> קישור לליד
                            </label>
                            <div
                                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white cursor-pointer flex items-center justify-between hover:border-slate-300 transition-colors"
                                onClick={() => setShowLeadDropdown(!showLeadDropdown)}
                            >
                                <span className={form.Lead_ID ? 'text-slate-800' : 'text-slate-400'}>
                                    {selectedLeadLabel || '— ללא קישור —'}
                                </span>
                                {form.Lead_ID && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleLeadSelect(''); setLeadSearch(''); }}
                                        className="text-slate-300 hover:text-red-500 mr-1"
                                    >
                                        <X size={14} />
                                    </button>
                                )}
                            </div>
                            {showLeadDropdown && (
                                <div className="absolute top-full right-0 left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-50 max-h-56 flex flex-col overflow-hidden">
                                    <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100">
                                        <Search size={14} className="text-slate-400" />
                                        <input
                                            type="text"
                                            value={leadSearch}
                                            onChange={(e) => setLeadSearch(e.target.value)}
                                            placeholder="חפש לפי שם, טלפון או שירות..."
                                            className="w-full text-sm focus:outline-none bg-transparent placeholder:text-slate-400"
                                            autoFocus
                                        />
                                    </div>
                                    <div className="overflow-y-auto flex-1">
                                        <button
                                            onClick={() => { handleLeadSelect(''); setShowLeadDropdown(false); setLeadSearch(''); }}
                                            className="w-full text-right px-3 py-2 text-sm text-slate-400 hover:bg-slate-50 transition-colors"
                                        >
                                            — ללא קישור —
                                        </button>
                                        {filteredLeads.map(l => (
                                            <button
                                                key={l.id}
                                                onClick={() => { handleLeadSelect(l.id); setShowLeadDropdown(false); setLeadSearch(''); }}
                                                className={clsx(
                                                    "w-full text-right px-3 py-2 text-sm hover:bg-blue-50 transition-colors flex flex-col",
                                                    form.Lead_ID === l.id && 'bg-blue-50'
                                                )}
                                            >
                                                <span className="font-medium text-slate-800">{l.fields.Name || l.fields.Phone}</span>
                                                <span className="text-[10px] text-slate-500">
                                                    {l.fields.Service || ''}{l.fields.Event_Date ? ` · ${l.fields.Event_Date}` : ''}{l.fields.Status ? ` · ${l.fields.Status}` : ''}
                                                </span>
                                            </button>
                                        ))}
                                        {filteredLeads.length === 0 && (
                                            <p className="text-center py-3 text-xs text-slate-400">לא נמצאו לידים</p>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                        {isIncome && (
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 mb-1">נגן</label>
                                <input type="text" value={form.Musician} onChange={(e) => setForm({ ...form, Musician: e.target.value })} placeholder="אופציונלי" className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white" />
                            </div>
                        )}
                    </div>

                    {/* Row 3: Payment status + Submit */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 mb-1">סטטוס תשלום</label>
                            <select value={form.Payment_Status} onChange={(e) => setForm({ ...form, Payment_Status: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white mb-2">
                                {PAYMENT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                            <label className="block text-[10px] font-bold text-slate-500 mb-1">אמצעי</label>
                            <select value={form.Payment_Method} onChange={(e) => setForm({ ...form, Payment_Method: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white">
                                <option value="חשבון">🏦 חשבון (בנק/אשראי/העברה)</option>
                                <option value="מזומן">💵 מזומן</option>
                            </select>
                        </div>
                        <div className="flex items-end gap-2">
                            {addOwner ? (
                                <button onClick={() => handleAdd(addOwner)} className="flex-1 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 transition-all shadow-md">
                                    הוסף ל-{addOwner}
                                </button>
                            ) : (
                                <>
                                    <button onClick={() => handleAdd('אילן')} className="flex-1 py-2.5 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-700 transition-all shadow-md">+ אילן</button>
                                    <button onClick={() => handleAdd('קובי')} className="flex-1 py-2.5 bg-purple-600 text-white text-xs font-bold rounded-xl hover:bg-purple-700 transition-all shadow-md">+ קובי</button>
                                </>
                            )}
                        </div>
                    </div>

                    {submitAttempted && Object.keys(errors).length > 0 && (
                        <div className="mt-3 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 flex items-center gap-2">
                            <AlertCircle size={14} className="text-red-500 flex-shrink-0" />
                            <p className="text-red-600 text-xs font-medium">יש שדות חובה שלא מולאו — בדוק את השדות המסומנים באדום</p>
                        </div>
                    )}
                </div>
            )}

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6">
                <div className="md:hidden flex mb-4 bg-white rounded-xl border border-slate-200 p-1">
                    {(['אילן', 'קובי'] as const).map(name => (
                        <button
                            key={name}
                            onClick={() => setActiveTab(name)}
                            className={clsx(
                                "flex-1 py-2 text-sm font-bold rounded-lg transition-all",
                                activeTab === name ? "bg-slate-900 text-white" : "text-slate-500"
                            )}
                        >{name}</button>
                    ))}
                </div>

                <div className="md:hidden">
                    {renderTable(activeTab)}
                </div>

                <div className="hidden md:flex gap-6">
                    <div className="flex-1">
                        <h3 className="text-lg font-extrabold text-blue-700 mb-3">📊 אילן</h3>
                        {renderTable('אילן')}
                    </div>
                    <div className="w-px bg-slate-200"></div>
                    <div className="flex-1">
                        <h3 className="text-lg font-extrabold text-purple-700 mb-3">📊 קובי</h3>
                        {renderTable('קובי')}
                    </div>
                </div>
            </div>
        </div>
    );
}
