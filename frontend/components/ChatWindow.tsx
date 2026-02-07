import { Message, Lead, Musician } from '@/types';
import { Send, Bot, CheckCheck } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import clsx from 'clsx';

interface ChatWindowProps {
    item: Lead | Musician | null;
    messages: Message[];
    onSend: (text: string) => Promise<void>;
}

export default function ChatWindow({ item, messages, onSend }: ChatWindowProps) {
    const [inputText, setInputText] = useState("");
    const [sending, setSending] = useState(false);
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
            <div className="flex-1 flex items-center justify-center bg-slate-50 text-slate-300 flex-col gap-4">
                <Bot size={80} className="opacity-10" />
                <p className="font-medium text-lg">בחר שיחה כדי להתחיל להתכתב 🎸</p>
            </div>
        );
    }

    const name = item.fields.Name || item.fields.Phone;
    const isMusician = 'Is_Active' in item.fields;
    const status = isMusician ? (item.fields as any).Is_Active ? 'Active' : 'Inactive' : (item as Lead).fields.Status;
    const subtext = isMusician ? 'נגן רשום' : (item as Lead).fields.Service || "ליד חדש";

    return (
        <div className="flex-1 flex flex-col h-full bg-[#f0f2f5]">
            {/* Header */}
            <div className="bg-white p-4 border-b border-gray-200 flex justify-between items-center shadow-sm z-10">
                <div className="text-right w-full" dir="rtl">
                    <h3 className="font-bold text-lg text-slate-800">{name}</h3>
                    <span className={clsx(
                        "text-xs font-bold",
                        isMusician ? "text-purple-600" : "text-blue-600"
                    )}>
                        {subtext} • {status}
                    </span>
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {messages.map((msg) => {
                    const isOut = msg.fields.Direction === 'Outbound';
                    return (
                        <div key={msg.id} className={clsx("flex", isOut ? "justify-end" : "justify-start")}>
                            <div className={clsx(
                                "max-w-[75%] rounded-2xl p-3 shadow-sm relative text-sm",
                                isOut ? "bg-slate-900 text-white rounded-tr-none" : "bg-white text-slate-800 rounded-tl-none"
                            )}>
                                <pre className="whitespace-pre-wrap font-sans">{msg.fields.Content}</pre>

                                <div className={clsx(
                                    "flex justify-end items-center gap-1 mt-1 opacity-60 text-[10px]",
                                    isOut ? "text-slate-300" : "text-slate-500"
                                )}>
                                    <span>{new Date(msg.fields.Timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                    {isOut && <CheckCheck size={12} className={clsx(msg.fields.Status === 'Read' ? "text-blue-400" : "text-slate-400")} />}
                                </div>
                            </div>
                        </div>
                    );
                })}
                <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="bg-white border-t border-slate-100 p-4 flex gap-3 items-end">
                <textarea
                    className="flex-1 p-3 rounded-2xl bg-slate-100 border-none focus:ring-2 focus:ring-blue-500 transition-all resize-none max-h-32 text-sm"
                    rows={1}
                    placeholder="הקלד הודעה..."
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    dir="rtl"
                />
                <button
                    onClick={handleSendInteraction}
                    disabled={sending || !inputText.trim()}
                    className="bg-blue-600 text-white p-3 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-all shadow-lg shadow-blue-100"
                >
                    <Send size={20} />
                </button>
            </div>
        </div>
    );
}
