import { Lead, Musician } from '@/types';
import { Phone, Music, MapPin, Calendar, Clock, Users, Star, DollarSign, LogOut, ListTodo, BarChart3, Film, LayoutDashboard } from 'lucide-react';
import { AppUser } from '@/lib/auth';
import clsx from 'clsx';
import { ChevronRight, ChevronLeft } from 'lucide-react';

interface SidebarProps {
    leads: Lead[];
    musicians: Musician[];
    activeId: string | null;
    onSelect: (id: string) => void;
    currentView: 'home' | 'inbox' | 'dashboard' | 'musicians' | 'finance' | 'tasks' | 'history' | 'analytics' | 'videos';
    onViewChange: (view: 'home' | 'inbox' | 'dashboard' | 'musicians' | 'finance' | 'tasks' | 'history' | 'analytics' | 'videos') => void;
    currentUser?: AppUser | null;
    onSignOut?: () => void;
    unreadStatus?: Record<string, { count: number; lastMessage: string | null; lastTime: string | null }>;
    isCollapsed?: boolean;
    onToggleCollapse?: () => void;
}

const STATUS_MAP: Record<string, { label: string; class: string }> = {
    'New': { label: 'חדש', class: 'bg-blue-100 text-blue-800' },
    'Processing': { label: 'בטיפול בוט', class: 'bg-yellow-100 text-yellow-800' },
    'Manual': { label: 'בטיפול ידני', class: 'bg-indigo-100 text-indigo-800' },
    'Talking': { label: 'בשיחה', class: 'bg-cyan-100 text-cyan-800' },
    'Quote_Sent': { label: 'נשלחה הצ"מ', class: 'bg-amber-100 text-amber-800' },
    'Waiting_Payment': { label: 'מחכה לתשלום', class: 'bg-orange-100 text-orange-800' },
    'Distributed': { label: 'הופץ', class: 'bg-purple-100 text-purple-800' },
    'Assigned': { label: 'שובץ', class: 'bg-green-100 text-green-800' },
    'Closed': { label: 'נסגר', class: 'bg-emerald-100 text-emerald-800' },
    'Lost': { label: 'אבוד', class: 'bg-red-100 text-red-800' },
    'Completed': { label: 'הושלם', class: 'bg-slate-200 text-slate-700' },
};

