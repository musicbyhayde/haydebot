'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { notFound, useParams, useSearchParams } from 'next/navigation';
import QuotePreview from '@/components/QuotePreview';

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
            <QuotePreview data={{
                title,
                description,
                inclusions,
                terms,
                amount,
                notIncludingVat: quoteData.notIncludingVat,
                service: quoteData.service,
                date: quoteData.date || quote.date,
                location: quote.fields?.Location || quoteData.location,
                addons: quoteData.addons
            }} />
        </div>
    );
}
