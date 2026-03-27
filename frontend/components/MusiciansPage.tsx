'use client';

import { useState, useEffect } from 'react';
import { Musician, Message } from '@/types';
import { api } from '@/lib/api';
import { AppUser } from '@/lib/auth';
import {
    Plus, Trash2, Edit, Check, X, Star, Phone, Music, Menu,
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

export default function MusiciansPage({ currentUser, onMenuClick }: MusiciansPageProps) {
    const [musicians, setMusicians] = useState<Musician[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddForm, setShowAddForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<any>({});
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
            setForm({ Name: '', Phone: '', Score: 5, Is_Active: true });
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

            {/* Add Form */}
            {showAddForm && (
                <div className="px-4 md:px-6 py-4 bg-purple-50 border-b border-purple-100">
                    <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 mb-1">שם הנגן *</label>
                            <input
                                type="text"
                                value={form.Name}
                                onChange={(e) => setForm({ ...form, Name: e.target.value })}
                                placeholder="למשל: יוסי כהן"
                                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-purple-300 outline-none"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 mb-1">טלפון *</label>
                            <input
                                type="text"
                                value={form.Phone}
                                onChange={(e) => setForm({ ...form, Phone: e.target.value })}
                                placeholder="972501234567"
                                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-purple-300 outline-none"
                                dir="ltr"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 mb-1">ציון (1-10)</label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="range"
                                    min="1"
                                    max="10"
                                    value={form.Score}
                                    onChange={(e) => setForm({ ...form, Score: parseInt(e.target.value) })}
                                    className="flex-1 accent-purple-600"
                                />
                                <span className="text-sm font-bold text-purple-700 w-6 text-center">{form.Score}</span>
                            </div>
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 mb-1">סטטוס</label>
                            <button
                                type="button"
                                onClick={() => setForm({ ...form, Is_Active: !form.Is_Active })}
                                className={clsx(
                                    "w-full px-3 py-2 rounded-xl text-sm font-bold transition-all border",
                                    form.Is_Active
                                        ? "bg-green-100 text-green-700 border-green-200"
                                        : "bg-slate-100 text-slate-500 border-slate-200"
                                )}
                            >
                                {form.Is_Active ? '✅ פעיל' : '⏸️ לא פעיל'}
                            </button>
                        </div>
                        <button
                            type="submit"
                            className="px-6 py-2 bg-purple-600 text-white text-sm font-bold rounded-xl hover:bg-purple-700 transition-all shadow-md shadow-purple-200"
                        >
                            <Plus size={16} className="inline ml-1" /> הוסף
                        </button>
                    </form>
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
                    <div className="space-y-3">
                        {musicians.map(m => {
                            const isEditing = editingId === m.id;
                            const isExpanded = expandedId === m.id;
                            const isActive = m.fields.Is_Active !== false;

                            return (
                                <div
                                    key={m.id}
                                    className={clsx(
                                        "bg-white border rounded-2xl overflow-hidden transition-all shadow-sm",
                                        isExpanded ? "border-purple-200 shadow-md" : "border-slate-200 hover:border-slate-300",
                                        !isActive && "opacity-60"
                                    )}
                                >
                                    {/* Main Row */}
                                    {isEditing ? (
                                        <div className="p-4 bg-amber-50 grid grid-cols-1 md:grid-cols-5 gap-3 items-center">
                                            <input
                                                type="text"
                                                value={editForm.Name}
                                                onChange={(e) => setEditForm({ ...editForm, Name: e.target.value })}
                                                className="px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white"
                                                placeholder="שם"
                                            />
                                            <input
                                                type="text"
                                                value={editForm.Phone}
                                                onChange={(e) => setEditForm({ ...editForm, Phone: e.target.value })}
                                                className="px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white"
                                                dir="ltr"
                                                placeholder="טלפון"
                                            />
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="range"
                                                    min="1"
                                                    max="10"
                                                    value={editForm.Score}
                                                    onChange={(e) => setEditForm({ ...editForm, Score: parseInt(e.target.value) })}
                                                    className="flex-1 accent-purple-600"
                                                />
                                                <span className="text-sm font-bold text-purple-700 w-6">{editForm.Score}</span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setEditForm({ ...editForm, Is_Active: !editForm.Is_Active })}
                                                className={clsx(
                                                    "px-3 py-2 rounded-xl text-sm font-bold transition-all border",
                                                    editForm.Is_Active
                                                        ? "bg-green-100 text-green-700 border-green-200"
                                                        : "bg-slate-100 text-slate-500 border-slate-200"
                                                )}
                                            >
                                                {editForm.Is_Active ? '✅ פעיל' : '⏸️ לא פעיל'}
                                            </button>
                                            <div className="flex items-center gap-2">
                                                <button onClick={() => saveEdit(m.id)} className="p-2 text-green-600 hover:bg-green-50 rounded-lg"><Check size={18} /></button>
                                                <button onClick={() => setEditingId(null)} className="p-2 text-slate-400 hover:bg-slate-50 rounded-lg"><X size={18} /></button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div
                                            className="p-4 flex items-center gap-4 cursor-pointer hover:bg-slate-50/50 transition-colors"
                                            onClick={() => toggleExpand(m.id)}
                                        >
                                            {/* Avatar */}
                                            <div className={clsx(
                                                "w-12 h-12 rounded-full flex items-center justify-center text-white text-lg font-extrabold shrink-0",
                                                isActive
                                                    ? "bg-gradient-to-br from-purple-500 to-purple-700"
                                                    : "bg-slate-300"
                                            )}>
                                                {m.fields.Name.substring(0, 1)}
                                            </div>

                                            {/* Info */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-0.5">
                                                    <span className="font-bold text-slate-800 text-base truncate">{m.fields.Name}</span>
                                                    <span className={clsx(
                                                        "text-[10px] px-2 py-0.5 rounded-full font-bold",
                                                        isActive ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-500'
                                                    )}>
                                                        {isActive ? 'פעיל' : 'לא פעיל'}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-4 text-sm text-slate-500">
                                                    <span className="flex items-center gap-1">
                                                        <Phone size={12} /> {m.fields.Phone}
                                                    </span>
                                                    <span className="flex items-center gap-1">
                                                        {renderScoreStars(m.fields.Score ?? 5)}
                                                        <span className="text-xs font-bold text-slate-400 mr-1">{m.fields.Score ?? 5}/10</span>
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Actions */}
                                            <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                                                <button
                                                    onClick={() => startEdit(m)}
                                                    className="p-2 text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                                                    title="ערוך"
                                                >
                                                    <Edit size={16} />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(m.id)}
                                                    className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                    title="מחק"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                                <button
                                                    onClick={() => toggleExpand(m.id)}
                                                    className="p-2 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                                                >
                                                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
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
                )}
            </div>
        </div>
    );
}
