'use client';

import { useState, useEffect, useRef } from "react";
import Sidebar from "@/components/Sidebar";
import ChatWindow from "@/components/ChatWindow";
import LeadsDashboard from "@/components/LeadsDashboard";
import FinancePage from "@/components/FinancePage";
import TasksSection from "@/components/TasksSection";
import MusiciansPage from "@/components/MusiciansPage";
import AnalyticsPage from "@/components/AnalyticsPage";
import HistoryPage from "@/components/HistoryPage";
import { api } from "@/lib/api";
import { Lead, Message, Musician } from "@/types";
import { getCurrentUser, signOut, AppUser, createSupabaseClient } from "@/lib/auth";
import clsx from "clsx";

export default function Home() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [musicians, setMusicians] = useState<Musician[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'inbox' | 'dashboard' | 'musicians' | 'finance' | 'tasks' | 'history' | 'analytics'>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [unreadStatus, setUnreadStatus] = useState<Record<string, { count: number; lastMessage: string | null; lastTime: string | null }>>({});
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  
  // Track activeId in a ref for use inside closure callbacks (like Supabase Realtime subscriptions)
  const activeIdRef = useRef<string | null>(null);

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  // Request Notification Permission on load
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
        Notification.requestPermission();
      }
    }
  }, []);

  // Load current user
  useEffect(() => {
    getCurrentUser().then(setCurrentUser);
  }, []);

  // Auto-close menu when changing view
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [view]);

  // Load initial data and subscribe to Leads realtime changes
  useEffect(() => {
    fetchData();

    const supabase = createSupabaseClient();
    const leadsSubscription = supabase
      .channel('public:leads')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, (payload) => {
        fetchData(); // Refetch leads when any change occurs
        
        // Trigger notification for new leads
        if (payload.eventType === 'INSERT') {
          if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
            new Notification('HaydeBot 🎸', {
              body: 'ליד משמח חדש נחת במערכת! 🎉',
            });
            // Try to play a gentle sound
            new Audio('https://www.soundjay.com/buttons/sounds/button-09.mp3').play().catch(() => {});
          }
        }
      })
      .subscribe();

    const globalMessagesSubscription = supabase
      .channel('public:messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const msg = payload.new;
        // Only trigger for inbound messages
        if (msg.Direction === 'Inbound') {
          fetchData(); // Refresh unread count
          
          // Trigger notification if we are not actively looking at this lead
          const isCurrentlyActive = activeIdRef.current && msg.Lead?.includes(activeIdRef.current);
          if (!isCurrentlyActive) {
            if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
               new Notification('HaydeBot 🎸 - הודעה חדשה', {
                 body: msg.Content || 'התקבלה הודעת טקסט / מדיה חדשה',
               });
               new Audio('https://www.soundjay.com/buttons/sounds/button-09.mp3').play().catch(() => {});
            }
          }
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(leadsSubscription);
      supabase.removeChannel(globalMessagesSubscription);
    };
  }, []);

  useEffect(() => {
    if (activeId) {
      fetchMessages(activeId);

      const supabase = createSupabaseClient();
      const messagesSubscription = supabase
        .channel(`public:messages:lead_id=eq.${activeId}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          // Note: filter might fail if Supabase requires setup, but we'll fetchMessages on insert anyway 
          // and fetchMessages limits by activeId 
        }, () => {
          fetchMessages(activeId);
        })
        .subscribe();

      return () => {
        supabase.removeChannel(messagesSubscription);
      };
    } else {
      setMessages([]);
    }
  }, [activeId, view]);

  const fetchData = async () => {
    try {
      const [leadsData, musiciansData, unreadData] = await Promise.all([
        api.getLeads(),
        api.getMusicians(),
        api.getUnreadStatus()
      ]);
      setLeads(leadsData);
      setMusicians(musiciansData);
      setUnreadStatus(unreadData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async (id: string) => {
    if (!id) return;
    try {
      const data = view === 'musicians'
        ? await api.getMusicianMessages(id)
        : await api.getMessages(id);
      setMessages(data);
    } catch (e) {
      console.error(e);
    }
  };

  const activeItem: any = view === 'musicians'
    ? musicians.find(m => m.id === activeId)
    : leads.find(l => l.id === activeId);

  const handleSelect = async (id: string) => {
    setActiveId(id);
    if (view === 'dashboard') setView('inbox');

    // Mark as read if it has unread messages
    if (unreadStatus[id]?.count > 0) {
      setUnreadStatus(prev => ({ ...prev, [id]: { ...prev[id], count: 0 } }));
      try {
        await api.markLeadAsRead(id);
        fetchData();
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleSendMessage = async (text: string) => {
    if (!activeId) return;
    try {
      if (view === 'musicians') {
        await api.sendMusicianMessage(activeId, text);
      } else {
        await api.sendMessage(activeId, text);
      }
      fetchMessages(activeId);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    window.location.href = '/login';
  };

  if (loading) {
    return <div className="h-screen w-screen flex items-center justify-center font-bold text-slate-400 italic">Hayde is Warming Up... 🎸</div>;
  }

  const showSidebar = mobileMenuOpen || (view !== 'dashboard' && view !== 'finance' && view !== 'tasks' && view !== 'musicians' && view !== 'analytics' && activeId === null);

  return (
    <div className="flex h-[100dvh] w-screen overflow-hidden bg-slate-50 text-slate-900" dir="rtl">
      <div className={clsx(
        "h-full flex-shrink-0 transition-all duration-300 relative z-10",
        showSidebar ? "block w-full" : "hidden md:block",
        !showSidebar && sidebarCollapsed ? "md:w-20" : "md:w-80"
      )}>
        <Sidebar
          leads={leads}
          musicians={musicians}
          activeId={activeId}
          onSelect={handleSelect}
          currentView={view}
          onViewChange={(v) => { setView(v); setActiveId(null); }}
          currentUser={currentUser}
          onSignOut={handleSignOut}
          unreadStatus={unreadStatus}
          isCollapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
      </div>

      <div className={clsx(
        "flex-1 h-full w-full",
        showSidebar ? "hidden md:flex" : "flex"
      )}>
        {view === 'dashboard' ? (
          <LeadsDashboard
            leads={leads}
            onSelectLead={handleSelect}
            onMenuClick={() => setMobileMenuOpen(true)}
            currentUser={currentUser}
            onRefresh={fetchData}
            onNavigateToTasks={() => { setView('tasks'); setActiveId(null); }}
            unreadStatus={unreadStatus}
          />
        ) : view === 'finance' ? (
          <FinancePage
            currentUser={currentUser}
            onMenuClick={() => setMobileMenuOpen(true)}
          />
        ) : view === 'musicians' ? (
          <MusiciansPage
            currentUser={currentUser}
            onMenuClick={() => setMobileMenuOpen(true)}
          />
        ) : view === 'analytics' ? (
          <AnalyticsPage
            currentUser={currentUser}
            onMenuClick={() => setMobileMenuOpen(true)}
          />
        ) : view === 'tasks' ? (
          <div className="flex-1 overflow-y-auto bg-slate-50 p-4 md:p-8" dir="rtl">
            <div className="max-w-4xl mx-auto">
              {/* Header with Mobile Button */}
              <div className="mb-6 flex items-center gap-3">
                <button onClick={() => setMobileMenuOpen(true)} className="md:hidden p-2 bg-white rounded-lg shadow-sm border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="12" y2="12" /><line x1="4" x2="20" y1="6" y2="6" /><line x1="4" x2="20" y1="18" y2="18" /></svg>
                </button>
                <h1 className="text-xl md:text-3xl font-extrabold text-slate-900">לוח משימות 📋</h1>
              </div>
              <TasksSection currentUser={currentUser} leads={leads} />
            </div>
          </div>
        ) : view === 'history' ? (
          <div className="flex-1 overflow-y-auto bg-slate-50 p-4 md:p-8" dir="rtl">
            <div className="max-w-5xl mx-auto">
              {/* Header with Mobile Button */}
              <div className="mb-6 flex items-center gap-3">
                <button onClick={() => setMobileMenuOpen(true)} className="md:hidden p-2 bg-white rounded-lg shadow-sm border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="12" y2="12" /><line x1="4" x2="20" y1="6" y2="6" /><line x1="4" x2="20" y1="18" y2="18" /></svg>
                </button>
                <h1 className="text-xl md:text-2xl font-extrabold text-slate-800">⏱️ היסטוריית פעילות</h1>
              </div>
              <HistoryPage leads={leads} />
            </div>
          </div>
        ) : (
          <ChatWindow
            item={activeItem}
            messages={messages}
            onSend={handleSendMessage}
            onBack={() => setActiveId(null)}
          />
        )}
      </div>
    </div>
  );
}
