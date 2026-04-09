'use client';

import { useState, useEffect } from 'react';
import { X, Send, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import clsx from 'clsx';

import { Video } from '@/types';

interface SendMaterialsModalProps {
    isOpen: boolean;
    onClose: () => void;
    leadId: string;
    initialName: string;
}

export default function SendMaterialsModal({ isOpen, onClose, leadId, initialName }: SendMaterialsModalProps) {
    const [introCustomName, setIntroCustomName] = useState(initialName);
    const [selectedVideos, setSelectedVideos] = useState<string[]>([]);
    const [videoOptions, setVideoOptions] = useState<Video[]>([]);
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setIntroCustomName(initialName);
            fetchVideos();
        }
    }, [isOpen, initialName]);

    const fetchVideos = async () => {
        setLoading(true);
        try {
            const data = await api.getVideos();
            // Filter only active videos using PascalCase 'Is_Active'
            setVideoOptions(data.filter((v: Video) => v.fields.Is_Active !== false));
        } catch (e) {
            console.error('Error fetching videos:', e);
        } finally {
            setLoading(false);
        }
    };

    const handleSendIntro = async () => {
        if (!introCustomName.trim()) {
            alert('אנא הזן שם ללקוח');
            return;
        }
        setSending(true);
        try {
            await api.sendIntro(leadId, {
                custom_name: introCustomName,
                video_urls: selectedVideos
            });
            alert('החומרים נשלחו בהצלחה בווטסאפ! ✨');
            onClose();
            setSelectedVideos([]);
        } catch (e) {
            console.error('Error sending materials:', e);
            alert('שגיאה בשליחת החומרים. וודא שהתבנית מאושרת במטא.');
        } finally {
            setSending(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200" dir="rtl" onClick={(e) => e.stopPropagation()}>
                <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-green-50">
                    <div>
                        <h3 className="text-lg font-bold text-green-800">שלח חומרים בווטסאפ 🎸</h3>
                        <p className="text-[10px] text-green-600 mt-0.5">הודעת פתיחה מרשימה עם סרטונים נבחרים</p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                        <X className="w-6 h-6" />
                    </button>
                </div>
                
                <div className="p-5 space-y-5">
                    {/* Manual Name Override */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-700 block">איך לפנות אליו/ה בהודעה?</label>
                        <input 
                            type="text" 
                            value={introCustomName}
                            onChange={(e) => setIntroCustomName(e.target.value)}
                            placeholder="שם הלקוח..."
                            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-all"
                        />
                        <p className="text-[9px] text-slate-400 italic font-medium">זה השם שיופיע אחרי &quot;היי...&quot; בתבנית</p>
                    </div>

                    {/* Video Selection */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-700 block">אילו סרטונים לצרף?</label>
                        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                            {loading ? (
                                <div className="flex justify-center py-4">
                                    <RefreshCw className="w-5 h-5 animate-spin text-slate-300" />
                                </div>
                            ) : videoOptions.length === 0 ? (
                                <p className="text-[10px] text-slate-400 italic">אין סרטונים זמינים בבנק...</p>
                            ) : (
                                videoOptions.map(video => (
                                    <label key={video.id} className={clsx(
                                        "flex items-center gap-3 p-2.5 rounded-xl border cursor-pointer transition-all",
                                        selectedVideos.includes(video.fields.URL) 
                                            ? "bg-green-50 border-green-200" 
                                            : "bg-white border-slate-100 hover:border-slate-300 shadow-sm"
                                    )}>
                                        <input 
                                            type="checkbox"
                                            className="w-4 h-4 rounded text-green-600 focus:ring-green-500 border-slate-300"
                                            checked={selectedVideos.includes(video.fields.URL)}
                                            onChange={(e) => {
                                                if (e.target.checked) setSelectedVideos([...selectedVideos, video.fields.URL]);
                                                else setSelectedVideos(selectedVideos.filter(u => u !== video.fields.URL));
                                            }}
                                        />
                                        <span className="text-xs font-bold text-slate-700">{video.fields.Label}</span>
                                    </label>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                <div className="p-4 bg-slate-50 border-t border-slate-100">
                    <button
                        onClick={handleSendIntro}
                        disabled={sending || loading}
                        className="w-full bg-green-600 hover:bg-green-700 disabled:bg-slate-300 text-white font-bold py-3 rounded-xl shadow-lg shadow-green-200 transition-all flex items-center justify-center gap-2 text-sm"
                    >
                        {sending ? (
                            <RefreshCw className="w-5 h-5 animate-spin" />
                        ) : (
                            <>
                                <Send className="w-4 h-4" />
                                <span>שלח חומרים בווטסאפ</span>
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
