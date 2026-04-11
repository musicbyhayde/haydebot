import { useState, useEffect } from 'react';
import { X, Send, Link, Plus, Trash2, CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/api';

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

export default function ProposalModal({ isOpen, onClose, leadId, initialData, onSave }: ProposalModalProps) {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [addons, setAddons] = useState<{name: string, price: number}[]>([]);
    const [saving, setSaving] = useState(false);
    const [quoteUrl, setQuoteUrl] = useState('');

    useEffect(() => {
        if (isOpen) {
            const q = initialData.quote_data || {};
            setTitle(q.title || `הצעת מחיר לאירוע של ${initialData.name}`);
            setDescription(q.description || `שמחים מאוד על פנייתכם! להלן פירוט הצעת המחיר לשירותי המוזיקה עבור האירוע הקרוב שלכם.`);
            setAddons(q.addons || []);
            setQuoteUrl(`${window.location.origin}/quote/${leadId}`);
        }
    }, [isOpen, initialData, leadId]);

    if (!isOpen) return null;

    const handleSave = async () => {
        setSaving(true);
        const quoteData = {
            title,
            description,
            addons,
            service: initialData.service,
            date: initialData.date,
            location: initialData.location,
            amount: initialData.amount,
            inclusions: [
                "צוות נגנים מקצועי",
                "הגברה ותאורה בסיסית",
                "תיאום מוזיקלי מלא מראש"
            ]
        };
        try {
            await api.updateLead(leadId, { Quote_Data: quoteData });
            onSave(quoteData);
            alert('ההצעה נשמרה. תוכל לשתף את הקישור!');
        } catch (err) {
            console.error(err);
            alert('שגיאה בשמירת ההצעה');
        } finally {
            setSaving(false);
        }
    };

    const copyLink = () => {
        navigator.clipboard.writeText(quoteUrl);
        alert('הקישור הועתק!');
    };

    const openInNewTab = () => {
        window.open(quoteUrl, '_blank');
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" dir="rtl">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2">
                        <span>📝</span> עריכת הצעת מחיר דיגיטלית
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 bg-white rounded-full p-1 border border-slate-200">
                        <X size={18} />
                    </button>
                </div>
                
                <div className="p-6 overflow-y-auto space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">כותרת ההצעה</label>
                        <input 
                            type="text" 
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">טקסט פתיחה / תיאור</label>
                        <textarea 
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none h-20 resize-none"
                        />
                    </div>

                    <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                        <h4 className="text-xs font-bold text-slate-500 mb-3 flex items-center justify-between">
                            תוספות אפשריות (לא חובה)
                            <button onClick={() => setAddons([...addons, {name: '', price: 0}])} className="text-blue-500 hover:text-blue-600 font-bold flex items-center gap-1">
                                <Plus size={12}/> הוסף
                            </button>
                        </h4>
                        
                        {addons.length === 0 ? (
                            <p className="text-xs text-slate-400 italic text-center">אין תוספות להצעה זו</p>
                        ) : (
                            <div className="space-y-2">
                                {addons.map((addon, idx) => (
                                    <div key={idx} className="flex gap-2 items-center">
                                        <input 
                                            placeholder="שם (למשל: סקסופון פריצה)"
                                            value={addon.name}
                                            onChange={e => {
                                                const newA = [...addons];
                                                newA[idx].name = e.target.value;
                                                setAddons(newA);
                                            }}
                                            className="flex-1 text-xs border rounded p-1.5"
                                        />
                                        <input 
                                            type="number"
                                            placeholder="סכום ₪"
                                            value={addon.price}
                                            onChange={e => {
                                                const newA = [...addons];
                                                newA[idx].price = Number(e.target.value);
                                                setAddons(newA);
                                            }}
                                            className="w-24 text-xs border rounded p-1.5"
                                        />
                                        <button onClick={() => setAddons(addons.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-500 p-1">
                                            <Trash2 size={14}/>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 pt-2">
                        <p className="text-[10px] font-bold text-blue-600 mb-1">כתובת הלינק הקבוע (מתעדכן אוטומטית גם אחרי שליחה)</p>
                        <div className="flex gap-2">
                            <input readOnly value={quoteUrl} className="flex-1 text-xs bg-white border border-blue-200 rounded px-2 text-slate-500" dir="ltr" />
                            <button onClick={copyLink} className="bg-white border border-blue-200 text-blue-600 px-3 rounded text-xs font-bold hover:bg-blue-50 transition-colors">העתק</button>
                            <button onClick={openInNewTab} className="bg-blue-600 text-white px-3 rounded text-xs font-bold hover:bg-blue-700 transition-colors">פתח</button>
                        </div>
                    </div>
                </div>

                <div className="p-4 border-t border-slate-100 bg-white flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 text-slate-500 text-xs font-bold">ביטול</button>
                    <button onClick={handleSave} disabled={saving} className="px-6 py-2 bg-indigo-600 text-white font-bold text-xs rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
                        {saving ? 'שומר...' : 'שמור חומרים'} <CheckCircle2 size={14}/>
                    </button>
                </div>
            </div>
        </div>
    );
}
