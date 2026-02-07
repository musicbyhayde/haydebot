import { Lead, Musician } from '@/types';
import { Phone, Music, MapPin, Calendar, Clock, Users, Star } from 'lucide-react';
import clsx from 'clsx';

interface SidebarProps {
    leads: Lead[];
    musicians: Musician[];
    activeId: string | null;
    onSelect: (id: string) => void;
    currentView: 'inbox' | 'dashboard' | 'musicians';
    onViewChange: (view: 'inbox' | 'dashboard' | 'musicians') => void;
}

export default function Sidebar({ leads, musicians, activeId, onSelect, currentView, onViewChange }: SidebarProps) {
    const list = currentView === 'musicians' ? musicians : leads;

    return (
        <div className="w-80 border-r border-gray-200 h-full flex flex-col bg-slate-50">
            {/* Navigation */}
            <div className="p-4 space-y-2 border-b border-gray-200 bg-white">
                <button
                    onClick={() => onViewChange('dashboard')}
                    className={clsx(
                        "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all",
                        currentView === 'dashboard' ? "bg-slate-900 text-white shadow-lg shadow-slate-200" : "text-slate-600 hover:bg-slate-50"
                    )}
                >
                    <Music size={18} /> דשבורד ניהול
                </button>
                <button
                    onClick={() => onViewChange('inbox')}
                    className={clsx(
                        "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all",
                        currentView === 'inbox' ? "bg-blue-600 text-white shadow-lg shadow-blue-100" : "text-slate-600 hover:bg-slate-50"
                    )}
                >
                    <Users size={18} /> לקוחות
                </button>
                <button
                    onClick={() => onViewChange('musicians')}
                    className={clsx(
                        "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all",
                        currentView === 'musicians' ? "bg-purple-600 text-white shadow-lg shadow-purple-100" : "text-slate-600 hover:bg-slate-50"
                    )}
                >
                    <Music size={18} className="rotate-12" /> נגנים
                </button>
            </div>

            <div className="p-4 border-b border-gray-200">
                <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">
                    {currentView === 'musicians' ? 'רשימת נגנים' : 'לידים אחרונים (' + leads.length + ')'}
                </h2>
            </div>
            <div className="flex-1 overflow-y-auto">
                {list.map((item: any) => {
                    const isActive = item.id === activeId;

                    // Client fields
                    if (currentView !== 'musicians') {
                        const lead = item as Lead;
                        const statusColors: Record<string, string> = {
                            'New': 'bg-blue-100 text-blue-800',
                            'Processing': 'bg-yellow-100 text-yellow-800',
                            'Closed': 'bg-green-100 text-green-800',
                            'Lost': 'bg-red-100 text-red-800'
                        };
                        const badgeClass = statusColors[lead.fields.Status] || 'bg-gray-100 text-gray-800';

                        return (
                            <div
                                key={lead.id}
                                onClick={() => onSelect(lead.id)}
                                className={clsx(
                                    "p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors",
                                    isActive && "bg-blue-50 border-l-4 border-l-blue-500"
                                )}
                            >
                                <div className="flex justify-between items-start mb-1">
                                    <span className="font-semibold text-gray-900 truncate">{lead.fields.Name || lead.fields.Phone}</span>
                                    <span className={clsx("text-xs px-2 py-0.5 rounded-full font-medium", badgeClass)}>
                                        {lead.fields.Status}
                                    </span>
                                </div>
                                <div className="text-sm text-gray-500 flex items-center gap-1 mb-1">
                                    <Phone size={12} />
                                    {lead.fields.Phone}
                                </div>
                                {lead.fields.Service && (
                                    <div className="text-xs text-gray-600 flex items-center gap-1">
                                        <Music size={12} />
                                        {lead.fields.Service}
                                    </div>
                                )}
                            </div>
                        );
                    } else {
                        // Musician fields
                        const musician = item as Musician;
                        return (
                            <div
                                key={musician.id}
                                onClick={() => onSelect(musician.id)}
                                className={clsx(
                                    "p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors",
                                    isActive && "bg-purple-50 border-l-4 border-l-purple-500"
                                )}
                            >
                                <div className="flex justify-between items-start mb-1">
                                    <span className="font-semibold text-gray-900 truncate flex items-center gap-1 text-right" dir="rtl">
                                        {musician.fields.Name}
                                        {musician.fields.Is_Favorite && <Star size={12} className="text-yellow-500 fill-yellow-500" />}
                                    </span>
                                    <span className={clsx(
                                        "text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase",
                                        musician.fields.Is_Active ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-500"
                                    )}>
                                        {musician.fields.Is_Active ? 'Active' : 'Inactive'}
                                    </span>
                                </div>
                                <div className="text-sm text-gray-500 flex items-center gap-1">
                                    <Phone size={12} />
                                    {musician.fields.Phone}
                                </div>
                            </div>
                        );
                    }
                })}
            </div>
        </div>
    );
}
