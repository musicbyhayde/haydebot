'use client';

import { useState, useEffect } from 'react';
import { Activity } from '@/types';
import { api } from '@/lib/api';
import { History, User, Calendar, MessageSquare, Briefcase, Plus, Shuffle } from 'lucide-react';
import { format } from 'date-fns';

export default function HistoryPage() {
    const [activities, setActivities] = useState<Activity[]>([]);
    const [loading, setLoading] = useState(true);

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

    const getIconForAction = (action: string) => {
        if (action.includes('סטטוס')) return <Shuffle size={16} className="text-purple-500" />;
        if (action.includes('הכנסה') || action.includes('הוצאה')) return <Briefcase size={16} className="text-emerald-500" />;
        if (action.includes('עדכון')) return <MessageSquare size={16} className="text-blue-500" />;
        if (action.includes('משימה')) return <Plus size={16} className="text-amber-500" />;
        if (action.includes('ליד')) return <User size={16} className="text-indigo-500" />;
        return <History size={16} className="text-slate-400" />;
    };

    return (
        <div className="flex flex-col h-full bg-slate-50 relative">
            <div className="absolute top-0 left-0 right-0 h-48 bg-gradient-to-b from-slate-200/50 to-transparent pointer-events-none"></div>
            
            <div className="flex-1 overflow-y-auto p-4 md:p-8 z-10">
                <div className="max-w-4xl mx-auto space-y-6">
                    <div className="flex items-center gap-3 mb-8">
                        <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center shadow-sm">
                            <History size={20} className="text-slate-600" />
                        </div>
                        <div>
                            <h2 className="text-xl font-extrabold text-slate-800">היסטוריית פעילות</h2>
                            <p className="text-sm text-slate-500 font-medium">מעקב אחר הפעולות האחרונות במערכת</p>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                        {loading ? (
                            <div className="flex flex-col items-center justify-center p-12 text-slate-400">
                                <History className="w-8 h-8 animate-spin-slow mb-3 opacity-50" />
                                <p className="text-sm font-bold">טוען נתונים...</p>
                            </div>
                        ) : activities.length === 0 ? (
                            <div className="p-12 text-center text-slate-400">
                                <p className="text-sm font-bold">אין פעילויות במערכת עדיין</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-100">
                                {activities.map((activity) => {
                                    let dateStr = "לא ידוע";
                                    try {
                                        if (activity.fields.created_at) {
                                            const d = new Date(activity.fields.created_at);
                                            dateStr = format(d, 'dd/MM/yyyy HH:mm');
                                        }
                                    } catch (e) {}

                                    return (
                                        <div key={activity.id} className="flex items-start gap-4 p-4 hover:bg-slate-50 transition-colors group">
                                            <div className="mt-1 w-8 h-8 shrink-0 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center">
                                                {getIconForAction(activity.fields.action_type)}
                                            </div>
                                            
                                            <div className="flex-1 min-w-0">
                                                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-1">
                                                    <p className="text-sm font-extrabold text-slate-800">
                                                        {activity.fields.actor} <span className="text-slate-500 font-medium px-1">•</span> {activity.fields.action_type}
                                                    </p>
                                                    <div className="flex items-center gap-1 text-[10px] text-slate-400 font-bold bg-slate-100 px-2 py-0.5 rounded-full shrink-0">
                                                        <Calendar size={10} />
                                                        {dateStr}
                                                    </div>
                                                </div>
                                                <p className="text-xs text-slate-600 font-medium leading-relaxed">
                                                    {activity.fields.description}
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
