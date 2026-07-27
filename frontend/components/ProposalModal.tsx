import { useState, useEffect } from 'react';
import { X, Send, Link, Plus, Trash2, CheckCircle2, Edit, Copy, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui';
import QuotePreview from '@/components/QuotePreview';

interface QuoteItem {
    id: string;
    createdAt: string;
    title: string;
    description: string;
    inclusions: string[];
    addons: {name: string, price: number}[];
    terms: string[];
    service: string;
    date: string;
    location: string;
    amount: number;
    notIncludingVat: boolean;
}

interface ProposalModalProps {
    isOpen: boolean;
    onClose: () => void;
    leadId: string;
    initialData: {
        name: string;
        service: string;
        date: string;
        location: string;
        amount: number;
        quote_data?: any;
    };
    onSave: (quoteData: any) => void;
}

const DEFAULT_TERMS = [
    "הצעת המחיר תקפה ל-14 ימים בלבד",
    "המחירים כוללים מע״מ כחוק",
    "במידה והנחיות פיקוד העורף לא יאפשרו את קיום האירוע לא יגבו דמי ביטול",
    "אישור הצעה זו בהודעה חוזרת",
];

const generateId = () => Math.random().toString(36).substring(2, 9);

export default function ProposalModal({ isOpen, onClose, leadId, initialData, onSave }: ProposalModalProps) {
    const { error, success, confirm, info } = useToast();
    const [quotes, setQuotes] = useState<QuoteItem[]>([]);
    const [view, setView] = useState<'list' | 'edit'>('list');
    const [editingQuote, setEditingQuote] = useState<QuoteItem | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (isOpen) {
            const qData = initialData.quote_data || {};
            if (Array.isArray(qData.quotes)) {
                setQuotes(qData.quotes);
            } else if (Object.keys(qData).length > 0 && !qData.quotes) {
                // Legacy migration
                const legacyQuote: QuoteItem = {
                    id: generateId(),
                    createdAt: new Date().toISOString(),
                    title: qData.title || `הצעת מחיר לאירוע של ${initialData.name}`,
                    description: qData.description || `שמחים מאוד על פנייתכם! להלן פירוט הצעת המחיר לשירותי המוזיקה עבור האירוע הקרוב שלכם.`,
                    inclusions: qData.inclusions || [],
                    addons: qData.addons || [],
                    terms: qData.terms || [...DEFAULT_TERMS],
                    service: qData.service || initialData.service,
                    date: qData.date || initialData.date || '',
                    location: qData.location || initialData.location,
                    amount: qData.amount !== undefined ? Number(qData.amount) : (initialData.amount || 0),
                    notIncludingVat: qData.notIncludingVat || false,
                };
                setQuotes([legacyQuote]);
            } else {
                setQuotes([]);
            }
            setView('list');
        }
    }, [isOpen, initialData]);

    if (!isOpen) return null;

    const saveQuotesToDb = async (newQuotes: QuoteItem[]) => {
        setSaving(true);
        const quoteData = { quotes: newQuotes };
        try {
            await api.updateLead(leadId, { Quote_Data: quoteData });
            onSave(quoteData);
            setQuotes(newQuotes);
        } catch (err) {
            console.error(err);
            error('שגיאה בשמירת הנתונים');
            throw err;
        } finally {
            setSaving(false);
        }
    };

    const handleCreateNew = (mode: 'empty' | 'copy_last') => {
        let baseQuote: Partial<QuoteItem> = {};
        
        if (mode === 'copy_last' && quotes.length > 0) {
            const lastQuote = quotes[quotes.length - 1];
            baseQuote = { ...lastQuote };
        } else {
            baseQuote = {
                title: `הצעת מחיר לאירוע של ${initialData.name}`,
                description: `שמחים מאוד על פנייתכם! להלן פירוט הצעת המחיר לשירותי המוזיקה עבור האירוע הקרוב שלכם.`,
                inclusions: [],
                addons: [],
                terms: [...DEFAULT_TERMS],
                service: initialData.service,
                date: initialData.date || '',
                location: initialData.location,
                amount: initialData.amount || 0,
                notIncludingVat: false,
            };
        }

        const newQuote: QuoteItem = {
            ...baseQuote,
            id: generateId(),
            createdAt: new Date().toISOString(),
        } as QuoteItem;

        setEditingQuote(newQuote);
        setView('edit');
    };

    const handleSaveEdit = async () => {
        if (!editingQuote) return;
        const existingIndex = quotes.findIndex(q => q.id === editingQuote.id);
        const newQuotes = [...quotes];
        
        // Clean up empty strings
        const cleanedQuote = {
            ...editingQuote,
            inclusions: editingQuote.inclusions.filter(i => i.trim()),
            terms: editingQuote.terms.filter(t => t.trim()),
        };

        if (existingIndex >= 0) {
            newQuotes[existingIndex] = cleanedQuote;
        } else {
            newQuotes.push(cleanedQuote);
        }

        try {
            await saveQuotesToDb(newQuotes);
            setView('list');
            success('ההצעה נשמרה בהצלחה!');
        } catch (e) {
            // Error handled in saveQuotesToDb
        }
    };

    const handleDelete = async (id: string) => {
        const isConfirmed = await confirm({
            title: 'מחיקת הצעה',
            message: 'האם אתה בטוח שברצונך למחוק הצעה זו?',
            variant: 'danger',
            confirmLabel: 'מחק'
        });
        if (!isConfirmed) return;
        const newQuotes = quotes.filter(q => q.id !== id);
        try {
            await saveQuotesToDb(newQuotes);
        } catch (e) {}
    };

    const copyLink = (id: string) => {
        const url = `${window.location.origin}/quote/${leadId}?qid=${id}`;
        navigator.clipboard.writeText(url);
        info('הקישור להצעה זו הועתק!');
    };

    // --- List View ---
    if (view === 'list') {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" dir="rtl">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
                    <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2">
                            <span>📝</span> הצעות מחיר
                        </h3>
                        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 bg-white rounded-full p-1 border border-slate-200">
                            <X size={18} />
                        </button>
                    </div>

                    <div className="p-6 overflow-y-auto bg-slate-50 flex-1">
                        {quotes.length === 0 ? (
                            <div className="text-center py-10 bg-white rounded-xl border border-slate-200">
                                <div className="text-4xl mb-3 opacity-50">📄</div>
                                <h4 className="text-slate-600 font-bold mb-1">אין הצעות מחיר</h4>
                                <p className="text-xs text-slate-400 mb-6">עדיין לא נוצרו הצעות מחיר לליד זה.</p>
                                <button 
                                    onClick={() => handleCreateNew('empty')}
                                    className="px-6 py-2 bg-indigo-600 text-white font-bold text-xs rounded-lg hover:bg-indigo-700 transition-colors inline-flex items-center gap-2"
                                >
                                    <Plus size={14}/> צור הצעה חדשה
                                </button>
                            </div>
                        ) : (
                            <>
                            <div className="bg-white rounded-xl overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead className="text-slate-400 font-medium text-xs bg-transparent border-b border-slate-100">
                                            <tr>
                                                <th className="px-6 py-4 font-medium text-right w-32">תאריך</th>
                                                <th className="px-6 py-4 font-medium text-center">תיאור</th>
                                                <th className="px-6 py-4 font-medium text-left w-32">סכום</th>
                                                <th className="px-6 py-4 font-medium w-24"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {quotes.map((q, idx) => (
                                                <tr key={q.id} className="hover:bg-slate-50/50 transition-colors group">
                                                    <td className="px-6 py-6 text-slate-500 text-[14px] text-right align-middle">{q.date || '-'}</td>
                                                    <td className="px-6 py-6 text-center align-middle">
                                                        <a 
                                                            href={`${window.location.origin}/quote/${leadId}?qid=${q.id}`} 
                                                            target="_blank" 
                                                            rel="noopener noreferrer"
                                                            className="font-bold text-slate-700 text-[15px] leading-relaxed max-w-[280px] mx-auto hover:text-indigo-600 transition-colors block"
                                                        >
                                                            {q.title}
                                                        </a>
                                                        <div className="text-[12px] text-slate-400 mt-1.5 flex items-center justify-center gap-1.5">
                                                            <span>הצעה מס׳ {idx + 1}</span>
                                                            {q.notIncludingVat && <span className="text-slate-300">•</span>}
                                                            {q.notIncludingVat && <span>לא כולל מע״מ</span>}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-6 text-left align-middle">
                                                        <div className="font-bold text-slate-800 text-[16px] font-mono">
                                                            ₪ {Number(q.amount || 0).toLocaleString()}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-6 text-left align-middle">
                                                        <div className="flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <button 
                                                                onClick={() => copyLink(q.id)}
                                                                className="text-slate-400 hover:text-blue-600 transition-colors"
                                                                title="העתק לינק"
                                                            >
                                                                <Link size={16}/>
                                                            </button>
                                                            <button 
                                                                onClick={() => { setEditingQuote(q); setView('edit'); }}
                                                                className="text-slate-400 hover:text-indigo-600 transition-colors"
                                                                title="עריכה"
                                                            >
                                                                <Edit size={16}/>
                                                            </button>
                                                            <button 
                                                                onClick={() => handleDelete(q.id)}
                                                                className="text-slate-400 hover:text-red-500 transition-colors"
                                                                title="מחק הצעה"
                                                            >
                                                                <Trash2 size={16}/>
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                            
                            <div className="mt-4 flex flex-col gap-2">
                                <button 
                                    onClick={() => handleCreateNew('copy_last')}
                                    className="w-full px-4 py-2.5 bg-indigo-600 text-white font-bold text-xs rounded-xl hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
                                >
                                    <Copy size={14}/> צור הצעה חדשה (העתק מאחרונה)
                                </button>
                                <button 
                                    onClick={() => handleCreateNew('empty')}
                                    className="w-full px-4 py-2.5 bg-white text-slate-600 font-bold text-xs rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
                                >
                                    <Plus size={14}/> צור הצעה חדשה ריקה
                                </button>
                            </div>
                        </>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // --- Edit View (Full Screen Split) ---
    if (!editingQuote) return null;
    const q = editingQuote;
    const setQ = (fields: Partial<QuoteItem>) => setEditingQuote({ ...q, ...fields });

    return (
        <div className="fixed inset-0 z-[100] flex bg-slate-100" dir="rtl">
            {/* Left Side: Form */}
            <div className="w-1/2 flex flex-col bg-white border-l border-slate-200 h-full shadow-2xl z-10">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0 z-20">
                    <div className="flex items-center gap-3">
                        <button onClick={() => setView('list')} className="text-slate-400 hover:text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-full p-1.5 transition-colors">
                            <ChevronRight size={20} />
                        </button>
                        <div>
                            <h3 className="font-bold text-slate-800 text-lg">עריכת הצעת מחיר</h3>
                            <p className="text-xs text-slate-500">עריכה בתצוגה חיה בזמן אמת</p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => setView('list')} className="px-4 py-2 text-slate-500 text-xs font-bold hover:bg-slate-50 rounded-lg transition-colors">ביטול</button>
                        <button onClick={handleSaveEdit} disabled={saving} className="px-6 py-2 bg-indigo-600 text-white font-bold text-xs rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2 transition-colors">
                            {saving ? 'שומר...' : 'שמור הצעה'} <CheckCircle2 size={14}/>
                        </button>
                    </div>
                </div>
                
                <div className="p-6 overflow-y-auto flex-1 space-y-6 bg-slate-50/50">
                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
                        <h4 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2">פרטים כלליים</h4>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">כותרת ההצעה</label>
                            <input 
                                type="text" 
                                value={q.title}
                                onChange={e => setQ({ title: e.target.value })}
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                            />
                        </div>
                        
                        <div className="flex gap-4">
                            <div className="flex-1">
                                <label className="block text-xs font-bold text-slate-500 mb-1">תאריך האירוע</label>
                                <input 
                                    type="text" 
                                    value={q.date}
                                    onChange={e => setQ({ date: e.target.value })}
                                    placeholder="למשל: 7.7.26"
                                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                                />
                            </div>
                            <div className="flex-1">
                                <label className="block text-xs font-bold text-slate-500 mb-1">סכום ההצעה (₪)</label>
                                <input 
                                    type="number" 
                                    value={q.amount || ''}
                                    onChange={e => setQ({ amount: Number(e.target.value) || 0 })}
                                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all font-mono"
                                />
                                <label className="flex items-center gap-1.5 mt-2 cursor-pointer w-max">
                                    <input 
                                        type="checkbox" 
                                        checked={q.notIncludingVat} 
                                        onChange={e => setQ({ notIncludingVat: e.target.checked })} 
                                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                    />
                                    <span className="text-xs font-bold text-slate-600">לא כולל מע״מ</span>
                                </label>
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">טקסט פתיחה / תיאור</label>
                            <textarea 
                                value={q.description}
                                onChange={e => setQ({ description: e.target.value })}
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all h-24 resize-none leading-relaxed"
                            />
                        </div>
                    </div>

                    {/* Editable Inclusions */}
                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
                        <h4 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2 flex items-center justify-between">
                            מה כלול בשירות (פריטים)
                            <button onClick={() => setQ({ inclusions: [...q.inclusions, ''] })} className="text-indigo-600 hover:text-indigo-700 font-bold flex items-center gap-1 text-xs bg-indigo-50 px-2 py-1 rounded">
                                <Plus size={12}/> הוסף פריט
                            </button>
                        </h4>
                        
                        {q.inclusions.length === 0 ? (
                            <p className="text-xs text-slate-400 italic text-center py-2">לא הוגדרו פריטים כלולים</p>
                        ) : (
                            <div className="space-y-3">
                                {q.inclusions.map((inc, idx) => (
                                    <div key={idx} className="flex gap-2 items-start group">
                                        <div className="flex-1">
                                            <textarea 
                                                placeholder="למשל: צוות נגנים מקצועי"
                                                value={inc}
                                                onChange={e => {
                                                    const newI = [...q.inclusions];
                                                    newI[idx] = e.target.value;
                                                    setQ({ inclusions: newI });
                                                }}
                                                className="w-full text-xs border border-slate-200 rounded-lg p-2.5 focus:border-indigo-500 outline-none transition-all resize-none overflow-hidden min-h-[40px]"
                                                rows={inc.includes('\n') ? inc.split('\n').length : 1}
                                            />
                                            <p className="text-[10px] text-slate-400 mt-1 px-1 opacity-0 group-focus-within:opacity-100 transition-opacity">טיפ: שורה ראשונה היא הכותרת, שורות הבאות הן פירוט (השתמש ב-Enter)</p>
                                        </div>
                                        <button onClick={() => setQ({ inclusions: q.inclusions.filter((_, i) => i !== idx) })} className="text-slate-300 hover:text-red-500 p-2 rounded-lg hover:bg-red-50 transition-colors mt-0.5">
                                            <Trash2 size={16}/>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Editable Addons */}
                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
                        <h4 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2 flex items-center justify-between">
                            תוספות אפשריות (לא חובה)
                            <button onClick={() => setQ({ addons: [...q.addons, {name: '', price: 0}] })} className="text-indigo-600 hover:text-indigo-700 font-bold flex items-center gap-1 text-xs bg-indigo-50 px-2 py-1 rounded">
                                <Plus size={12}/> הוסף תוספת
                            </button>
                        </h4>
                        
                        {q.addons.length === 0 ? (
                            <p className="text-xs text-slate-400 italic text-center py-2">אין תוספות להצעה זו</p>
                        ) : (
                            <div className="space-y-2">
                                {q.addons.map((addon, idx) => (
                                    <div key={idx} className="flex gap-2 items-center">
                                        <input 
                                            placeholder="שם (למשל: סקסופון פריצה)"
                                            value={addon.name}
                                            onChange={e => {
                                                const newA = [...q.addons];
                                                newA[idx].name = e.target.value;
                                                setQ({ addons: newA });
                                            }}
                                            className="flex-1 text-xs border border-slate-200 rounded-lg p-2.5 focus:border-indigo-500 outline-none transition-all"
                                        />
                                        <div className="relative">
                                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-mono">₪</span>
                                            <input 
                                                type="number"
                                                placeholder="סכום"
                                                value={addon.price || ''}
                                                onChange={e => {
                                                    const newA = [...q.addons];
                                                    newA[idx].price = Number(e.target.value) || 0;
                                                    setQ({ addons: newA });
                                                }}
                                                className="w-28 pl-6 pr-2.5 py-2.5 text-xs border border-slate-200 rounded-lg focus:border-indigo-500 outline-none transition-all font-mono"
                                            />
                                        </div>
                                        <button onClick={() => setQ({ addons: q.addons.filter((_, i) => i !== idx) })} className="text-slate-300 hover:text-red-500 p-2 rounded-lg hover:bg-red-50 transition-colors">
                                            <Trash2 size={16}/>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Editable Footer Terms */}
                    <div className="bg-amber-50/50 p-5 rounded-xl border border-amber-200 shadow-sm space-y-4">
                        <h4 className="text-sm font-bold text-amber-800 border-b border-amber-200/50 pb-2 flex items-center justify-between">
                            סעיפי פוטר / תנאים
                            <button onClick={() => setQ({ terms: [...q.terms, ''] })} className="text-amber-700 hover:text-amber-800 font-bold flex items-center gap-1 text-xs bg-amber-100 px-2 py-1 rounded transition-colors">
                                <Plus size={12}/> הוסף סעיף
                            </button>
                        </h4>
                        
                        {q.terms.length === 0 ? (
                            <p className="text-xs text-amber-600/70 italic text-center py-2">לא הוגדרו תנאים</p>
                        ) : (
                            <div className="space-y-2">
                                {q.terms.map((term, idx) => (
                                    <div key={idx} className="flex gap-2 items-center">
                                        <input 
                                            placeholder="סעיף נוסף..."
                                            value={term}
                                            onChange={e => {
                                                const newT = [...q.terms];
                                                newT[idx] = e.target.value;
                                                setQ({ terms: newT });
                                            }}
                                            className="flex-1 text-xs border border-amber-200 rounded-lg p-2.5 bg-white focus:border-amber-400 outline-none transition-all"
                                        />
                                        <button onClick={() => setQ({ terms: q.terms.filter((_, i) => i !== idx) })} className="text-amber-300 hover:text-red-500 p-2 rounded-lg hover:bg-white transition-colors">
                                            <Trash2 size={16}/>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                        <p className="text-[11px] font-bold text-blue-700 mb-2">כתובת הלינק הקבוע (מתעדכן אוטומטית גם אחרי שמירה)</p>
                        <div className="flex gap-2">
                            <input readOnly value={`${window.location.origin}/quote/${leadId}?qid=${q.id}`} className="flex-1 text-xs bg-white border border-blue-200 rounded-lg px-3 text-slate-500 focus:outline-none" dir="ltr" />
                            <button onClick={() => copyLink(q.id)} className="bg-white border border-blue-200 text-blue-700 px-4 rounded-lg text-xs font-bold hover:bg-blue-100 transition-colors">העתק</button>
                            <button onClick={() => window.open(`${window.location.origin}/quote/${leadId}?qid=${q.id}`, '_blank')} className="bg-blue-600 text-white px-4 rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors">פתח בחלון חדש</button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Right Side: Live Preview */}
            <div className="w-1/2 flex flex-col bg-[#F5F2EC] h-full overflow-hidden relative">
                <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/5 to-transparent z-10 pointer-events-none flex justify-center">
                    <div className="bg-black/40 backdrop-blur-md text-white text-[10px] font-bold tracking-widest uppercase px-3 py-1 rounded-full shadow-lg border border-white/10">
                        Live Preview
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto p-4 md:p-8 lg:p-12 custom-scrollbar">
                    {/* Render the actual QuotePreview component here */}
                    <div className="max-w-[500px] mx-auto rounded-xl overflow-hidden shadow-2xl scale-[0.85] origin-top transition-transform">
                        <QuotePreview 
                            isLivePreview={true}
                            data={{
                                title: q.title,
                                description: q.description,
                                inclusions: q.inclusions,
                                terms: q.terms,
                                amount: q.amount,
                                notIncludingVat: q.notIncludingVat,
                                service: q.service,
                                date: q.date,
                                location: q.location,
                                addons: q.addons,
                                clientName: initialData.name
                            }} 
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
