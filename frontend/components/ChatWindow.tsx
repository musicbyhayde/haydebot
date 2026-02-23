import { Message, Lead, Musician } from '@/types';
import { Send, Bot, CheckCheck, Paperclip, MoreVertical, Phone, Video, Image as ImageIcon, FileAudio, File as FileIcon, ArrowRight } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import clsx from 'clsx';
import { format, isToday, isYesterday } from 'date-fns';

interface ChatWindowProps {
    item: Lead | Musician | null;
    messages: Message[];
    onSend: (text: string) => Promise<void>;
    onBack?: () => void;
}

export default function ChatWindow({ item, messages, onSend, onBack }: ChatWindowProps) {
    const [inputText, setInputText] = useState("");
    const [sending, setSending] = useState(false);
    const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSendInteraction = async () => {
        if (!item || !inputText.trim()) return;
        setSending(true);
        try {
            await onSend(inputText);
            setInputText("");
        } catch (e) {
            alert("Failed to send");
        } finally {
            setSending(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendInteraction();
        }
    }

    if (!item) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center bg-slate-50/50 text-slate-400">
                <div className="bg-white p-12 rounded-3xl shadow-xl shadow-slate-200/50 flex flex-col items-center">
                    <Bot size={80} className="mb-6 opacity-20 text-blue-600" />
                    <h2 className="text-2xl font-bold text-slate-700 mb-2">Hayde InBox</h2>
                    <p className="font-medium text-slate-500">בחר נגן או ליד מהרשימה כדי להתחיל בצ׳אט</p>
                </div>
            </div>
        );
    }

    const name = item.fields.Name || item.fields.Phone;
    const isMusician = 'Is_Active' in item.fields;
    const status = isMusician ? (item.fields as any).Is_Active ? 'פעיל' : 'לא פעיל' : (item as Lead).fields.Status;
    const subtext = isMusician ? '🎻 נגן רשום' : (item as Lead).fields.Service || "🌟 ליד חדש";
    const phone = item.fields.Phone;

    // Group Messages by Date
    const groupedMessages: { [key: string]: Message[] } = {};
    messages.forEach(msg => {
        const dateObj = new Date(msg.fields.Timestamp);
        let dateStr = format(dateObj, 'dd/MM/yyyy');
        if (isToday(dateObj)) dateStr = 'היום';
        else if (isYesterday(dateObj)) dateStr = 'אתמול';

        if (!groupedMessages[dateStr]) groupedMessages[dateStr] = [];
        groupedMessages[dateStr].push(msg);
    });

    const renderMedia = (msg: Message) => {
        const url = msg.fields.Media_URL;
        const type = msg.fields.Media_Type;
        if (!url) return null;

        if (type?.startsWith('image')) {
            return (
                <div
                    className="mb-2 rounded-xl overflow-hidden border border-black/5 cursor-pointer relative group"
                    onClick={() => setFullscreenImage(url)}
                >
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                        <ImageIcon size={24} className="text-white opacity-0 group-hover:opacity-100 drop-shadow-md transition-opacity" />
                    </div>
                    <img src={url} alt="Uploaded Media" className="max-w-full h-auto max-h-64 object-cover" />
                </div>
            );
        }
        if (type?.startsWith('audio') || type?.startsWith('voice')) {
            return (
                <div className="mb-2 flex items-center gap-2 bg-black/5 p-2 rounded-xl">
                    <FileAudio size={20} className="opacity-70" />
                    <audio src={url} controls className="h-8 max-w-[200px]" />
                </div>
            );
        }
        if (type?.startsWith('video')) {
            return (
                <div className="mb-2 rounded-xl overflow-hidden border border-black/5">
                    <video src={url} controls className="max-w-full h-auto max-h-64" />
                </div>
            );
        }
        // Fallback for file
        return (
            <a href={url} target="_blank" rel="noreferrer" className="mb-2 flex items-center gap-2 p-3 bg-black/5 hover:bg-black/10 transition-colors rounded-xl text-sm font-medium">
                <FileIcon size={18} />
                <span>הורד קובץ מצורף</span>
            </a>
        );
    };

    return (
        <div className="flex-1 flex flex-col h-full bg-[#EBEAE5] relative" dir="rtl">
            {/* Header (Premium Chatwoot/Intercom feel) */}
            <div className="bg-white/80 backdrop-blur-xl px-4 md:px-6 py-4 border-b border-slate-200 flex justify-between items-center z-10 sticky top-0">
                <div className="flex items-center gap-2 md:gap-4">
                    {onBack && (
                        <button onClick={onBack} className="md:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-full transition-colors flex-shrink-0">
                            <ArrowRight size={22} />
                        </button>
                    )}
                    <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-gradient-to-tr from-blue-500 to-indigo-500 flex flex-shrink-0 items-center justify-center text-white font-bold text-lg shadow-md">
                        {name.substring(0, 1)}
                    </div>
                    <div>
                        <h3 className="font-extrabold text-lg text-slate-800 tracking-tight leading-tight">{name}</h3>
                        <div className="flex items-center gap-2 mt-0.5">
                            <span className={clsx(
                                "text-xs font-bold px-2 py-0.5 rounded-full inline-block",
                                isMusician ? "bg-purple-100 text-purple-700" : "bg-emerald-100 text-emerald-700"
                            )}>
                                {subtext}
                            </span>
                            <span className="text-xs text-slate-500 font-medium">{phone}</span>
                        </div>
                    </div>
                </div>
                <div className="flex gap-3 text-slate-400">
                    <button className="p-2 hover:bg-slate-100 rounded-full transition-colors"><Phone size={20} /></button>
                    <button className="p-2 hover:bg-slate-100 rounded-full transition-colors"><MoreVertical size={20} /></button>
                </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto px-6 py-8 space-y-6" style={{ backgroundImage: "url('https://www.transparenttextures.com/patterns/cubes.png')" }}>
                {Object.keys(groupedMessages).map((date) => (
                    <div key={date}>
                        <div className="flex justify-center mb-6">
                            <span className="bg-white/60 backdrop-blur-sm text-slate-500 text-[11px] font-bold px-4 py-1.5 rounded-full shadow-sm">
                                {date}
                            </span>
                        </div>
                        <div className="space-y-3">
                            {groupedMessages[date].map((msg) => {
                                const isOut = msg.fields.Direction === 'Outbound';
                                return (
                                    <div key={msg.id} className={clsx("flex", isOut ? "justify-start" : "justify-end")}>
                                        <div className={clsx(
                                            "max-w-[75%] rounded-2xl p-3 shadow-md relative text-[15px] group",
                                            isOut ? "bg-white text-slate-800 rounded-tr-sm border border-slate-100"
                                                : "bg-[#0b141a] text-white rounded-tl-sm"
                                        )}>
                                            {renderMedia(msg)}

                                            <div className="whitespace-pre-wrap font-sans leading-relaxed tracking-wide">
                                                {msg.fields.Content}
                                            </div>

                                            <div className={clsx(
                                                "flex justify-end items-center gap-1 mt-1 opacity-70 text-[10px]",
                                                isOut ? "text-slate-500" : "text-slate-300"
                                            )}>
                                                <span>{format(new Date(msg.fields.Timestamp), 'HH:mm')}</span>
                                                {isOut && <CheckCheck size={14} className={clsx(msg.fields.Status === 'Read' ? "text-blue-500" : "text-slate-400")} />}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
                <div ref={bottomRef} className="h-4" />
            </div>

            {/* Input Area */}
            <div className="bg-white px-6 py-4 border-t border-slate-200">
                <div className="bg-slate-50 border border-slate-200 rounded-3xl p-2 flex gap-3 items-end focus-within:ring-2 focus-within:ring-blue-100 focus-within:border-blue-300 transition-all shadow-inner">
                    <button className="p-3 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors flex-shrink-0" title="צרף קובץ">
                        <Paperclip size={20} />
                    </button>

                    <textarea
                        className="flex-1 max-h-32 min-h-[44px] py-3 bg-transparent border-none focus:outline-none focus:ring-0 resize-none text-[15px] font-medium placeholder:text-slate-400"
                        rows={1}
                        placeholder="הקלד תגובה או הודעה חדשה..."
                        value={inputText}
                        onChange={(e) => {
                            setInputText(e.target.value);
                            e.target.style.height = 'auto';
                            e.target.style.height = e.target.scrollHeight + 'px';
                        }}
                        onKeyDown={handleKeyDown}
                        dir="rtl"
                    />

                    <button
                        onClick={handleSendInteraction}
                        disabled={sending || !inputText.trim()}
                        className="bg-blue-600 text-white p-3 rounded-full hover:bg-blue-700 disabled:opacity-40 disabled:hover:bg-blue-600 transition-all shadow-md flex-shrink-0 disabled:shadow-none"
                    >
                        <Send size={20} className="mr-0.5" />
                    </button>
                </div>
            </div>

            {/* Fullscreen Image Overlay */}
            {fullscreenImage && (
                <div
                    className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4 cursor-pointer backdrop-blur-sm"
                    onClick={() => setFullscreenImage(null)}
                >
                    <button
                        className="absolute top-6 right-6 text-white/70 hover:text-white bg-black/50 hover:bg-black/70 p-3 rounded-full transition-all"
                        onClick={(e) => { e.stopPropagation(); setFullscreenImage(null); }}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                    <img
                        src={fullscreenImage}
                        alt="Fullscreen view"
                        className="max-w-full max-h-full object-contain cursor-default drop-shadow-2xl rounded-sm"
                        onClick={(e) => e.stopPropagation()} // Prevent click through to close
                    />
                </div>
            )}
        </div>
    );
}
