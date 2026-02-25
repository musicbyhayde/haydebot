'use client';

import { useState, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import ChatWindow from "@/components/ChatWindow";
import LeadsDashboard from "@/components/LeadsDashboard";
import FinancePage from "@/components/FinancePage";
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
  const [view, setView] = useState<'inbox' | 'dashboard' | 'musicians' | 'finance'>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);

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
      .channel('public:Leads')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'Leads' }, () => {
        fetchData(); // Refetch leads when any change occurs
      })
      .subscribe();

    return () => {
      supabase.removeChannel(leadsSubscription);
    };
  }, []);

  useEffect(() => {
    if (activeId) {
      fetchMessages(activeId);

      const supabase = createSupabaseClient();
      const messagesSubscription = supabase
        .channel(`public:Messages:lead_id=eq.${activeId}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'Messages',
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
      const [leadsData, musiciansData] = await Promise.all([
        api.getLeads(),
        api.getMusicians()
      ]);
      setLeads(leadsData);
      setMusicians(musiciansData);
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

  const handleSelect = (id: string) => {
    setActiveId(id);
    if (view === 'dashboard') setView('inbox');
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

  const showSidebar = mobileMenuOpen || (view !== 'dashboard' && view !== 'finance' && activeId === null);

  return (
    <div className="flex h-[100dvh] w-screen overflow-hidden bg-slate-50 text-slate-900" dir="rtl">
      <div className={clsx(
        "h-full w-full md:w-80 flex-shrink-0 transition-all",
        showSidebar ? "block" : "hidden md:block"
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
          />
        ) : view === 'finance' ? (
          <FinancePage
            currentUser={currentUser}
            onMenuClick={() => setMobileMenuOpen(true)}
          />
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
