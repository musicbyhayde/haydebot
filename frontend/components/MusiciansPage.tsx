'use client';

import { useState, useEffect } from 'react';
import { Musician, Message } from '@/types';
import { api } from '@/lib/api';
import { AppUser } from '@/lib/auth';
import {
    Plus, Trash2, Edit, Check, X, Star, Music, Menu,
    TrendingUp, Users, Award, DollarSign, AlertTriangle,
    ChevronDown, ChevronUp, MessageSquare, Send
} from 'lucide-react';
import clsx from 'clsx';

interface MusiciansPageProps {
    currentUser?: AppUser | null;
    onMenuClick?: () => void;
}

interface MusicianStats {
    received: number;
    closed: number;
    lost: number;
    revenue: number;
    commission: number;
}

export default function MusiciansPage({ onMenuClick }: MusiciansPageProps) {
    const [musicians, setMusicians] = useState<Musician[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddForm, setShowAddForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<Partial<Musician['fields']>>({});
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [stats, setStats] = useState<Record<string, MusicianStats>>({});
    const [loadingStats, setLoadingStats] = useState<string | null>(null);

    // Chat state
    const [chatMusicianId, setChatMusicianId] = useState<string | null>(null);
    const [chatMessages, setChatMessages] = useState<Message[]>([]);
    const [chatInput, setChatInput] = useState('');
    const [sendingChat, setSendingChat] = useState(false);

    // Add form
    const [form, setForm] = useState({
        Name: '',
        Phone: '',
        Score: 5,
        Is_Active: true,
        Type: 'REFERRER' as 'REFERRER' | 'POOL',
        Email: '',
    });

    useEffect(() => {
        fetchMusicians();
    }, []);

    const fetchMusicians = async () => {
        try {
            const data = await api.getMusicians();
            setMusicians(data);
        } catch (e) {
            console.error('Failed to fetch musicians:', e);
        } finally {
            setLoading(false);
        }
    };

    const fetchStats = async (musicianId: string) => {
        if (stats[musicianId]) return; // Already cached
        setLoadingStats(musicianId);
        try {
            const data = await api.getMusicianStats(musicianId);
            setStats(prev => ({ ...prev, [musicianId]: data }));
        } catch (e) {
            console.error('Failed to fetch stats:', e);
        } finally {
            setLoadingStats(null);
        }
    };

    const fetchChatMessages = async (musicianId: string) => {
        try {
            const data = await api.getMusicianMessages(musicianId);
            setChatMessages(data);
        } catch (e) {
            console.error('Failed to fetch chat:', e);
        }
    };

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.Name.trim() || !form.Phone.trim()) return;
        try {
            const created = await api.createMusician(form);
            setMusicians([created, ...musicians]);
            setForm({ Name: '', Phone: '', Score: 5, Is_Active: true, Type: 'REFERRER', Email: '' });
            setShowAddForm(false);
        } catch (e) {
            console.error('Failed to create musician:', e);
            alert('שגיאה ביצירת נגן');
        }
    };

    const startEdit = (m: Musician) => {
        setEditingId(m.id);
        setEditForm({
            Name: m.fields.Name,
            Phone: m.fields.Phone,
            Score: m.fields.Score ?? 5,
            Is_Active: m.fields.Is_Active ?? true,
            Type: m.fields.Type ?? 'REFERRER',
            Email: m.fields.Email || '',
        });
    };

    const saveEdit = async (id: string) => {
        try {
            const updated = await api.updateMusician(id, editForm);
            setMusicians(musicians.map(m => m.id === id ? updated : m));
            setEditingId(null);
        } catch (e) {
            console.error('Failed to update musician:', e);
            alert('שגיאה בעדכון נגן');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('למחוק את הנגן?')) return;
        try {
            await api.deleteMusician(id);
            setMusicians(musicians.filter(m => m.id !== id));
            if (expandedId === id) setExpandedId(null);
        } catch (e) {
            console.error('Failed to delete musician:', e);
            alert('שגיאה במחיקת נגן');
        }
    };

    const toggleExpand = (id: string) => {
        if (expandedId === id) {
            setExpandedId(null);
            setChatMusicianId(null);
        } else {
            setExpandedId(id);
            fetchStats(id);
            setChatMusicianId(null);
        }
    };

    const openChat = (musicianId: string) => {
        setChatMusicianId(musicianId);
        fetchChatMessages(musicianId);
    };

    const handleSendChat = async () => {
        if (!chatMusicianId || !chatInput.trim()) return;
        setSendingChat(true);
        try {
            await api.sendMusicianMessage(chatMusicianId, chatInput.trim());
            setChatInput('');
            fetchChatMessages(chatMusicianId);
        } catch (e) {
            console.error('Failed to send message:', e);
            alert('שגיאה בשליחת הודעה');
        } finally {
            setSendingChat(false);
        }
    };

    const formatCurrency = (n: number) =>
        new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);

    const activeCount = musicians.filter(m => m.fields.Is_Active !== false).length;
    const inactiveCount = musicians.length - activeCount;

    const renderScoreStars = (score: number) => {
        const stars = [];
        const filled = Math.round(score / 2); // 10-scale to 5-star
        for (let i = 0; i < 5; i++) {
            stars.push(
                <Star
                    key={i}
                    size={14}
                    className={clsx(
                        i < filled ? 'text-amber-400 fill-amber-400' : 'text-slate-200'
                    )}
                />
            );
        }
        return <div className="flex items-center gap-0.5">{stars}</div>;
    };

    const renderStatsCards = (musicianId: string) => {
        const s = stats[musicianId];
        if (loadingStats === musicianId) {
            return <div className="text-sm text-slate-400 py-4 text-center">טוען סטטיסטיקות...</div>;
        }
        if (!s) return null;

        return (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 p-4">
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-center">
                    <div className="text-[10px] font-bold text-blue-600 uppercase flex items-center justify-center gap-1">
                        <Users size={11} /> הופץ
                    </div>
                    <div className="text-xl font-extrabold text-blue-700">{s.received}</div>
                </div>
                <div className="bg-green-50 border border-green-100 rounded-xl p-3 text-center">
                    <div className="text-[10px] font-bold text-green-600 uppercase flex items-center justify-center gap-1">
                        <Award size={11} /> נסגר
                    </div>
                    <div className="text-xl font-extrabold text-green-700">{s.closed}</div>
                </div>
                <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-center">
                    <div className="text-[10px] font-bold text-red-600 uppercase flex items-center justify-center gap-1">
                        <AlertTriangle size={11} /> אבד
                    </div>
                    <div className="text-xl font-extrabold text-red-700">{s.lost}</div>
                </div>
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-center">
                    <div className="text-[10px] font-bold text-amber-600 uppercase flex items-center justify-center gap-1">
                        <TrendingUp size={11} /> הכנסה
                    </div>
                    <div className="text-lg font-extrabold text-amber-700">{formatCurrency(s.revenue)}</div>
                </div>
                <div className="bg-purple-50 border border-purple-100 rounded-xl p-3 text-center">
                    <div className="text-[10px] font-bold text-purple-600 uppercase flex items-center justify-center gap-1">
                        <DollarSign size={11} /> עמלה
                    </div>
                    <div className="text-lg font-extrabold text-purple-700">{formatCurrency(s.commission)}</div>
                </div>
            </div>
        );
    };

    if (loading) {
        return <div className="flex-1 flex items-center justify-center text-slate-400 font-bold">טוען נגנים... 🎸</div>;
    }

    return (
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50" dir="rtl">
            {/* Header */}
            <div className="px-4 md:px-6 py-4 border-b border-slate-200 bg-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                    {onMenuClick && (
                        <button onClick={onMenuClick} className="md:hidden p-2 hover:bg-slate-100 rounded-lg">
                            <Menu size={20} />
                        </button>
                    )}
                    <div>
                        <h1 className="text-xl md:text-2xl font-extrabold text-slate-800">🎸 ניהול נגנים</h1>
                        <p className="text-xs text-slate-500">
                            {activeCount} פעילים · {inactiveCount} לא פעילים
                        </p>
                    </div>
                </div>
                <button
                    onClick={() => setShowAddForm(!showAddForm)}
                    className="flex items-center gap-1.5 px-4 py-2.5 bg-purple-600 text-white text-sm font-bold rounded-xl hover:bg-purple-700 transition-all shadow-md shadow-purple-200"
                >
                    <Plus size={16} /> הוסף נגן
                </button>
            </div>

            {/* Add Form Modal */}
            {showAddForm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowAddForm(false)}>
                    <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                        <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h3 className="font-extrabold text-slate-800 flex items-center gap-2">
                                <Plus size={16} className="text-purple-600" /> הוסף מנהל מסע / נגן
                            </h3>
                            <button onClick={() => setShowAddForm(false)} className="text-slate-400 hover:text-slate-600 hover:bg-slate-200 p-1.5 rounded-lg transition-colors"><X size={18} /></button>
                        </div>
                        <div className="px-5 py-4 overflow-y-auto">
                            <form id="add-musician-form" onSubmit={handleAdd} className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-500 mb-1">שם הנגן *</label>
                                        <input type="text" value={form.Name} onChange={(e) => setForm({ ...form, Name: e.target.value })} placeholder="למשל: יוסי כהן" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white focus:ring-2 focus:ring-purple-300 outline-none" required />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-500 mb-1">טלפון *</label>
                                        <input type="text" value={form.Phone} onChange={(e) => setForm({ ...form, Phone: e.target.value })} placeholder="972501234567" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white focus:ring-2 focus:ring-purple-300 outline-none" dir="ltr" required />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-500 mb-1">אימייל (לזימון יומן)</label>
                                        <input type="email" value={form.Email} onChange={(e) => setForm({ ...form, Email: e.target.value })} placeholder="email@example.com" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white focus:ring-2 focus:ring-purple-300 outline-none" dir="ltr" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-500 mb-1">ציון (1-10)</label>
                                        <div className="flex items-center gap-2 h-9">
                                            <input type="range" min="1" max="10" value={form.Score} onChange={(e) => setForm({ ...form, Score: parseInt(e.target.value) })} className="flex-1 accent-purple-600" />
                                            <span className="text-xs font-bold text-purple-700 w-6 text-center">{form.Score}</span>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-500 mb-1">סטטוס</label>
                                        <button type="button" onClick={() => setForm({ ...form, Is_Active: !form.Is_Active })} className={clsx("w-full px-3 py-2 rounded-lg text-xs font-bold transition-all border", form.Is_Active ? "bg-green-50 text-green-700 border-green-200" : "bg-slate-50 text-slate-500 border-slate-200")}>
                                            {form.Is_Active ? '✅ פעיל' : '⏸️ לא פעיל'}
                                        </button>
                                    </div>
                                </div>
                            </form>
                            <div className="mt-4">
                                <label className="block text-[10px] font-bold text-slate-500 mb-2">סוג נגן (הפניות או מאגר צוות)</label>
                                <div className="flex gap-2">
                                    <button 
                                        type="button"
                                        onClick={() => setForm({ ...form, Type: 'REFERRER' })}
                                        className={clsx(
                                            "flex-1 px-3 py-2 rounded-lg text-xs font-bold border transition-all",
                                            form.Type === 'REFERRER' ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-white text-slate-400 border-slate-100"
                                        )}
                                    >
                                        📢 בוזוקי (הפניות)
                                    </button>
                                    <button 
                                        type="button"
                                        onClick={() => setForm({ ...form, Type: 'POOL' })}
                                        className={clsx(
                                            "flex-1 px-3 py-2 rounded-lg text-xs font-bold border transition-all",
                                            form.Type === 'POOL' ? "bg-purple-50 text-purple-700 border-purple-200" : "bg-white text-slate-400 border-slate-100"
                                        )}
                                    >
                                        🎹 מאגר (צוות)
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div className="px-5 py-4 border-t border-slate-100 bg-slate-50 flex gap-2 justify-end">
                            <button onClick={() => setShowAddForm(false)} className="px-4 py-2 text-slate-500 text-xs font-bold hover:text-slate-700">ביטול</button>
                            <button type="submit" form="add-musician-form" className="px-6 py-2 bg-purple-600 text-white text-xs font-bold rounded-lg hover:bg-purple-700 transition-all shadow-md">צור נגן</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Musicians List */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6">
                {musicians.length === 0 ? (
                    <div className="text-center py-16 text-slate-400">
                        <Music size={48} className="mx-auto mb-4 text-slate-200" />
                        <p className="text-lg font-bold">אין נגנים במערכת</p>
                        <p className="text-sm">לחץ על &quot;הוסף נגן&quot; להתחיל</p>
                    </div>
                ) : (
                    <div className="flex flex-col border border-slate-200 rounded-xl bg-white overflow-x-auto shadow-sm">
                        <div className="flex flex-col min-w-[600px]">
                            {/* Header Row */}
                            <div className="flex items-center px-4 md:px-6 py-2 text-[10px] font-bold text-slate-400 border-b border-slate-100 uppercase bg-slate-50">
                                <div className="flex-1 min-w-[120px]">שם הנגן</div>
                            <div className="w-32 shrink-0 hidden md:flex">טלפון</div>
                            <div className="w-24 shrink-0 hidden md:flex text-center justify-center">סטטוס</div>
                            <div className="w-20 shrink-0 hidden md:flex text-center justify-center">סוג</div>
                            <div className="w-28 shrink-0 hidden md:flex">ציון</div>
                            <div className="w-32 shrink-0 flex justify-end">פעולות</div>
                        </div>
                        {musicians.map(m => {
                            const isEditing = editingId === m.id;
                            const isExpanded = expandedId === m.id;
                            const isActive = m.fields.Is_Active !== false;

                            return (
                                <div
                                    key={m.id}
                                    className={clsx(
                                        "flex flex-col border-b border-slate-100 transition-all group bg-white",
                                        isExpanded && "bg-purple-50/30",
                                        !isActive && "opacity-60"
                                    )}
                                >
                                    {/* Main Row */}
                                    {isEditing ? (
                                        <div className="flex items-center px-4 md:px-6 py-2 bg-amber-50 gap-3 text-xs w-full">
                                            <div className="flex-1 min-w-[120px]">
                                                <input type="text" value={editForm.Name} onChange={(e) => setEditForm({ ...editForm, Name: e.target.value })} className="w-full px-2 py-1 border border-slate-200 rounded text-xs bg-white" placeholder="שם" />
                                            </div>
                                            <div className="w-32 hidden md:block">
                                                <input type="text" value={editForm.Phone} onChange={(e) => setEditForm({ ...editForm, Phone: e.target.value })} className="w-full px-2 py-1 border border-slate-200 rounded text-xs bg-white" dir="ltr" placeholder="טלפון" />
                                            </div>
                                            <div className="w-40 hidden md:block">
                                                <input type="email" value={editForm.Email} onChange={(e) => setEditForm({ ...editForm, Email: e.target.value })} className="w-full px-2 py-1 border border-slate-200 rounded text-xs bg-white" dir="ltr" placeholder="אימייל" />
                                            </div>
                                            <div className="w-24 hidden md:flex items-center justify-center">
                                                <button type="button" onClick={() => setEditForm({ ...editForm, Is_Active: !editForm.Is_Active })} className={clsx("px-2 py-0.5 rounded text-[10px] font-bold w-full border", editForm.Is_Active ? "bg-green-50 text-green-700 border-green-200" : "bg-slate-50 text-slate-500 border-slate-200")}>
                                                    {editForm.Is_Active ? 'פעיל' : 'לא פעיל'}
                                                </button>
                                            </div>
                                            <div className="w-20 hidden md:flex items-center justify-center">
                                                <select 
                                                    value={editForm.Type} 
                                                    onChange={(e) => setEditForm({ ...editForm, Type: e.target.value as 'REFERRER' | 'POOL' })}
                                                    className="w-full text-[10px] p-1 border border-slate-200 rounded bg-white font-bold"
                                                >
                                                    <option value="REFERRER">הפניות</option>
                                                    <option value="POOL">מאגר</option>
                                                </select>
                                            </div>
                                            <div className="w-28 hidden md:flex items-center gap-2">
                                                <input type="range" min="1" max="10" value={editForm.Score} onChange={(e) => setEditForm({ ...editForm, Score: parseInt(e.target.value) })} className="flex-1 accent-purple-600" />
                                            </div>
                                            <div className="w-32 flex items-center justify-end gap-1">
                                                <button onClick={() => saveEdit(m.id)} className="p-1.5 text-green-600 hover:bg-green-100 rounded"><Check size={14} /></button>
                                                <button onClick={() => setEditingId(null)} className="p-1.5 text-slate-400 hover:bg-slate-200 rounded"><X size={14} /></button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex items-center px-4 md:px-6 py-2 text-xs hover:bg-slate-50 transition-colors w-full cursor-pointer" onClick={() => toggleExpand(m.id)}>
                                            <div className="flex-1 min-w-[120px] flex flex-col justify-center gap-0.5">
                                                <span className="font-bold text-slate-800">{m.fields.Name}</span>
                                                <span className="text-[10px] text-slate-400 md:hidden">{m.fields.Phone}</span>
                                            </div>
                                            
                                            <div className="w-32 shrink-0 hidden md:flex text-slate-500 font-mono text-[11px]">
                                                {m.fields.Phone}
                                            </div>
                                            
                                            <div className="w-24 shrink-0 hidden md:flex justify-center">
                                                <span className={clsx("px-2 py-0.5 rounded-full text-[9px] font-bold", isActive ? 'bg-green-50 text-green-600 border border-green-100' : 'bg-slate-100 text-slate-400')}>
                                                    {isActive ? 'פעיל' : 'לא פעיל'}
                                                </span>
                                            </div>
                                            
                                            <div className="w-20 shrink-0 hidden md:flex justify-center">
                                                <span className={clsx(
                                                    "px-2 py-0.5 rounded text-[9px] font-bold",
                                                    m.fields.Type === 'POOL' ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"
                                                )}>
                                                    {m.fields.Type === 'POOL' ? 'מאגר' : 'הפניות'}
                                                </span>
                                            </div>
                                            
                                            <div className="w-28 shrink-0 hidden md:flex items-center">
                                                {renderScoreStars(m.fields.Score ?? 5)}
                                            </div>
                                            
                                            {/* Actions */}
                                            <div className="w-32 shrink-0 flex items-center justify-end gap-0.5" onClick={e => e.stopPropagation()}>
                                                <button onClick={() => startEdit(m)} className="p-1.5 text-slate-300 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="ערוך">
                                                    <Edit size={14} />
                                                </button>
                                                <button onClick={() => handleDelete(m.id)} className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors" title="מחק">
                                                    <Trash2 size={14} />
                                                </button>
                                                <button onClick={() => toggleExpand(m.id)} className="p-1.5 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded transition-colors">
                                                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Expanded Panel */}
                                    {isExpanded && !isEditing && (
                                        <div className="border-t border-slate-100">
                                            {/* Stats */}
                                            {renderStatsCards(m.id)}

                                            {/* Chat Button / Chat Panel */}
                                            <div className="px-4 pb-4">
                                                {chatMusicianId === m.id ? (
                                                    <div className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
                                                        <div className="px-4 py-2 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
                                                            <span className="text-xs font-bold text-slate-600 flex items-center gap-1">
                                                                <MessageSquare size={12} /> היסטוריית צ&apos;אט
                                                            </span>
                                                            <button
                                                                onClick={() => setChatMusicianId(null)}
                                                                className="text-slate-400 hover:text-slate-600"
                                                            >
                                                                <X size={14} />
                                                            </button>
                                                        </div>
                                                        <div className="max-h-60 overflow-y-auto p-3 space-y-2">
                                                            {chatMessages.length === 0 ? (
                                                                <p className="text-center text-xs text-slate-400 py-4">אין הודעות</p>
                                                            ) : (
                                                                chatMessages.map((msg) => (
                                                                    <div
                                                                        key={msg.id}
                                                                        className={clsx(
                                                                            "max-w-[80%] px-3 py-2 rounded-xl text-sm",
                                                                            msg.fields.Direction === 'Outbound'
                                                                                ? "bg-purple-100 text-purple-900 mr-auto"
                                                                                : "bg-white border border-slate-200 text-slate-800 ml-auto"
                                                                        )}
                                                                    >
                                                                        {msg.fields.Content}
                                                                        <div className="text-[10px] text-slate-400 mt-0.5">
                                                                            {new Date(msg.fields.Timestamp).toLocaleString('he-IL', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                                                                        </div>
                                                                    </div>
                                                                ))
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-2 p-3 border-t border-slate-200">
                                                            <input
                                                                type="text"
                                                                value={chatInput}
                                                                onChange={(e) => setChatInput(e.target.value)}
                                                                onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
                                                                placeholder="הקלד הודעה..."
                                                                className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-purple-300 outline-none"
                                                            />
                                                            <button
                                                                onClick={handleSendChat}
                                                                disabled={sendingChat || !chatInput.trim()}
                                                                className="p-2 bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition-colors disabled:opacity-50"
                                                            >
                                                                <Send size={16} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={() => openChat(m.id)}
                                                        className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-600 text-sm font-bold rounded-xl hover:bg-slate-200 transition-colors"
                                                    >
                                                        <MessageSquare size={14} /> פתח צ&apos;אט
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
