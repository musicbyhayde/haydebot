'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Video, Trash2, Plus, Film, ExternalLink, RefreshCw, Save, X } from 'lucide-react';
import clsx from 'clsx';

interface VideoEntry {
    id: string;
    fields: {
        Label: string;
        URL: string;
        Category?: string;
        Is_Active: boolean;
    };
}

export default function VideosPage({ currentUser, onMenuClick }: { currentUser: any, onMenuClick: () => void }) {
    const [videos, setVideos] = useState<VideoEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [newLabel, setNewLabel] = useState('');
    const [newUrl, setNewUrl] = useState('');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        fetchVideos();
    }, []);

    const fetchVideos = async () => {
        setLoading(true);
        try {
            const data = await api.getVideos();
            setVideos(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleAddVideo = async () => {
        if (!newLabel || !newUrl) return;
        setSubmitting(true);
        try {
            await api.createVideo({
                Label: newLabel,
                URL: newUrl,
                Is_Active: true
            });
            setNewLabel('');
            setNewUrl('');
            setIsAddModalOpen(false);
            fetchVideos();
        } catch (e) {
            console.error(e);
            alert('שגיאה בהוספת הסרטון');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeleteVideo = async (id: string) => {
        if (!confirm('האם אתה בטוח שברצונך למחוק סרטון זה?')) return;
        try {
            await api.deleteVideo(id);
            setVideos(videos.filter(v => v.id !== id));
        } catch (e) {
            console.error(e);
            alert('שגיאה במחיקת הסרטון');
        }
    };

    const handleToggleActive = async (video: VideoEntry) => {
        try {
            await api.updateVideo(video.id, { Is_Active: !video.fields.Is_Active });
            setVideos(videos.map(v => v.id === video.id ? { ...v, fields: { ...v.fields, Is_Active: !v.fields.Is_Active } } : v));
        } catch (e) {
            console.error(e);
        }
    };

    return (
        <div className="flex-1 overflow-y-auto bg-slate-50 p-4 md:p-8" dir="rtl">
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-3">
                        <button onClick={onMenuClick} className="md:hidden p-2 bg-white rounded-lg shadow-sm border border-slate-200 text-slate-600">
                            <RefreshCw className="w-6 h-6" />
                        </button>
                        <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900">בנק סרטונים 📽️</h1>
                    </div>
                    <button 
                        onClick={() => setIsAddModalOpen(true)}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-xl shadow-lg shadow-indigo-100 flex items-center gap-2 transition-all"
                    >
                        <Plus className="w-5 h-5" />
                        <span className="hidden sm:inline">הוסף סרטון</span>
                    </button>
                </div>

                {loading ? (
                    <div className="flex justify-center p-12 italic text-slate-400">טוען סרטונים...</div>
                ) : videos.length === 0 ? (
                    <div className="bg-white border-2 border-dashed border-slate-200 rounded-3xl p-12 text-center">
                        <Film className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                        <p className="text-slate-500 font-medium">אין סרטונים בבנק עדיין. הוסף את הראשון!</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {videos.map(video => (
                            <div key={video.id} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
                                <div className="flex justify-between items-start mb-3">
                                    <h3 className="font-bold text-slate-800 text-lg">{video.fields.Label}</h3>
                                    <div className="flex items-center gap-1">
                                        <button 
                                            onClick={() => handleDeleteVideo(video.id)}
                                            className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                                <p className="text-xs text-slate-400 truncate mb-4 select-all" dir="ltr">{video.fields.URL}</p>
                                <div className="flex items-center justify-between">
                                    <a 
                                        href={video.fields.URL} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="text-xs font-bold text-indigo-600 flex items-center gap-1 hover:underline"
                                    >
                                        <ExternalLink className="w-3 h-3" />
                                        צפייה ביוטיוב
                                    </a>
                                    <button 
                                        onClick={() => handleToggleActive(video)}
                                        className={clsx(
                                            "text-[10px] font-bold px-2.5 py-1 rounded-full transition-all",
                                            video.fields.Is_Active 
                                                ? "bg-green-100 text-green-700 hover:bg-green-200" 
                                                : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                                        )}
                                    >
                                        {video.fields.Is_Active ? 'פעיל' : 'לא פעיל'}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Add Video Modal */}
                {isAddModalOpen && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200" dir="rtl">
                            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                                <h3 className="text-lg font-bold text-slate-800">הוספת סרטון לבנק 📹</h3>
                                <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                                    <X className="w-6 h-6" />
                                </button>
                            </div>
                            
                            <div className="p-6 space-y-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-slate-700">שם הסרטון</label>
                                    <input 
                                        type="text" 
                                        value={newLabel}
                                        onChange={(e) => setNewLabel(e.target.value)}
                                        placeholder="למשל: הופעה חיה - להקה מלאה"
                                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-slate-700">לינק (YouTube)</label>
                                    <input 
                                        type="text" 
                                        value={newUrl}
                                        onChange={(e) => setNewUrl(e.target.value)}
                                        placeholder="https://youtube.com/watch?v=..."
                                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                        dir="ltr"
                                    />
                                </div>
                            </div>

                            <div className="p-6 bg-slate-50 flex gap-3">
                                <button
                                    onClick={() => setIsAddModalOpen(false)}
                                    className="flex-1 py-2.5 text-slate-500 font-bold text-sm bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
                                >
                                    ביטול
                                </button>
                                <button
                                    onClick={handleAddVideo}
                                    disabled={submitting || !newLabel || !newUrl}
                                    className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-bold text-sm rounded-xl shadow-lg shadow-indigo-100 transition-all flex items-center justify-center gap-2"
                                >
                                    {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <span>שמור סרטון</span>}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
