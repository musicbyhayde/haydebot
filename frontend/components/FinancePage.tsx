'use client';

import { useState, useEffect } from 'react';
import { Plus, Trash2, Edit, Check, X, DollarSign, TrendingUp, TrendingDown, Menu, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { FinanceEntry } from '@/types';
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
    Event_Name?: string;
}

export default function FinancePage({ currentUser, onMenuClick }: FinancePageProps) {
    const [entries, setEntries] = useState<FinanceEntry[]>([]);
    const [summary, setSummary] = useState<Record<string, { income: number; expenses: number; balance: number }>>({});
    const [loading, setLoading] = useState(true);
    const [showAddForm, setShowAddForm] = useState(false);
    const [activeTab, setActiveTab] = useState<'אילן' | 'קובי'>('אילן');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<any>({});
    const [errors, setErrors] = useState<FormErrors>({});
    const [submitAttempted, setSubmitAttempted] = useState(false);

    const [form, setForm] = useState({
        Type: 'income',
        Date: new Date().toISOString().split('T')[0],
        Description: '',
        Event_Name: '',
        Musician: '',
        Amount: '',
        Payment_Status: 'לא שולם',
    });

    useEffect(() => {
        fetchData();
    }, []);

    // Set default active tab to current user's name
    useEffect(() => {
        if (currentUser?.displayName === 'קובי') setActiveTab('קובי');
    }, [currentUser]);

    const fetchData = async () => {
        try {
            const [entriesData, summaryData] = await Promise.all([
                api.getFinanceEntries(),
                api.getFinanceSummary()
            ]);
            setEntries(entriesData);
            setSummary(summaryData);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    // --- Validation ---
    const validateForm = (data: typeof form): FormErrors => {
        const errs: FormErrors = {};
        if (!data.Description.trim()) errs.Description = 'חובה להזין פירוט';
        if (!data.Amount || isNaN(parseFloat(data.Amount)) || parseFloat(data.Amount) <= 0) errs.Amount = 'חובה להזין סכום חיובי';
        if (!data.Date) errs.Date = 'חובה לבחור תאריך';
        if (data.Type === 'income' && !data.Event_Name.trim()) errs.Event_Name = 'חובה להזין שם אירוע להכנסה';
        return errs;
    };

    // --- Determine which owner the user can add entries for ---
    const canAddForOwner = (owner: string): boolean => {
        if (!currentUser) return false;
        if (currentUser.role === 'admin') return true;
        return currentUser.displayName === owner;
    };

    const getAddOwner = (): string | null => {
        if (!currentUser) return null;
        if (currentUser.role === 'admin') return null; // admin picks from both
        return currentUser.displayName;
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
                Event_Name: form.Type === 'income' ? form.Event_Name : undefined,
                Musician: form.Type === 'income' ? (form.Musician || undefined) : undefined,
                Amount: parseFloat(form.Amount),
                Payment_Status: form.Payment_Status,
            });
            setForm({ Type: 'income', Date: new Date().toISOString().split('T')[0], Description: '', Event_Name: '', Musician: '', Amount: '', Payment_Status: 'לא שולם' });
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
            Description: entry.fields.Description,
            Event_Name: entry.fields.Event_Name || '',
            Musician: entry.fields.Musician || '',
            Amount: String(entry.fields.Amount),
            Payment_Status: entry.fields.Payment_Status,
            Date: entry.fields.Date,
        });
    };

    const saveEdit = async (id: string) => {
        try {
            await api.updateFinanceEntry(id, {
                Description: editForm.Description,
                Event_Name: editForm.Event_Name || undefined,
                Musician: editForm.Musician || undefined,
                Amount: parseFloat(editForm.Amount),
                Payment_Status: editForm.Payment_Status,
                Date: editForm.Date,
            });
            setEditingId(null);
            fetchData();
        } catch (e) {
            console.error(e);
        }
    };

    // --- Delete ---
    const handleDelete = async (id: string) => {
        if (!confirm('האם למחוק את הרשומה?')) return;
        try {
            await api.deleteFinanceEntry(id);
            fetchData();
        } catch (e) {
            console.error(e);
        }
    };

    // --- Permissions ---
    const canEdit = (entry: FinanceEntry) => {
        if (!currentUser) return false;
        if (currentUser.role === 'admin') return true;
        return entry.fields.Owner === currentUser.displayName;
    };

    const formatCurrency = (n: number) => {
        return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);
    };

    const ownerEntries = (owner: string) => entries.filter(e => e.fields.Owner === owner);
    const incomeEntries = (owner: string) => ownerEntries(owner).filter(e => e.fields.Type === 'income');
    const expenseEntries = (owner: string) => ownerEntries(owner).filter(e => e.fields.Type === 'expense');

    // --- Field Error Component ---
    const FieldError = ({ error }: { error?: string }) => {
        if (!error || !submitAttempted) return null;
        return <p className="text-red-500 text-[10px] mt-0.5 flex items-center gap-0.5"><AlertCircle size={10} /> {error}</p>;
    };

    // --- Render Entry Row ---
    const renderRow = (e: FinanceEntry, type: 'income' | 'expense') => {
        const isEditing = editingId === e.id;
        const editable = canEdit(e);

        if (isEditing) {
            return (
                <tr key={e.id} className="bg-amber-50">
                    <td className="py-2 px-3"><input type="date" value={editForm.Date} onChange={(ev) => setEditForm({ ...editForm, Date: ev.target.value })} className="px-2 py-1 border border-slate-200 rounded-lg text-xs w-full bg-white" dir="ltr" /></td>
                    <td className="py-2 px-3"><input type="text" value={type === 'income' ? editForm.Event_Name : editForm.Description} onChange={(ev) => setEditForm({ ...editForm, [type === 'income' ? 'Event_Name' : 'Description']: ev.target.value })} className="px-2 py-1 border border-slate-200 rounded-lg text-xs w-full bg-white" /></td>
                    {type === 'income' && <td className="py-2 px-3"><input type="text" value={editForm.Musician} onChange={(ev) => setEditForm({ ...editForm, Musician: ev.target.value })} className="px-2 py-1 border border-slate-200 rounded-lg text-xs w-full bg-white" /></td>}
                    <td className="py-2 px-3"><input type="number" value={editForm.Amount} onChange={(ev) => setEditForm({ ...editForm, Amount: ev.target.value })} className="px-2 py-1 border border-slate-200 rounded-lg text-xs w-20 bg-white" dir="ltr" /></td>
                    <td className="py-2 px-3">
                        <select value={editForm.Payment_Status} onChange={(ev) => setEditForm({ ...editForm, Payment_Status: ev.target.value })} className="px-2 py-1 border border-slate-200 rounded-lg text-xs bg-white">
                            {PAYMENT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
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
                <td className="py-2 px-3 text-xs font-medium text-slate-800">{type === 'income' ? (e.fields.Event_Name || e.fields.Description) : e.fields.Description}</td>
                {type === 'income' && <td className="py-2 px-3 text-xs text-slate-600">{e.fields.Musician || '—'}</td>}
                <td className="py-2 px-3 text-xs font-bold text-left" dir="ltr">
                    <span className={type === 'income' ? 'text-green-700' : 'text-red-700'}>{formatCurrency(e.fields.Amount)}</span>
                </td>
                <td className="py-2 px-3">
                    <span className={clsx(
                        "text-[10px] px-2 py-0.5 rounded-full font-bold",
                        e.fields.Payment_Status === 'תשלום' ? 'bg-green-100 text-green-700' : e.fields.Payment_Status === 'חלקי' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                    )}>{e.fields.Payment_Status}</span>
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

    // --- Render Table ---
    const renderTable = (owner: string) => {
        const income = incomeEntries(owner);
        const expenses = expenseEntries(owner);
        const ownerSummary = summary[owner] || { income: 0, expenses: 0, balance: 0 };

        return (
            <div className="flex-1 min-w-0">
                {/* Summary Cards */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="bg-green-50 border border-green-100 rounded-xl p-3 text-center">
                        <div className="text-[10px] font-bold text-green-600 uppercase">הכנסות</div>
                        <div className="text-lg font-extrabold text-green-700">{formatCurrency(ownerSummary.income)}</div>
                    </div>
                    <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-center">
                        <div className="text-[10px] font-bold text-red-600 uppercase">הוצאות</div>
                        <div className="text-lg font-extrabold text-red-700">{formatCurrency(ownerSummary.expenses)}</div>
                    </div>
                    <div className={clsx("border rounded-xl p-3 text-center", ownerSummary.balance >= 0 ? "bg-blue-50 border-blue-100" : "bg-orange-50 border-orange-100")}>
                        <div className="text-[10px] font-bold text-slate-600 uppercase">יתרה</div>
                        <div className={clsx("text-lg font-extrabold", ownerSummary.balance >= 0 ? "text-blue-700" : "text-orange-700")}>{formatCurrency(ownerSummary.balance)}</div>
                    </div>
                </div>

                {/* Income Table */}
                <h4 className="text-xs font-bold text-green-700 mb-2 flex items-center gap-1"><TrendingUp size={14} /> הכנסות ({income.length})</h4>
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-4">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-green-50 text-green-800">
                                    <th className="py-2 px-3 text-right text-[11px] font-bold">תאריך</th>
                                    <th className="py-2 px-3 text-right text-[11px] font-bold">אירוע</th>
                                    <th className="py-2 px-3 text-right text-[11px] font-bold">נגן</th>
                                    <th className="py-2 px-3 text-left text-[11px] font-bold">סכום</th>
                                    <th className="py-2 px-3 text-right text-[11px] font-bold">סטטוס</th>
                                    <th className="py-2 px-3 w-16"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {income.length === 0 ? (
                                    <tr><td colSpan={6} className="text-center py-4 text-slate-400 text-xs">אין הכנסות</td></tr>
                                ) : income.map(e => renderRow(e, 'income'))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Expense Table */}
                <h4 className="text-xs font-bold text-red-700 mb-2 flex items-center gap-1"><TrendingDown size={14} /> הוצאות ({expenses.length})</h4>
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-red-50 text-red-800">
                                    <th className="py-2 px-3 text-right text-[11px] font-bold">תאריך</th>
                                    <th className="py-2 px-3 text-right text-[11px] font-bold">פירוט</th>
                                    <th className="py-2 px-3 text-left text-[11px] font-bold">סכום</th>
                                    <th className="py-2 px-3 text-right text-[11px] font-bold">סטטוס</th>
                                    <th className="py-2 px-3 w-16"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {expenses.length === 0 ? (
                                    <tr><td colSpan={5} className="text-center py-4 text-slate-400 text-xs">אין הוצאות</td></tr>
                                ) : expenses.map(e => renderRow(e, 'expense'))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        );
    };

    if (loading) {
        return <div className="flex-1 flex items-center justify-center text-slate-400 font-bold">טוען נתונים...</div>;
    }

    const isIncome = form.Type === 'income';
    const addOwner = getAddOwner(); // null for admin (picks), string for partner

    return (
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50" dir="rtl">
            {/* Page Header */}
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
                {/* Only show Add button if user can add for at least one owner */}
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
                            <select value={form.Type} onChange={(e) => setForm({ ...form, Type: e.target.value, Event_Name: '', Musician: '' })} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-all">
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

                    {/* Row 2: Dynamic fields based on type */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
                        {isIncome ? (
                            <>
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-500 mb-1">שם אירוע *</label>
                                    <input type="text" value={form.Event_Name} onChange={(e) => setForm({ ...form, Event_Name: e.target.value })} placeholder="למשל: חתונה כהן" className={clsx("w-full px-3 py-2 border rounded-xl text-sm bg-white transition-all", errors.Event_Name && submitAttempted ? 'border-red-300 ring-2 ring-red-100' : 'border-slate-200')} />
                                    <FieldError error={errors.Event_Name} />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-500 mb-1">נגן</label>
                                    <input type="text" value={form.Musician} onChange={(e) => setForm({ ...form, Musician: e.target.value })} placeholder="אופציונלי" className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white" />
                                </div>
                            </>
                        ) : (
                            <div className="col-span-2">
                                <label className="block text-[10px] font-bold text-slate-500 mb-1">פירוט ההוצאה *</label>
                                <input type="text" value={form.Description} onChange={(e) => setForm({ ...form, Description: e.target.value })} placeholder="למשל: קנייה של ציוד, שכירת רמקול" className={clsx("w-full px-3 py-2 border rounded-xl text-sm bg-white transition-all", errors.Description && submitAttempted ? 'border-red-300 ring-2 ring-red-100' : 'border-slate-200')} />
                                <FieldError error={errors.Description} />
                            </div>
                        )}
                        {isIncome && (
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 mb-1">{isIncome ? 'פירוט' : 'פירוט'} *</label>
                                <input type="text" value={form.Description} onChange={(e) => setForm({ ...form, Description: e.target.value })} placeholder={isIncome ? 'פירוט ההכנסה' : 'פירוט ההוצאה'} className={clsx("w-full px-3 py-2 border rounded-xl text-sm bg-white transition-all", errors.Description && submitAttempted ? 'border-red-300 ring-2 ring-red-100' : 'border-slate-200')} />
                                <FieldError error={errors.Description} />
                            </div>
                        )}
                    </div>

                    {/* Row 3: Payment status + Submit */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 mb-1">סטטוס תשלום</label>
                            <select value={form.Payment_Status} onChange={(e) => setForm({ ...form, Payment_Status: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white">
                                {PAYMENT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                        <div className="flex items-end gap-2">
                            {/* Show one or two buttons based on role */}
                            {addOwner ? (
                                // Partner: single button for their own name
                                <button onClick={() => handleAdd(addOwner)} className="flex-1 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 transition-all shadow-md">
                                    הוסף ל-{addOwner}
                                </button>
                            ) : (
                                // Admin: two buttons
                                <>
                                    <button onClick={() => handleAdd('אילן')} className="flex-1 py-2.5 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-700 transition-all shadow-md">+ אילן</button>
                                    <button onClick={() => handleAdd('קובי')} className="flex-1 py-2.5 bg-purple-600 text-white text-xs font-bold rounded-xl hover:bg-purple-700 transition-all shadow-md">+ קובי</button>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Validation summary */}
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
                {/* Mobile: Tabs */}
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

                {/* Mobile: Single table */}
                <div className="md:hidden">
                    {renderTable(activeTab)}
                </div>

                {/* Desktop: Side by side */}
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
