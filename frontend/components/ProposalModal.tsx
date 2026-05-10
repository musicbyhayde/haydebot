import { useState, useEffect } from 'react';
import { X, Send, Link, Plus, Trash2, CheckCircle2, Edit, Copy, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';

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
            alert('שגיאה בשמירת הנתונים');
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
            alert('ההצעה נשמרה בהצלחה!');
        } catch (e) {
            // Error handled in saveQuotesToDb
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('האם אתה בטוח שברצונך למחוק הצעה זו?')) return;
        const newQuotes = quotes.filter(q => q.id !== id);
        try {
            await saveQuotesToDb(newQuotes);
        } catch (e) {}
    };

    const copyLink = (id: string) => {
        const url = `${window.location.origin}/quote/${leadId}?qid=${id}`;
        navigator.clipboard.writeText(url);
        alert('הקישור להצעה זו הועתק!');
    };

    // --- List View ---
    if (view === 'list') {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" dir="rtl">
                <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
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
                            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-right text-xs">
                                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold">
                                            <tr>
                                                <th className="px-4 py-3">מס׳</th>
                                                <th className="px-4 py-3">כותרת</th>
                                                <th className="px-4 py-3">תאריך אירוע</th>
                                                <th className="px-4 py-3">סכום</th>
                                                <th className="px-4 py-3 text-center">פעולות</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {quotes.map((q, idx) => (
                                                <tr key={q.id} className="hover:bg-slate-50 transition-colors">
                                                    <td className="px-4 py-3 font-medium text-slate-500">{idx + 1}</td>
                                                    <td className="px-4 py-3 font-bold text-slate-700 max-w-[150px] truncate" title={q.title}>{q.title}</td>
                                                    <td className="px-4 py-3 text-slate-600">{q.date || '-'}</td>
                                                    <td className="px-4 py-3 text-slate-600 font-mono">₪{Number(q.amount || 0).toLocaleString()}</td>
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center justify-center gap-2">
                                                            <button 
                                                                onClick={() => { setEditingQuote(q); setView('edit'); }}
                                                                className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                                                title="עריכה"
                                                            >
                                                                <Edit size={14}/>
                                                            </button>
                                                            <button 
                                                                onClick={() => copyLink(q.id)}
                                                                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                                                                title="העתק לינק"
                                                            >
                                                                <Link size={14}/>
                                                            </button>
                                                            <button 
                                                                onClick={() => handleDelete(q.id)}
                                                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                                                title="מחק הצעה"
                                                            >
                                                                <Trash2 size={14}/>
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

    // --- Edit View ---
    if (!editingQuote) return null;
    const q = editingQuote;
    const setQ = (fields: Partial<QuoteItem>) => setEditingQuote({ ...q, ...fields });

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" dir="rtl">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                    <div className="flex items-center gap-2">
                        <button onClick={() => setView('list')} className="text-slate-400 hover:text-slate-600 bg-white rounded-full p-1 border border-slate-200 ml-2">
                            <ChevronRight size={18} />
                        </button>
                        <h3 className="font-bold text-slate-800">עריכת הצעה</h3>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 bg-white rounded-full p-1 border border-slate-200">
                        <X size={18} />
                    </button>
                </div>
                
                <div className="p-6 overflow-y-auto space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">כותרת ההצעה</label>
                        <input 
                            type="text" 
                            value={q.title}
                            onChange={e => setQ({ title: e.target.value })}
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none"
                        />
                    </div>
                    
                    <div className="flex gap-4">
                        <div className="flex-1">
                            <label className="block text-xs font-bold text-slate-500 mb-1">תאריך האירוע</label>
                            <input 
                                type="text" 
                                value={q.date}
                                onChange={e => setQ({ date: e.target.value })}
                                placeholder="למשל: 7.7.26 או סופ״ש קרוב"
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none"
                            />
                        </div>
                        <div className="flex-1">
                            <label className="block text-xs font-bold text-slate-500 mb-1">סכום ההצעה (₪)</label>
                            <input 
                                type="number" 
                                value={q.amount || ''}
                                onChange={e => setQ({ amount: Number(e.target.value) || 0 })}
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none"
                            />
                            <label className="flex items-center gap-1.5 mt-2 cursor-pointer w-max">
                                <input 
                                    type="checkbox" 
                                    checked={q.notIncludingVat} 
                                    onChange={e => setQ({ notIncludingVat: e.target.checked })} 
                                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
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
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none h-20 resize-none"
                        />
                    </div>

                    {/* Editable Inclusions */}
                    <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                        <h4 className="text-xs font-bold text-slate-500 mb-3 flex items-center justify-between">
                            מה כלול בשירות (פריטים)
                            <button onClick={() => setQ({ inclusions: [...q.inclusions, ''] })} className="text-blue-500 hover:text-blue-600 font-bold flex items-center gap-1">
                                <Plus size={12}/> הוסף
                            </button>
                        </h4>
                        
                        {q.inclusions.length === 0 ? (
                            <p className="text-xs text-slate-400 italic text-center">לא הוגדרו פריטים כלולים</p>
                        ) : (
                            <div className="space-y-2">
                                {q.inclusions.map((inc, idx) => (
                                    <div key={idx} className="flex gap-2 items-center">
                                        <input 
                                            placeholder="למשל: צוות נגנים מקצועי"
                                            value={inc}
                                            onChange={e => {
                                                const newI = [...q.inclusions];
                                                newI[idx] = e.target.value;
                                                setQ({ inclusions: newI });
                                            }}
                                            className="flex-1 text-xs border rounded p-1.5"
                                        />
                                        <button onClick={() => setQ({ inclusions: q.inclusions.filter((_, i) => i !== idx) })} className="text-red-400 hover:text-red-500 p-1">
                                            <Trash2 size={14}/>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Editable Addons */}
                    <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                        <h4 className="text-xs font-bold text-slate-500 mb-3 flex items-center justify-between">
                            תוספות אפשריות (לא חובה)
                            <button onClick={() => setQ({ addons: [...q.addons, {name: '', price: 0}] })} className="text-blue-500 hover:text-blue-600 font-bold flex items-center gap-1">
                                <Plus size={12}/> הוסף
                            </button>
                        </h4>
                        
                        {q.addons.length === 0 ? (
                            <p className="text-xs text-slate-400 italic text-center">אין תוספות להצעה זו</p>
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
                                            className="flex-1 text-xs border rounded p-1.5"
                                        />
                                        <input 
                                            type="number"
                                            placeholder="סכום ₪"
                                            value={addon.price || ''}
                                            onChange={e => {
                                                const newA = [...q.addons];
                                                newA[idx].price = Number(e.target.value) || 0;
                                                setQ({ addons: newA });
                                            }}
                                            className="w-24 text-xs border rounded p-1.5"
                                        />
                                        <button onClick={() => setQ({ addons: q.addons.filter((_, i) => i !== idx) })} className="text-red-400 hover:text-red-500 p-1">
                                            <Trash2 size={14}/>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Editable Footer Terms */}
                    <div className="border border-amber-200 rounded-lg p-4 bg-amber-50">
                        <h4 className="text-xs font-bold text-amber-700 mb-3 flex items-center justify-between">
                            📋 סעיפי פוטר / תנאים
                            <button onClick={() => setQ({ terms: [...q.terms, ''] })} className="text-amber-600 hover:text-amber-700 font-bold flex items-center gap-1">
                                <Plus size={12}/> הוסף סעיף
                            </button>
                        </h4>
                        
                        {q.terms.length === 0 ? (
                            <p className="text-xs text-amber-500 italic text-center">לא הוגדרו תנאים</p>
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
                                            className="flex-1 text-xs border border-amber-200 rounded p-1.5 bg-white"
                                        />
                                        <button onClick={() => setQ({ terms: q.terms.filter((_, i) => i !== idx) })} className="text-red-400 hover:text-red-500 p-1">
                                            <Trash2 size={14}/>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 pt-2">
                        <p className="text-[10px] font-bold text-blue-600 mb-1">כתובת הלינק הקבוע (מתעדכן אוטומטית גם אחרי שמירה)</p>
                        <div className="flex gap-2">
                            <input readOnly value={`${window.location.origin}/quote/${leadId}?qid=${q.id}`} className="flex-1 text-xs bg-white border border-blue-200 rounded px-2 text-slate-500" dir="ltr" />
                            <button onClick={() => copyLink(q.id)} className="bg-white border border-blue-200 text-blue-600 px-3 rounded text-xs font-bold hover:bg-blue-50 transition-colors">העתק</button>
                            <button onClick={() => window.open(`${window.location.origin}/quote/${leadId}?qid=${q.id}`, '_blank')} className="bg-blue-600 text-white px-3 rounded text-xs font-bold hover:bg-blue-700 transition-colors">פתח</button>
                        </div>
                    </div>
                </div>

                <div className="p-4 border-t border-slate-100 bg-white flex items-center justify-end">
                    <div className="flex gap-2">
                        <button onClick={() => setView('list')} className="px-4 py-2 text-slate-500 text-xs font-bold">ביטול עריכה</button>
                        <button onClick={handleSaveEdit} disabled={saving} className="px-6 py-2 bg-indigo-600 text-white font-bold text-xs rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
                            {saving ? 'שומר...' : 'שמור הצעה'} <CheckCircle2 size={14}/>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
