import { Lead } from '@/types';
import { Calendar, MapPin, Music, Users, ArrowRight, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import clsx from 'clsx';

interface LeadsDashboardProps {
    leads: Lead[];
    onSelectLead: (id: string) => void;
}

export default function LeadsDashboard({ leads, onSelectLead }: LeadsDashboardProps) {
    const stats = {
        total: leads.length,
        new: leads.filter(l => l.fields.Status === 'New').length,
        processing: leads.filter(l => l.fields.Status === 'Processing').length,
        assigned: leads.filter(l => l.fields.Status === 'Assigned').length,
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'New': return <AlertCircle size={16} className="text-blue-500" />;
            case 'Processing': return <Clock size={16} className="text-yellow-500" />;
            case 'Assigned': return <CheckCircle size={16} className="text-green-500" />;
            default: return <Clock size={16} className="text-gray-500" />;
        }
    };

    const getStatusClass = (status: string) => {
        switch (status) {
            case 'New': return 'bg-blue-50 text-blue-700 border-blue-200';
            case 'Processing': return 'bg-yellow-50 text-yellow-700 border-yellow-200';
            case 'Assigned': return 'bg-green-50 text-green-700 border-green-200';
            case 'Distributed': return 'bg-purple-50 text-purple-700 border-purple-200';
            case 'Closed': return 'bg-gray-50 text-gray-700 border-gray-200';
            case 'Lost': return 'bg-red-50 text-red-700 border-red-200';
            default: return 'bg-gray-50 text-gray-700 border-gray-200';
        }
    };

    return (
        <div className="flex-1 overflow-y-auto bg-slate-50 p-8">
            <div className="max-w-7xl mx-auto">
                <header className="mb-8">
                    <h1 className="text-3xl font-extrabold text-slate-900 mb-2">Hayde Dashboard 🎸</h1>
                    <p className="text-slate-500">ניהול לידים ומעקב אירועים בזמן אמת</p>
                </header>

                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                    {[
                        { label: 'סה"כ לידים', value: stats.total, color: 'bg-white', text: 'text-slate-900' },
                        { label: 'חדשים', value: stats.new, color: 'bg-blue-500', text: 'text-white' },
                        { label: 'בטיפול', value: stats.processing, color: 'bg-yellow-400', text: 'text-slate-900' },
                        { label: 'סגורים/שויכו', value: stats.assigned, color: 'bg-green-500', text: 'text-white' },
                    ].map((stat, i) => (
                        <div key={i} className={clsx("p-6 rounded-2xl shadow-sm border border-slate-200 transition-all hover:shadow-md", stat.color)}>
                            <p className={clsx("text-sm font-medium mb-1 opacity-80", stat.text)}>{stat.label}</p>
                            <p className={clsx("text-3xl font-bold", stat.text)}>{stat.value}</p>
                        </div>
                    ))}
                </div>

                {/* Leads Table */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                        <h2 className="font-bold text-lg text-slate-800">לידים פעילים</h2>
                        <div className="flex gap-2">
                            <span className="text-xs text-slate-400 flex items-center gap-1">
                                <Clock size={12} /> עדכון אחרון: {new Date().toLocaleTimeString()}
                            </span>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-right" dir="rtl">
                            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                                <tr>
                                    <th className="px-6 py-4 font-semibold">לקוח</th>
                                    <th className="px-6 py-4 font-semibold">סטטוס</th>
                                    <th className="px-6 py-4 font-semibold">שירות</th>
                                    <th className="px-6 py-4 font-semibold">תאריך</th>
                                    <th className="px-6 py-4 font-semibold">מיקום / אורחים</th>
                                    <th className="px-6 py-4 font-semibold">פעולות</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {leads.filter(l => l.fields.Status !== 'Closed' && l.fields.Status !== 'Lost').map((lead) => (
                                    <tr key={lead.id} className="hover:bg-slate-50 transition-colors group">
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="font-bold text-slate-900">{lead.fields.Name || 'ללא שם'}</span>
                                                <span className="text-xs text-slate-500">{lead.fields.Phone}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={clsx(
                                                "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border",
                                                getStatusClass(lead.fields.Status)
                                            )}>
                                                {getStatusIcon(lead.fields.Status)}
                                                {lead.fields.Status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-slate-600 font-medium">
                                            {lead.fields.Service ? (
                                                <div className="flex items-center gap-2">
                                                    <Music size={14} className="text-slate-400" />
                                                    {lead.fields.Service}
                                                </div>
                                            ) : '-'}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-slate-600">
                                            {lead.fields.Event_Date ? (
                                                <div className="flex items-center gap-2">
                                                    <Calendar size={14} className="text-slate-400" />
                                                    {lead.fields.Event_Date}
                                                </div>
                                            ) : '-'}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col gap-1">
                                                {lead.fields.Location && (
                                                    <span className="text-xs text-slate-600 flex items-center gap-1">
                                                        <MapPin size={12} className="text-slate-400" /> {lead.fields.Location}
                                                    </span>
                                                )}
                                                {lead.fields.Guests && (
                                                    <span className="text-xs text-slate-600 flex items-center gap-1">
                                                        <Users size={12} className="text-slate-400" /> {lead.fields.Guests} איש
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <button
                                                onClick={() => onSelectLead(lead.id)}
                                                className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm font-bold transition-all group-hover:translate-x-[-4px]"
                                            >
                                                פתח צ'אט <ArrowRight size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