export default function Sidebar({ leads, musicians, activeId, onSelect, currentView, onViewChange, currentUser, onSignOut, unreadStatus = {}, isCollapsed = false, onToggleCollapse }: SidebarProps) {

    return (
        <div className="w-full h-full flex flex-col bg-slate-50 border-r border-gray-200 relative group transition-all duration-300">
            {/* Collapse Toggle */}
            <button
                onClick={onToggleCollapse}
                className="absolute -left-3 top-6 z-20 hidden md:flex items-center justify-center w-6 h-6 bg-white border border-slate-200 hover:border-blue-400 rounded-full text-slate-400 hover:text-blue-600 shadow-sm transition-all"
            >
                {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
            </button>

            {/* User Info */}
            {currentUser && (
                <div className="px-4 py-3 border-b border-gray-200 bg-white flex items-center justify-between">
                    <div className={clsx("flex items-center", isCollapsed ? "justify-center w-full" : "gap-2")}>
                        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-amber-400 to-amber-600 flex items-center justify-center text-white text-sm font-bold shrink-0">
                            {currentUser.displayName.substring(0, 1)}
                        </div>
                        {!isCollapsed && (
                            <>
                                <span className="text-sm font-bold text-slate-700 truncate">{currentUser.displayName}</span>
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium shrink-0">
                                    {currentUser.role === 'admin' ? 'מנהל' : 'שותף'}
                                </span>
                            </>
                        )}
                    </div>
                    {!isCollapsed && onSignOut && (
                        <button onClick={onSignOut} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="התנתק">
                            <LogOut size={16} />
                        </button>
                    )}
                </div>
            )}

            {/* Navigation */}
            <div className="p-4 space-y-2 border-b border-gray-200 bg-white">
                <button
                    onClick={() => onViewChange('home')}
                    className={clsx(
                        "flex items-center rounded-xl text-sm font-bold transition-all",
                        isCollapsed ? "justify-center p-3" : "w-full gap-3 px-4 py-3",
                        currentView === 'home' ? "bg-slate-900 text-white shadow-lg shadow-slate-200" : "text-slate-600 hover:bg-slate-50"
                    )}
                    title={isCollapsed ? "דשבורד ניהול" : undefined}
                >
                    <LayoutDashboard size={18} /> {!isCollapsed && "דשבורד ניהול"}
                </button>
                <button
                    onClick={() => onViewChange('dashboard')}
                    className={clsx(
                        "flex items-center rounded-xl text-sm font-bold transition-all",
                        isCollapsed ? "justify-center p-3" : "w-full gap-3 px-4 py-3",
                        currentView === 'dashboard' ? "bg-slate-900 text-white shadow-lg shadow-slate-200" : "text-slate-600 hover:bg-slate-50"
                    )}
                    title={isCollapsed ? "לידים" : undefined}
                >
                    <Users size={18} /> {!isCollapsed && "📋 לידים"}
                </button>

                <button
                    onClick={() => onViewChange('musicians')}
                    className={clsx(
                        "flex items-center rounded-xl text-sm font-bold transition-all",
                        isCollapsed ? "justify-center p-3" : "w-full gap-3 px-4 py-3",
                        currentView === 'musicians' ? "bg-purple-600 text-white shadow-lg shadow-purple-100" : "text-slate-600 hover:bg-slate-50"
                    )}
                    title={isCollapsed ? "נגנים" : undefined}
                >
                    <Music size={18} className="rotate-12" /> {!isCollapsed && "נגנים"}
                </button>
                <button
                    onClick={() => onViewChange('videos')}
                    className={clsx(
                        "flex items-center rounded-xl text-sm font-bold transition-all",
                        isCollapsed ? "justify-center p-3" : "w-full gap-3 px-4 py-3",
                        currentView === 'videos' ? "bg-indigo-600 text-white shadow-lg shadow-indigo-100" : "text-slate-600 hover:bg-slate-50"
                    )}
                    title={isCollapsed ? "בנק סרטונים" : undefined}
                >
                    <Film size={18} /> {!isCollapsed && "בנק סרטונים"}
                </button>
                <button
                    onClick={() => onViewChange('finance')}
                    className={clsx(
                        "flex items-center rounded-xl text-sm font-bold transition-all",
                        isCollapsed ? "justify-center p-3" : "w-full gap-3 px-4 py-3",
                        currentView === 'finance' ? "bg-amber-500 text-white shadow-lg shadow-amber-100" : "text-slate-600 hover:bg-slate-50"
                    )}
                    title={isCollapsed ? "כספים" : undefined}
                >
                    <DollarSign size={18} /> {!isCollapsed && "💰 כספים"}
                </button>
                <button
                    onClick={() => onViewChange('tasks')}
                    className={clsx(
                        "flex items-center rounded-xl text-sm font-bold transition-all",
                        isCollapsed ? "justify-center p-3" : "w-full gap-3 px-4 py-3",
                        currentView === 'tasks' ? "bg-emerald-500 text-white shadow-lg shadow-emerald-100" : "text-slate-600 hover:bg-slate-50"
                    )}
                    title={isCollapsed ? "משימות" : undefined}
                >
                    <ListTodo size={18} /> {!isCollapsed && "📋 משימות"}
                </button>
                <button
                    onClick={() => onViewChange('history')}
                    className={clsx(
                        "flex items-center rounded-xl text-sm font-bold transition-all",
                        isCollapsed ? "justify-center p-3" : "w-full gap-3 px-4 py-3",
                        currentView === 'history' ? "bg-indigo-500 text-white shadow-lg shadow-indigo-100" : "text-slate-600 hover:bg-slate-50"
                    )}
                    title={isCollapsed ? "היסטוריה" : undefined}
                >
                    <Star size={18} /> {!isCollapsed && "⏱️ היסטוריה"}
                </button>
                {/* Analytics button hidden for now
                <button
                    onClick={() => onViewChange('analytics')}
                    className={clsx(
                        "flex items-center rounded-xl text-sm font-bold transition-all",
                        isCollapsed ? "justify-center p-3" : "w-full gap-3 px-4 py-3",
                        currentView === 'analytics' ? "bg-cyan-500 text-white shadow-lg shadow-cyan-100" : "text-slate-600 hover:bg-slate-50"
                    )}
                    title={isCollapsed ? "אנליטיקות" : undefined}
                >
                    <BarChart3 size={18} /> {!isCollapsed && "📊 אנליטיקות"}
                </button>
                */}
            </div>


        </div>
    );
}
