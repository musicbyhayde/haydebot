'use client';

import { useState, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import ChatWindow from "@/components/ChatWindow";
import LeadsDashboard from "@/components/LeadsDashboard";
import { api } from "@/lib/api";
import { Lead, Message, Musician } from "@/types";
import clsx from "clsx";

export default function Home() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [musicians, setMusicians] = useState<Musician[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'inbox' | 'dashboard' | 'musicians'>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Auto-close menu when changing view
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [view]);

  // Poll for leads, musicians and messages
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (activeId) {
      fetchMessages(activeId);
      const interval = setInterval(() => fetchMessages(activeId), 5000);
      return () => clearInterval(interval);
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

  if (loading) {
    return <div className="h-screen w-screen flex items-center justify-center font-bold text-slate-400 italic">Hayde is Warming Up... 🎸</div>;
  }

  const showSidebar = mobileMenuOpen || (view !== 'dashboard' && activeId === null);

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
