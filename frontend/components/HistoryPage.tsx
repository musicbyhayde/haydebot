'use client';

import { useState, useEffect } from 'react';
import { Activity, Lead } from '@/types';
import { api } from '@/lib/api';
import { History, Clock } from 'lucide-react';
import clsx from 'clsx';

interface HistoryPageProps {
    leads?: Lead[];
}

export default function HistoryPage({ leads = [] }: HistoryPageProps) {
    const [activities, setActivities] = useState<Activity[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterActor, setFilterActor] = useState('');

    useEffect(() => {
        fetchActivities();
    }, []);

    const fetchActivities = async () => {
        try {
            const data = await api.getActivities();
            setActivities(data);
        } catch (e) {
            console.error('Failed to fetch activities:', e);
        } finally {
            setLoading(false);
        }
    };

    const getLinkedLeadName = (leadId?: string | null) => {
        if (!leadId) return null;
        const lead = leads.find(l => l.id === leadId);
        return lead ? (lead.fields.Name || lead.fields.Phone) : null;
    };

    const formatDate = (dateStr?: string) => {
        if (!dateStr) return '—';
        try {
            const d = new Date(dateStr);
            return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' });
        } catch { return '—'; }
    };

    const formatTime = (dateStr?: string) => {
        if (!dateStr) return '';
        try {
            const d = new Date(dateStr);
            return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
        } catch { return ''; }
    };

    const uniqueActors = [...new Set(activities.map(a => a.fields.actor))];

    const filtered = filterActor
        ? activities.filter(a => a.fields.actor === filterActor)
        : activities;

    if (loading) {
        return <div className="flex-1 flex items-center justify-center text-slate-400 font-bold">טוען נתונים...</div>;
    }

    return (
        <div className="flex-1 min-w-0">
            {/* Filter bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between mb-4 bg-white p-2 border border-slate-200 rounded-xl gap-2 shadow-sm">
                <div className="flex items-center gap-2 w-full sm:w-auto">
                    <span className="text-xs font-bold text-slate-500 mr-2">סינון לפי:</span>
                    <select
                        value={filterActor}
                        onChange={(e) => setFilterActor(e.target.value)}
                        className="bg-slate-50 border border-slate-200 text-sm rounded-lg px-3 py-1.5 focus:ring-1 focus:ring-blue-500 min-w-[120px]"
                    >
                        <option value="">כל המשתמשים</option>
                        {uniqueActors.map(actor => (
                            <option key={actor} value={actor}>{actor}</option>
                        ))}
                    </select>
                </div>
                <div className="text-[10px] font-bold px-2.5 py-1 bg-slate-200 text-slate-600 rounded-full">
                    {filtered.length} פעולות
                </div>
            </div>

            {/* Table */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto mb-4 shadow-sm flex flex-col">
                <div className="min-w-[500px] flex flex-col">
                    {/* Header Row */}
                    <div className="flex items-center px-4 py-2 text-[10px] font-bold text-slate-400 border-b border-slate-200 uppercase bg-slate-50">
                        <div className="w-16 shrink-0">תאריך</div>
                        <div className="w-12 shrink-0">שעה</div>
                        <div className="w-20 shrink-0">משתמש</div>
                        <div className="w-24 shrink-0">סוג פעולה</div>
                        <div className="flex-1 min-w-[150px]">תיאור</div>
                        <div className="w-28 shrink-0 hidden md:block">ליד משויך</div>
                    </div>
                    {/* Rows */}
                    {filtered.length === 0 ? (
                        <div className="text-center py-8 text-slate-400 text-sm">אין פעולות</div>
                    ) : (
                        filtered.map(activity => {
                            const linkedLead = getLinkedLeadName(activity.fields.lead_id);
                            return (
                                <div key={activity.id} className="flex items-center px-4 py-2 text-xs border-b border-slate-100 hover:bg-slate-50 transition-colors bg-white">
                                    <div className="w-16 shrink-0 text-[10px] text-slate-500">
                                        {formatDate(activity.fields.created_at)}
                                    </div>
                                    <div className="w-12 shrink-0 text-[10px] text-slate-400 flex items-center gap-0.5">
                                        <Clock size={9} />
                                        {formatTime(activity.fields.created_at)}
                                    </div>
                                    <div className="w-20 shrink-0">
                                        <span className={clsx(
                                            "text-[10px] px-1.5 py-0.5 rounded font-bold",
                                            activity.fields.actor === 'אילן' ? 'bg-blue-50 text-blue-700' :
                                            activity.fields.actor === 'קובי' ? 'bg-purple-50 text-purple-700' :
                                            'bg-slate-100 text-slate-600'
                                        )}>
                                            {activity.fields.actor}
                                        </span>
                                    </div>
                                    <div className="w-24 shrink-0">
                                        <span className={clsx(
                                            "text-[9px] px-1.5 py-0.5 rounded-full font-bold",
                                            activity.fields.action_type.includes('סטטוס') ? 'bg-purple-100 text-purple-700' :
                                            activity.fields.action_type.includes('הכנסה') || activity.fields.action_type.includes('הוצאה') ? 'bg-emerald-100 text-emerald-700' :
                                            activity.fields.action_type.includes('עדכון') ? 'bg-blue-100 text-blue-700' :
                                            activity.fields.action_type.includes('משימה') ? 'bg-amber-100 text-amber-700' :
                                            activity.fields.action_type.includes('ליד') ? 'bg-indigo-100 text-indigo-700' :
                                            'bg-slate-100 text-slate-600'
                                        )}>
                                            {activity.fields.action_type}
                                        </span>
                                    </div>
                                    <div className="flex-1 min-w-[150px] text-slate-700 font-medium truncate">
                                        {activity.fields.description}
                                    </div>
                                    <div className="w-28 shrink-0 hidden md:block">
                                        {linkedLead ? (
                                            <span className="text-[9px] text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded-sm font-medium truncate block max-w-[110px]">
                                                {linkedLead}
                                            </span>
                                        ) : (
                                            <span className="text-slate-300">—</span>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}
