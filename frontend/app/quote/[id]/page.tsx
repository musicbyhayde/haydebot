'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { CheckCircle2, MapPin, Calendar, Music4, ArrowRight } from 'lucide-react';
import { notFound, useParams } from 'next/navigation';

export default function QuotePage() {
    const params = useParams();
    const leadId = params.id as string;
    
    const [quote, setQuote] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        if (!leadId) return;
        api.getPublicQuote(leadId)
            .then(data => {
                setQuote(data);
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setError(true);
                setLoading(false);
            });
    }, [leadId]);

    if (loading) {
        return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-400 font-bold">טוען הצעת מחיר...</div>;
    }

    if (error || !quote) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50" dir="rtl">
                <h1 className="text-2xl font-bold text-slate-800 mb-2">אופס!</h1>
                <p className="text-slate-500">הצעת המחיר לא נמצאה או שפג תוקפה.</p>
            </div>
        );
    }

    // Default template or dynamic from DB
    const quoteData = quote.quote_data || {};
    const title = quoteData.title || `הצעת מחיר לאירוע של ${quote.name}`;
    const description = quoteData.description || `שמחים מאוד על פנייתכם! להלן פירוט הצעת המחיר לשירותי המוזיקה עבור האירוע הקרוב שלכם.`;
    const inclusions = quoteData.inclusions || [
        "צוות נגנים מקצועי",
        "הגברה ותאורה בסיסית",
        "תיאום מוזיקלי מלא מראש"
    ];
    const amount = quoteData.amount || quote.amount;

    return (
        <div className="min-h-screen bg-slate-50 text-slate-800 font-sans selection:bg-amber-100 selection:text-amber-900" dir="rtl">
            <main className="max-w-3xl mx-auto md:py-12 md:px-6">
                
                <div className="bg-white md:rounded-3xl shadow-xl overflow-hidden border border-slate-100">
                    {/* Header Cover */}
                    <div className="bg-gradient-to-br from-slate-900 to-slate-800 px-8 py-12 text-center relative overflow-hidden">
                        {/* Decorative texture */}
                        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.8)_0,transparent_100%)]"></div>
                        <h1 className="text-3xl md:text-4xl font-black text-white relative z-10">{title}</h1>
                        <p className="mt-4 text-slate-300 relative z-10 max-w-xl mx-auto leading-relaxed">
                            {description}
                        </p>
                    </div>

                    <div className="p-8 md:p-12">
                        {/* Event Details Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
                            <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 flex items-start gap-4">
                                <div className="bg-white p-3 rounded-xl shadow-sm"><MapPin className="text-amber-500" /></div>
                                <div>
                                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">מיקום</p>
                                    <p className="font-semibold text-slate-800">{quoteData.location || quote.location || 'ייקבע בהמשך'}</p>
                                </div>
                            </div>
                            
                            <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 flex items-start gap-4">
                                <div className="bg-white p-3 rounded-xl shadow-sm"><Calendar className="text-amber-500" /></div>
                                <div>
                                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">תאריך</p>
                                    <p className="font-semibold text-slate-800">{quoteData.date || quote.date || 'ייקבע בהמשך'}</p>
                                </div>
                            </div>
                        </div>

                        {/* Package Details */}
                        <div className="mb-12">
                            <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
                                <Music4 className="text-slate-400" /> מה כלול בשירות? ({quoteData.service || quote.service})
                            </h2>
                            <ul className="space-y-4">
                                {inclusions.map((inc: string, idx: number) => (
                                    <li key={idx} className="flex items-start gap-3 text-slate-600">
                                        <CheckCircle2 className="text-emerald-500 shrink-0 mt-0.5" size={20} />
                                        <span>{inc}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {/* Pricing */}
                        <div className="bg-slate-900 rounded-3xl p-8 md:p-10 text-white flex flex-col md:flex-row items-center justify-between gap-6 overflow-hidden relative">
                            {/* Accent glow */}
                            <div className="absolute -left-20 -bottom-20 w-64 h-64 bg-amber-500/20 blur-[80px] rounded-full"></div>
            
                            <div className="relative z-10 text-center md:text-right">
                                <p className="text-amber-400 font-bold text-sm tracking-widest mb-2">סה״כ לתשלום</p>
                                <p className="text-4xl md:text-5xl font-black">
                                    ₪{Number(amount).toLocaleString()}
                                </p>
                            </div>
                            
                            {/* Extra Addons (If any) */}
                            {quoteData.addons && quoteData.addons.length > 0 && (
                                <div className="relative z-10 text-right text-sm text-slate-400 border-t md:border-t-0 md:border-r border-slate-700 pt-4 md:pt-0 md:pr-8 w-full md:w-auto">
                                    <p className="font-bold text-white mb-2">תוספות אפשריות:</p>
                                    {quoteData.addons.map((addon: any, idx: number) => (
                                        <div key={idx} className="flex justify-between gap-8 mb-1">
                                            <span>{addon.name}</span>
                                            <span className="text-slate-300 font-mono">+₪{addon.price}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                    </div>
                </div>

                {/* Footer terms */}
                <div className="text-center mt-12 text-slate-400 text-sm pb-12">
                    <p className="font-bold mb-1">Hayde Music • ייצוג אמנים והפקות מוזיקליות</p>
                    <p>הצעת המחיר תקפה ל-14 ימים בלבד • המחירים כוללים מע״מ כחוק</p>
                </div>
            </main>
        </div>
    );
}
