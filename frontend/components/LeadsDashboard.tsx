'use client';

import { useState } from 'react';
import { Lead } from '@/types';
import { Calendar, MapPin, Music, Users, ArrowRight, CheckCircle, Clock, AlertCircle, Menu, Plus, FileText } from 'lucide-react';
import { AppUser } from '@/lib/auth';
import AddLeadModal from './AddLeadModal';
import LeadDetailPanel from './LeadDetailPanel';
import clsx from 'clsx';

interface LeadsDashboardProps {
    leads: Lead[];
    onSelectLead: (id: string) => void;
    onMenuClick?: () => void;
    currentUser?: AppUser | null;
    onRefresh?: () => void;
}

const STATUS_MAP: Record<string, { label: string; class: string }> = {
    'New': { label: 'חדש', class: 'bg-blue-50 text-blue-700 border-blue-200' },
    'Talking': { label: 'רק דיבורים', class: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
    'Processing': { label: 'בטיפול', class: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
    'Quote_Sent': { label: 'נשלחה הצ"מ', class: 'bg-amber-50 text-amber-700 border-amber-200' },
    'Waiting_Payment': { label: 'מחכה לתשלום', class: 'bg-orange-50 text-orange-700 border-orange-200' },
    'Distributed': { label: 'הופץ', class: 'bg-purple-50 text-purple-700 border-purple-200' },
    'Assigned': { label: 'שובץ', class: 'bg-green-50 text-green-700 border-green-200' },
    'Manual': { label: 'ידני', class: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
    'Closed': { label: 'נסגר', class: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    'Lost': { label: 'אבוד', class: 'bg-red-50 text-red-700 border-red-200' },
};

const OWNER_COLORS: Record<string, string> = {
    'אילן': 'bg-blue-100 text-blue-700',
    'קובי': 'bg-purple-100 text-purple-700',
};

export default function LeadsDashboard({ leads, onSelectLead, onMenuClick, currentUser, onRefresh }: LeadsDashboardProps) {
    const [showAddModal, setShowAddModal] = useState(false);
    const [detailLead, setDetailLead] = useState<Lead | null>(null);

    const stats = {
        total: leads.length,
        new: leads.filter(l => l.fields.Status === 'New').length,
        processing: leads.filter(l => ['Processing', 'Talking', 'Quote_Sent'].includes(l.fields.Status)).length,
        assigned: leads.filter(l => ['Assigned', 'Closed', 'Waiting_Payment'].includes(l.fields.Status)).length,
    };

    const activeLeads = leads.filter(l => l.fields.Status !== 'Closed' && l.fields.Status !== 'Lost');

    return (
        <div className="flex-1 overflow-y-auto bg-slate-50 p-4 md:p-8" dir="rtl">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <header className="mb-6 md:mb-8 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        {onMenuClick && (
                            <button onClick={onMenuClick} className="md:hidden p-2 bg-white rounded-lg shadow-sm border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
                                <Menu size={24} />
                            </button>
                        )}
                        <div>
                            <h1 className="text-xl md:text-3xl font-extrabold text-slate-900 mb-0.5 md:mb-2">Hayde Dashboard 🎸</h1>
                            <p className="text-xs md:text-sm text-slate-500">ניהול לידים ומעקב אירועים בזמן אמת</p>
                        </div>
                    </div>
                    <button
                        onClick={() => setShowAddModal(true)}
                        className="flex items-center gap-1.5 px-3 md:px-5 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
                    >
                        <Plus size={16} /> <span className="hidden md:inline">ליד חדש</span>
                    </button>
                </header>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6 mb-6 md:mb-8">
                    {[
                        { label: 'סה"כ לידים', value: stats.total, color: 'bg-white', text: 'text-slate-900' },
                        { label: 'חדשים', value: stats.new, color: 'bg-blue-500', text: 'text-white' },
                        { label: 'בטיפול', value: stats.processing, color: 'bg-yellow-400', text: 'text-slate-900' },
                        { label: 'סגורים/שויכו', value: stats.assigned, color: 'bg-green-500', text: 'text-white' },
                    ].map((stat, i) => (
                        <div key={i} className={clsx("p-4 md:p-6 rounded-2xl shadow-sm border border-slate-200 transition-all hover:shadow-md", stat.color)}>
                            <p className={clsx("text-xs md:text-sm font-medium mb-1 opacity-80", stat.text)}>{stat.label}</p>
                            <p className={clsx("text-2xl md:text-3xl font-bold", stat.text)}>{stat.value}</p>
                        </div>
                    ))}
                </div>

                {/* Leads Table */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="px-4 md:px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                        <h2 className="font-bold text-base md:text-lg text-slate-800">לידים פעילים ({activeLeads.length})</h2>
                        <span className="text-xs text-slate-400 flex items-center gap-1">
                            <Clock size={12} /> עדכון אחרון: {new Date().toLocaleTimeString()}
                        </span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-right">
                            <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider">
                                <tr>
                                    <th className="px-4 md:px-6 py-3 font-semibold">לקוח</th>
                                    <th className="px-4 md:px-6 py-3 font-semibold">סטטוס</th>
                                    <th className="px-4 md:px-6 py-3 font-semibold hidden md:table-cell">מוביל</th>
                                    <th className="px-4 md:px-6 py-3 font-semibold hidden md:table-cell">שירות</th>
                                    <th className="px-4 md:px-6 py-3 font-semibold hidden md:table-cell">תאריך</th>
                                    <th className="px-4 md:px-6 py-3 font-semibold hidden lg:table-cell">מיקום</th>
                                    <th className="px-4 md:px-6 py-3 font-semibold">פעולות</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {activeLeads.map((lead) => {
                                    const statusInfo = STATUS_MAP[lead.fields.Status] || { label: lead.fields.Status, class: 'bg-gray-50 text-gray-700 border-gray-200' };
                                    const ownerColor = OWNER_COLORS[lead.fields.Owner || ''] || 'bg-slate-100 text-slate-600';

                                    return (
                                        <tr key={lead.id} className="hover:bg-slate-50 transition-colors group">
                                            <td className="px-4 md:px-6 py-3">
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-sm text-slate-900">{lead.fields.Name || 'ללא שם'}</span>
                                                    <span className="text-[11px] text-slate-500">{lead.fields.Phone}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 md:px-6 py-3">
                                                <span className={clsx("inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border", statusInfo.class)}>
                                                    {statusInfo.label}
                                                </span>
                                            </td>
                                            <td className="px-4 md:px-6 py-3 hidden md:table-cell">
                                                {lead.fields.Owner ? (
                                                    <span className={clsx("text-[11px] px-2 py-0.5 rounded-full font-bold", ownerColor)}>
                                                        {lead.fields.Owner}
                                                    </span>
                                                ) : '—'}
                                            </td>
                                            <td className="px-4 md:px-6 py-3 text-sm text-slate-600 hidden md:table-cell">
                                                {lead.fields.Service ? (
                                                    <div className="flex items-center gap-1.5">
                                                        <Music size={13} className="text-slate-400" />
                                                        {lead.fields.Service}
                                                    </div>
                                                ) : '—'}
                                            </td>
                                            <td className="px-4 md:px-6 py-3 text-sm text-slate-600 hidden md:table-cell">
                                                {lead.fields.Event_Date ? (
                                                    <div className="flex items-center gap-1.5">
                                                        <Calendar size={13} className="text-slate-400" />
                                                        {lead.fields.Event_Date}
                                                    </div>
                                                ) : '—'}
                                            </td>
                                            <td className="px-4 md:px-6 py-3 hidden lg:table-cell">
                                                {lead.fields.Location ? (
                                                    <span className="text-xs text-slate-600 flex items-center gap-1">
                                                        <MapPin size={12} className="text-slate-400" /> {lead.fields.Location}
                                                    </span>
                                                ) : '—'}
                                            </td>
                                            <td className="px-4 md:px-6 py-3">
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => setDetailLead(lead)}
                                                        className="text-slate-400 hover:text-blue-600 transition-colors"
                                                        title="פרטים ועדכונים"
                                                    >
                                                        <FileText size={16} />
                                                    </button>
                                                    <button
                                                        onClick={() => onSelectLead(lead.id)}
                                                        className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs font-bold transition-all"
                                                    >
                                                        צ'אט <ArrowRight size={14} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Modals */}
            <AddLeadModal
                isOpen={showAddModal}
                onClose={() => setShowAddModal(false)}
                onCreated={() => onRefresh?.()}
                currentUserName={currentUser?.displayName}
            />

            {detailLead && (
                <LeadDetailPanel
                    lead={detailLead}
                    currentUserName={currentUser?.displayName || ''}
                    onClose={() => setDetailLead(null)}
                    onStatusChange={() => { setDetailLead(null); onRefresh?.(); }}
                />
            )}
        </div>
    );
}
