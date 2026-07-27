import React from 'react';

export interface QuotePreviewData {
    title: string;
    description: string;
    date: string;
    location: string;
    service: string;
    amount: number;
    notIncludingVat: boolean;
    inclusions: string[];
    addons: { name: string, price: number }[];
    terms: string[];
    clientName?: string;
}

interface QuotePreviewProps {
    data: QuotePreviewData;
    isLivePreview?: boolean;
}

export default function QuotePreview({ data, isLivePreview = false }: QuotePreviewProps) {
    const title = data.title || (data.clientName ? `הצעת מחיר - ${data.clientName}` : 'הצעת מחיר');
    const description = data.description;
    const inclusions = data.inclusions || [];
    const terms = data.terms || [];
    const amount = data.amount || 0;

    return (
        <div className={`bg-[#FDFBF7] shadow-2xl relative ${isLivePreview ? 'w-full h-full overflow-y-auto min-h-0' : 'max-w-[850px] mx-auto min-h-[1100px] print:shadow-none print:m-0 print:p-0'}`} dir="rtl">
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
                        עבור {data.service === 'Bouzouki' ? 'אירוע בוזוקי' : 'אירוע'} שיערך בתאריך {data.date || '___'} ב{data.location || '___'}.
                    </p>
                    <p className="text-slate-700 whitespace-pre-wrap leading-relaxed">{description}</p>
                </div>

                {/* Inclusions */}
                <div className="px-8 md:px-16 space-y-6 mb-16">
                    {inclusions.length > 0 ? (
                        inclusions.map((inc, idx) => {
                            const lines = inc.split('\n');
                            const heading = lines[0];
                            const body = lines.slice(1).join(' ');

                            return (
                                <div key={idx} className="mb-6">
                                    <h3 className="font-bold text-slate-800 text-lg mb-1">{heading}</h3>
                                    {(body || !inc.includes('\n')) && (
                                        <p className="text-slate-600 leading-relaxed text-sm md:text-base">
                                            {body}
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
                            {data.notIncludingVat && <span className="text-sm font-normal text-slate-500">(לא כולל מע״מ)</span>}
                        </p>

                        {data.addons && data.addons.length > 0 && (
                            <div className="text-sm text-slate-500 bg-[#FAF9F6] p-4 border border-slate-100 rounded-lg">
                                <p className="font-bold text-slate-700 mb-2">תוספות אפשריות:</p>
                                <div className="space-y-1">
                                    {data.addons.map((addon, idx) => (
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
                        {terms.map((term, idx) => (
                            <li key={idx} className="relative before:content-['•'] before:absolute before:-right-4 before:text-[#B8986D] before:font-bold">
                                {term}
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    );
}
