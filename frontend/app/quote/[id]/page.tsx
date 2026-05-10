'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { notFound, useParams, useSearchParams } from 'next/navigation';

export default function QuotePage() {
    const params = useParams();
    const leadId = params.id as string;
    const searchParams = useSearchParams();
    const qid = searchParams.get('qid');

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
        return <div className="min-h-screen flex items-center justify-center bg-[#FAF9F6] text-[#B8986D] font-serif italic text-lg tracking-widest">טוען...</div>;
    }

    let activeQuoteData = null;
    if (quote && quote.quote_data) {
        if (Array.isArray(quote.quote_data.quotes) && quote.quote_data.quotes.length > 0) {
            if (qid) {
                activeQuoteData = quote.quote_data.quotes.find((q: any) => q.id === qid);
            }
            if (!activeQuoteData) {
                activeQuoteData = quote.quote_data.quotes[quote.quote_data.quotes.length - 1];
            }
        } else if (Object.keys(quote.quote_data).length > 0 && !quote.quote_data.quotes) {
            activeQuoteData = quote.quote_data;
        }
    }

    const noQuote = error || !quote || !activeQuoteData;

    if (noQuote) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-[#FAF9F6] px-6" dir="rtl">
                <div className="bg-white rounded p-10 max-w-md text-center border border-[#EBE6DD] shadow-xl">
                    <div className="text-4xl mb-4 opacity-50">📄</div>
                    <h1 className="text-xl font-bold text-slate-800 mb-2">הצעת המחיר לא נמצאה</h1>
                    <p className="text-slate-500 mb-6 text-sm">
                        הצעת המחיר שחיפשת אינה קיימת, פג תוקפה או הוסרה מהמערכת.
                    </p>
                    <a
                        href="https://haydemusic.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block bg-[#B8986D] hover:bg-[#a6865a] text-white font-medium px-6 py-2 transition-colors uppercase tracking-widest text-xs"
                    >
                        לאתר הבית
                    </a>
                </div>
            </div>
        );
    }

    // Dynamic data from DB
    const quoteData = activeQuoteData;
    const title = quoteData.title || `הצעת מחיר - ${quote.name}`;
    const description = quoteData.description || `היידה תספק את השירותים המוסיקליים והטכניים הבאים:`;
    const inclusions: string[] = quoteData.inclusions || [];
    const terms: string[] = quoteData.terms || [
        "דמי ביטול ב-7 ימי עסקים שלפני האירוע ועד 48 שעות לפני האירוע חצי מדמי ההפקה כולל מע\"מ",
        "ביטול האירוע ב-48 השעות לפני תחילת האירוע יגררו חיוב מלא.",
        "במידה והנחיות פיקוד העורף לא יאפשרו את קיום האירוע לא יגבו דמי ביטול.",
        "אישור הצעה זו בהודעה חוזרת."
    ];
    const amount = quoteData.amount !== undefined ? quoteData.amount : quote.amount;

    return (
        <div className="min-h-screen bg-[#F5F2EC] font-sans selection:bg-[#EBE6DD] selection:text-slate-900 md:py-10" dir="rtl">
            <main className="max-w-[850px] mx-auto bg-[#FDFBF7] min-h-[1100px] shadow-2xl relative print:shadow-none print:m-0 print:p-0">

                {/* Background watermark logo */}
                <div className="absolute left-1/4 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-[0.02] pointer-events-none select-none z-0 hidden md:block w-full max-w-[600px]">
                    <img src="/logos/haydeLogo.png" alt="" className="w-full h-auto grayscale" />
                </div>

                <div className="relative z-10">
                    {/* Header Top Layer */}
                    <div className="pt-12 md:pt-16 px-8 md:px-16 flex justify-between items-start mb-8">
                        {/* Contact Info (Left) */}
                        <div className="text-[#AF9470] font-bold text-xs md:text-sm leading-relaxed tracking-wide pt-2 md:pt-4">
                            <p>היידה - מוסיקה לאירועים</p>
                            <p><a href="https://haydemusic.com" target="_blank" rel="noopener noreferrer" className="hover:opacity-80 transition-opacity">haydemusic.com</a></p>
                            <p><a href="tel:055-9662885" className="hover:opacity-80 transition-opacity" dir="ltr">055-9662885</a></p>
                            <p className="mt-2 text-[#AF9470]"><a href="mailto:musicbyhayde@gmail.com" className="hover:opacity-80 transition-opacity">musicbyhayde@gmail.com</a></p>
                        </div>

                        {/* Logo (Right) */}
                        <div className="relative">
                            <img src="/logos/haydeLogo.png" alt="Hayde Music" className="h-32 md:h-44 object-contain" />
                        </div>
                    </div>

                    {/* Ribbon Title */}
                    <div className="bg-[#EFEBE4] w-full py-2.5 px-8 md:px-16 flex items-center mb-12">
                        <h1 className="text-slate-800 font-bold text-lg md:text-xl">{title}</h1>
                    </div>

                    {/* Intro Event Details */}
                    <div className="px-8 md:px-16 mb-8 text-slate-800">
                        <p className="text-base md:text-lg font-bold mb-4">
                            עבור {quoteData.service === 'Bouzouki' ? 'אירוע בוזוקי' : 'אירוע'} שיערך בתאריך {quoteData.date || quote.date || '___'} ב{quote.fields?.Location || quoteData.location || '___'}.
                        </p>
                        <p className="text-slate-700">{description}</p>
                    </div>

                    {/* Inclusions */}
                    <div className="px-8 md:px-16 space-y-6 mb-16">
                        {inclusions.length > 0 ? (
                            inclusions.map((inc: string, idx: number) => {
                                // Simple parser: if the line contains a dash or is a bold statement, format it
                                // Alternatively, we format the first line boldly and the rest normally
                                const lines = inc.split('\n');
                                const heading = lines[0];
                                const body = lines.slice(1).join(' ');

                                return (
                                    <div key={idx} className="mb-6">
                                        <h3 className="font-bold text-slate-800 text-lg mb-1">{heading}</h3>
                                        {(body || !inc.includes('\n')) && (
                                            <p className="text-slate-600 leading-relaxed text-sm md:text-base">
                                                {body || (lines.length === 1 ? '' : '')}
                                            </p>
                                        )}
                                    </div>
                                );
                            })
                        ) : (
                            <div className="text-slate-400 italic">לא פורטו שירותים במסמך זה.</div>
                        )}
                    </div>

                    {/* Pricing */}
                    <div className="px-8 md:px-16 mb-16">
                        <div className="border-t border-slate-200 pt-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
                            <p className="text-lg md:text-xl font-bold text-slate-800 flex items-baseline gap-2">
                                <span>מחיר: {Number(amount).toLocaleString()} ש״ח</span>
                                {quoteData.notIncludingVat && <span className="text-sm font-normal text-slate-500">(לא כולל מע״מ)</span>}
                            </p>

                            {quoteData.addons && quoteData.addons.length > 0 && (
                                <div className="text-sm text-slate-500 bg-[#FAF9F6] p-4 border border-slate-100">
                                    <p className="font-bold text-slate-700 mb-2">תוספות אפשריות:</p>
                                    <div className="space-y-1">
                                        {quoteData.addons.map((addon: any, idx: number) => (
                                            <div key={idx} className="flex justify-between gap-6">
                                                <span>{addon.name}</span>
                                                <span className="font-mono">+₪{addon.price}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Terms */}
                    <div className="px-8 md:px-16 pb-16 pt-8 mt-auto">
                        <ul className="space-y-1.5 md:space-y-2 w-full md:w-3/4 mr-auto pr-[20%] text-[10px] md:text-xs text-slate-600 list-none">
                            {terms.map((term: string, idx: number) => (
                                <li key={idx} className="relative before:content-['•'] before:absolute before:-right-4 before:text-[#B8986D] before:font-bold">
                                    {term}
                                </li>
                            ))}
                        </ul>
                    </div>

                </div>
            </main>
        </div>
    );
}
