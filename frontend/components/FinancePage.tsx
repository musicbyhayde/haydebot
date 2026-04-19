'use client';

import { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Edit, Check, X, TrendingUp, TrendingDown, Menu, AlertCircle, Link, Search, ArrowUp, ArrowDown } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { api } from '@/lib/api';
import { FinanceEntry, Lead, FinanceSummaryItem } from '@/types';
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

interface FinanceForm {
    Type: 'income' | 'expense';
    Date: string;
    Description: string;
    Musician: string;
    Amount: string;
    Payment_Status: string;
    Payment_Method: 'חשבון' | 'מזומן';
    Lead_ID: string;
    Owner: string;
}

export default function FinancePage({ currentUser, onMenuClick }: FinancePageProps) {
    const [entries, setEntries] = useState<FinanceEntry[]>([]);
    const [leads, setLeads] = useState<Lead[]>([]);
    const [summary, setSummary] = useState<Record<string, FinanceSummaryItem>>({});
    const [loading, setLoading] = useState(true);
    // removed showAddForm
    const [activeTab, setActiveTab] = useState<'אילן' | 'קובי'>('אילן');
    const [editingId, setEditingId] = useState<string | null>(null);

    const [errors, setErrors] = useState<FormErrors>({});
    const [submitAttempted, setSubmitAttempted] = useState(false);
    const [leadSearch, setLeadSearch] = useState('');
    const [showLeadDropdown, setShowLeadDropdown] = useState(false);
    const leadDropdownRef = useRef<HTMLDivElement>(null);

    // Sorting State
    const [financeModalOpen, setFinanceModalOpen] = useState(false);
    const [sortBy, setSortBy] = useState<'date' | 'type'>('date');
    const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

    const [form, setForm] = useState<FinanceForm>({
        Type: 'income',
        Date: new Date().toISOString().split('T')[0],
        Description: '',
        Musician: '',
        Amount: '',
        Payment_Status: 'לא שולם',
        Payment_Method: 'חשבון',
        Lead_ID: '',
        Owner: '',
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

    const openFinanceModal = (type: 'income' | 'expense') => {
        setForm({
            Type: type,
            Date: new Date().toISOString().split('T')[0],
            Description: '',
            Musician: '',
            Amount: '',
            Payment_Status: 'לא שולם',
            Payment_Method: 'חשבון',
            Lead_ID: '',
            Owner: activeTab,
        });
        setEditingId(null);
        setSubmitAttempted(false);
        setErrors({});
        setFinanceModalOpen(true);
    };

    const handleSaveFinance = async () => {
        setSubmitAttempted(true);
        const validationErrors = validateForm(form);
        setErrors(validationErrors);
        if (Object.keys(validationErrors).length > 0) return;

        try {
            const saveOwner = getAddOwner() || form.Owner;
            if (editingId) {
                await api.updateFinanceEntry(editingId, {
                    Owner: saveOwner,
                    Type: form.Type,
                    Description: form.Description,
                    Event_Name: form.Type === 'income' ? form.Description : undefined,
                    Musician: form.Type === 'income' ? (form.Musician || undefined) : undefined,
                    Amount: parseFloat(form.Amount),
                    Payment_Status: form.Payment_Status,
                    Payment_Method: form.Payment_Method,
                    Date: form.Date,
                    Lead_ID: form.Lead_ID || undefined,
                });
            } else {
                await api.createFinanceEntry({
                    Owner: saveOwner,
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
            }
            setFinanceModalOpen(false);
            setEditingId(null);
            fetchData();
        } catch (e) {
            console.error(e);
            alert('שגיאה בשמירת התנועה');
        }
    };

    const handleEditFinance = (entry: FinanceEntry) => {
        setEditingId(entry.id);
        setForm({
            Type: entry.fields.Type,
            Date: entry.fields.Date || new Date().toISOString().split('T')[0],
            Description: entry.fields.Event_Name || entry.fields.Description,
            Musician: entry.fields.Musician || '',
            Amount: String(entry.fields.Amount),
            Payment_Status: entry.fields.Payment_Status,
            Payment_Method: entry.fields.Payment_Method || 'חשבון',
            Lead_ID: entry.fields.Lead_ID || '',
            Owner: entry.fields.Owner,
        });
        setSubmitAttempted(false);
        setFinanceModalOpen(true);
    };

    const handleDeleteFinance = async (id: string) => {
        if (!confirm('האם למחוק את הרשומה?')) return;
        try {
            await api.deleteFinanceEntry(id);
            fetchData();
        } catch (e) {
            console.error(e);
            alert('שגיאה במחיקת תנועה');
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

    const parseDateToMs = (dateStr?: string) => {
        if (!dateStr) return 0;
        if (dateStr.includes('-')) {
            return new Date(dateStr).getTime();
        }
        if (dateStr.includes('/')) {
            const parts = dateStr.split('/');
            if (parts.length === 3) {
                const day = parts[0].padStart(2, '0');
                const month = parts[1].padStart(2, '0');
                let year = parts[2];
                if (year.length === 2) year = '20' + year;
                return new Date(`${year}-${month}-${day}`).getTime();
            }
        }
        return new Date(dateStr).getTime() || 0;
    };

    const sortEntries = (list: FinanceEntry[]) => {
        return [...list].sort((a, b) => {
            const dateA = parseDateToMs(a.fields.Date);
            const dateB = parseDateToMs(b.fields.Date);

            if (sortBy === 'date') {
                if (dateA !== dateB) {
                    return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
                }
                // Same date: group logically by Event Name so they stick together
                const evtA = (a.fields.Event_Name || a.fields.Description || '').toLowerCase();
                const evtB = (b.fields.Event_Name || b.fields.Description || '').toLowerCase();
                if (evtA !== evtB) {
                    return evtA.localeCompare(evtB, 'he');
                }
                // Same event/date: Income before Expense
                if (a.fields.Type !== b.fields.Type) return a.fields.Type === 'income' ? -1 : 1;
                // Same type: highest amount first
                return (b.fields.Amount || 0) - (a.fields.Amount || 0);
            } else {
                // type sorting: Income first, then Expense. Secondary sort by Date
                if (a.fields.Type !== b.fields.Type) return a.fields.Type === 'income' ? -1 : 1;
                if (dateA !== dateB) {
                    return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
                }
                return (b.fields.Amount || 0) - (a.fields.Amount || 0);
            }
        });
    };

    const FieldError = ({ error }: { error?: string }) => {
        if (!error || !submitAttempted) return null;
        return <p className="text-red-500 text-[10px] mt-0.5 flex items-center gap-0.5"><AlertCircle size={10} /> {error}</p>;
    };

        const renderRow = (e: FinanceEntry) => {
        const type = e.fields.Type;
        const editable = canEdit(e);
        const linkedLead = getLinkedLeadName(e.fields.Lead_ID);

        return (
            <div key={e.id} className="flex items-center px-4 py-2 text-xs border-b border-slate-100 hover:bg-slate-50 transition-colors bg-white">
                <div className="w-16 shrink-0 text-[10px] text-slate-500">{new Date(e.fields.Date).toLocaleDateString('he-IL', {day:'2-digit', month:'2-digit', year:'2-digit'})}</div>
                <div className="flex-1 min-w-[120px] flex flex-col justify-center">
                    <div className="flex items-center gap-1">
                        <span className="font-semibold text-slate-700 truncate">{e.fields.Description || e.fields.Event_Name}</span>
                        {linkedLead && (
                            <span className="text-[9px] text-blue-500 bg-blue-50 px-1 rounded-sm flex items-center gap-0.5 whitespace-nowrap">
                                <Link size={8} /> <span className="truncate max-w-[80px] sm:max-w-[120px]">{linkedLead}</span>
                            </span>
                        )}
                    </div>
                </div>
                <div className="w-20 shrink-0 text-[10px] text-slate-400 text-center">
                    {e.fields.Event_Name ? e.fields.Musician || '' : ''}
                </div>
                <div className="w-24 shrink-0 flex flex-col items-end px-2">
                    <span className={clsx(
                        "text-[9px] px-1.5 py-0.5 rounded-full font-bold mb-0.5",
                        e.fields.Payment_Status === 'תשלום' ? 'bg-green-100 text-green-700' : e.fields.Payment_Status === 'חלקי' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                    )}>{e.fields.Payment_Status}</span>
                    <span className="text-[9px] text-slate-400 text-center">{e.fields.Payment_Method}</span>
                </div>
                <div className={clsx(
                    "w-24 shrink-0 text-left font-bold font-mono tracking-tighter",
                    type === 'income' ? "text-emerald-600" : "text-red-600"
                )} dir="ltr">
                    {type === 'income' ? '+' : '-'}{e.fields.Amount.toLocaleString()} ₪
                </div>
                <div className="w-12 shrink-0 flex items-center justify-end gap-2 text-slate-400 pl-2">
                    {editable && (
                        <>
                            <button onClick={() => handleEditFinance(e)} className="hover:text-blue-500"><Edit size={12} /></button>
                            <button onClick={() => handleDeleteFinance(e.id)} className="hover:text-red-500"><Trash2 size={12} /></button>
                        </>
                    )}
                </div>
            </div>
        );
    };

    const renderTable = (owner: string) => {
        const ownerSummary = summary[owner] || { income: 0, expenses: 0, balance: 0, cash_balance: 0, bank_balance: 0 };
        const rawEntries = ownerEntries(owner);
        const sortedEntries = sortEntries(rawEntries);

        // Chart Data Preparation
        const chartData = [...sortedEntries].reverse().reduce((acc: any[], entry) => {
            const month = new Date(entry.fields.Date).toLocaleString('he-IL', { month: 'short', year: 'numeric' });
            const existing = acc.find(item => item.month === month);
            
            if (existing) {
                if (entry.fields.Type === 'income') existing.income += entry.fields.Amount;
                if (entry.fields.Type === 'expense') existing.expense += entry.fields.Amount;
            } else {
                acc.push({
                    month,
                    income: entry.fields.Type === 'income' ? entry.fields.Amount : 0,
                    expense: entry.fields.Type === 'expense' ? entry.fields.Amount : 0
                });
            }
            return acc;
        }, []);

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
                            <span className="text-[10px] bg-white px-2 py-0.5 rounded-md text-slate-700 border border-slate-200" title="יתרה בחשבון">🏦 {formatCurrency(ownerSummary.bank_balance || 0)}</span>
                            <span className="text-[10px] bg-white px-2 py-0.5 rounded-md text-slate-700 border border-slate-200" title="יתרה במזומן">💵 {formatCurrency(ownerSummary.cash_balance || 0)}</span>
                        </div>
                    </div>
                </div>

                {/* Visual Chart */}
                {chartData.length > 0 && (
                    <div className="h-48 md:h-64 w-full mb-6 p-4 border border-slate-200 rounded-xl bg-white shadow-sm">
                        <h3 className="text-xs font-bold text-slate-500 mb-4 px-2">הכנסות מול הוצאות</h3>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData} margin={{ top: 10, right: 0, left: -30, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#64748B' }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 10, fill: '#64748B' }} axisLine={false} tickLine={false} />
                                <Tooltip 
                                    cursor={{fill: '#F1F5F9'}}
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                />
                                <Legend wrapperStyle={{ fontSize: '11px', fontWeight: 'bold', bottom: -5 }} />
                                <Bar dataKey="income" name="הכנסות" fill="#059669" radius={[4, 4, 0, 0]} barSize={25} />
                                <Bar dataKey="expense" name="הוצאות" fill="#E11D48" radius={[4, 4, 0, 0]} barSize={25} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                )}

                <div className="flex flex-col sm:flex-row items-center justify-between mb-4 bg-white p-2 border border-slate-200 rounded-xl gap-2 shadow-sm">
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                        <span className="text-xs font-bold text-slate-500 mr-2">מיון לפי:</span>
                        <div className="flex gap-1 items-center">
                            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as 'date' | 'type')} className="bg-slate-50 border border-slate-200 text-sm rounded-lg px-3 py-1.5 focus:ring-1 focus:ring-blue-500 min-w-[120px]">
                                <option value="date">📅 תאריך</option>
                                <option value="type">📈 עסקאות (הכנסה/הוצאה)</option>
                            </select>
                            {sortBy === 'date' && (
                                <button
                                    onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
                                    className="flex items-center justify-center p-1.5 border border-slate-200 rounded-lg outline-none bg-slate-50 text-slate-600 hover:bg-slate-100 transition shadow-sm w-[72px]"
                                    title={sortOrder === 'desc' ? 'מהחדש לישן' : 'מהישן לחדש'}
                                >
                                    {sortOrder === 'desc' ? <ArrowDown size={14} className="ml-1" /> : <ArrowUp size={14} className="ml-1" />}
                                    <span className="text-[10px] font-bold">{sortOrder === 'desc' ? 'מהחדש' : 'מהישן'}</span>
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto mb-4 shadow-sm flex flex-col">
                    <div className="min-w-[500px] flex flex-col">
                        {/* Header Row */}
                        <div className="flex items-center px-4 py-2 text-[10px] font-bold text-slate-400 border-b border-slate-200 uppercase bg-slate-50">
                            <div className="w-16 shrink-0">תאריך</div>
                            <div className="flex-1 min-w-[120px]">אירוע / פירוט</div>
                            <div className="w-20 shrink-0">נגן</div>
                            <div className="w-24 shrink-0 text-right px-2">אמצעי/סטטוס</div>
                            <div className="w-24 shrink-0 text-left">סכום</div>
                            <div className="w-12 shrink-0"></div>
                        </div>
                        {/* Rows */}
                        {sortedEntries.length === 0 ? (
                            <div className="text-center py-8 text-slate-400 text-sm">אין תנועות</div>
                        ) : (
                            sortedEntries.map(e => renderRow(e))
                        )}
                    </div>
                </div>
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
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => openFinanceModal('income')}
                            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-lg border border-emerald-200 hover:bg-emerald-100 transition-colors"
                        >
                            + הוסף הכנסה
                        </button>
                        <button
                            onClick={() => openFinanceModal('expense')}
                            className="flex items-center gap-1.5 px-3 py-2 bg-red-50 text-red-700 text-xs font-bold rounded-lg border border-red-200 hover:bg-red-100 transition-colors"
                        >
                            - הוסף הוצאה
                        </button>
                    </div>
                )}
            </div>

            {/* Modal */}
            {financeModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" onClick={() => setFinanceModalOpen(false)}>
                    <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                        <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h3 className="text-sm font-bold text-slate-800">{editingId ? 'עריכת תנועה' : 'הוספת תנועה'}</h3>
                            <button onClick={() => setFinanceModalOpen(false)} className="text-slate-400 hover:text-red-500 transition-colors"><X size={18} /></button>
                        </div>
                        <div className="px-5 py-4 overflow-y-auto">
                <div className="px-4 md:px-6 py-4 bg-amber-50 border-b border-amber-100">
                    {/* Row 1: Type + Date + Amount */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 mb-1">סוג תנועה *</label>
                            <select value={form.Type} onChange={(e) => setForm({ ...form, Type: e.target.value as 'income' | 'expense', Musician: '' })} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-all">
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
                            <select value={form.Payment_Method} onChange={(e) => setForm({ ...form, Payment_Method: e.target.value as 'חשבון' | 'מזומן' })} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white">
                                <option value="חשבון">🏦 חשבון (בנק/אשראי/העברה)</option>
                                <option value="מזומן">💵 מזומן</option>
                            </select>
                        </div>
                        {/* Admin Owner Selection Wrapper */}
                        {!getAddOwner() && (
                            <div className="mt-3 bg-white p-3 border border-slate-200 rounded-xl">
                                <label className="block text-[10px] font-bold text-slate-500 mb-2">למי לשייך? (פעולה למנהל)</label>
                                <div className="flex gap-2">
                                    <button onClick={() => setForm({...form, Owner: 'אילן'})} className={`flex-1 py-1.5 text-xs font-bold rounded-lg ${form.Owner === 'אילן' ? 'bg-blue-100 text-blue-700 border-2 border-blue-400' : 'bg-slate-50 border border-slate-200'}`}>אילן</button>
                                    <button onClick={() => setForm({...form, Owner: 'קובי'})} className={`flex-1 py-1.5 text-xs font-bold rounded-lg ${form.Owner === 'קובי' ? 'bg-purple-100 text-purple-700 border-2 border-purple-400' : 'bg-slate-50 border border-slate-200'}`}>קובי</button>
                                </div>
                            </div>
                        )}
                        
                        </div>

                    {submitAttempted && Object.keys(errors).length > 0 && (
                        <div className="mt-3 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 flex items-center gap-2">
                            <AlertCircle size={14} className="text-red-500 flex-shrink-0" />
                            <p className="text-red-600 text-xs font-medium">יש שדות חובה שלא מולאו — בדוק את השדות המסומנים באדום</p>
                        </div>
                    )}
                    
                    <div className="px-5 py-4 border-t border-slate-100 bg-slate-50 flex gap-2 justify-end">
                        <button onClick={() => setFinanceModalOpen(false)} className="px-4 py-2 text-slate-500 text-xs font-bold hover:text-slate-700">ביטול</button>
                        <button onClick={handleSaveFinance} className="px-6 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-700 transition-all shadow-md">שמור רשומה</button>
                    </div>
                </div>
                </div>
                </div>
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

                <div className="hidden xl:flex gap-6">
                    <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-extrabold text-blue-700 mb-3">📊 אילן</h3>
                        {renderTable('אילן')}
                    </div>
                    <div className="w-px bg-slate-200 shrink-0"></div>
                    <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-extrabold text-purple-700 mb-3">📊 קובי</h3>
                        {renderTable('קובי')}
                    </div>
                </div>
            </div>
        </div>
    );
}
