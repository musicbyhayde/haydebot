import { Lead, Message, Note, FinanceEntry, Task, Activity, Musician, Video, MusicianStats, Analytics, FinanceSummaryItem } from '@/types';

export interface CalendarEventPayload {
    summary?: string;
    location?: string;
    description?: string;
    event_date?: string;
    team_emails?: string[];
}

const API_Base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
const API_KEY = process.env.NEXT_PUBLIC_API_KEY || 'hayde-security-key';

async function fetchWithAuth(url: string, options: RequestInit = {}) {
    const headers = {
        ...options.headers,
        'x-api-key': API_KEY,
    };
    return fetch(url, { ...options, headers });
}

export const api = {
    // --- Leads ---
    async getLeads(): Promise<Lead[]> {
        const res = await fetchWithAuth(`${API_Base}/leads`);
        if (!res.ok) throw new Error('Failed to fetch leads');
        return res.json();
    },

    async createLead(data: Partial<Lead['fields']>): Promise<Lead> {
        const res = await fetchWithAuth(`${API_Base}/leads`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error('Failed to create lead');
        return res.json();
    },

    async updateLead(leadId: string, data: Partial<Lead['fields']>): Promise<Lead> {
        const res = await fetchWithAuth(`${API_Base}/leads/${leadId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error('Failed to update lead');
        return res.json();
    },

    async markLeadAsRead(leadId: string): Promise<{ status: string }> {
        const res = await fetchWithAuth(`${API_Base}/leads/${leadId}/read`, {
            method: 'POST',
        });
        if (!res.ok) throw new Error('Failed to mark lead as read');
        return res.json();
    },

    async getUnreadStatus(): Promise<Record<string, { count: number; lastMessage: string | null; lastTime: string | null }>> {
        const res = await fetchWithAuth(`${API_Base}/leads/unread-status`);
        if (!res.ok) throw new Error('Failed to fetch unread status');
        return res.json();
    },

    // --- Messages ---
    async getMessages(leadId: string): Promise<Message[]> {
        const res = await fetchWithAuth(`${API_Base}/leads/${leadId}/messages`);
        if (!res.ok) throw new Error('Failed to fetch messages');
        return res.json();
    },

    async sendMessage(leadId: string, text: string): Promise<void> {
        const res = await fetchWithAuth(`${API_Base}/leads/${leadId}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text }),
        });
        if (!res.ok) throw new Error('Failed to send message');
    },

    // --- Musicians ---
    async getMusicians(): Promise<Musician[]> {
        const res = await fetchWithAuth(`${API_Base}/musicians`);
        if (!res.ok) throw new Error('Failed to fetch musicians');
        return res.json();
    },

    async getMusicianMessages(musicianId: string): Promise<Message[]> {
        const res = await fetchWithAuth(`${API_Base}/musicians/${musicianId}/messages`);
        if (!res.ok) throw new Error('Failed to fetch musician messages');
        return res.json();
    },

    async sendMusicianMessage(musicianId: string, text: string): Promise<void> {
        const res = await fetchWithAuth(`${API_Base}/musicians/${musicianId}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text }),
        });
        if (!res.ok) throw new Error('Failed to send musician message');
    },

    async createMusician(data: Partial<Musician['fields']>): Promise<Musician> {
        const res = await fetchWithAuth(`${API_Base}/musicians`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error('Failed to create musician');
        return res.json();
    },

    async updateMusician(id: string, data: Partial<Musician['fields']>): Promise<Musician> {
        const res = await fetchWithAuth(`${API_Base}/musicians/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error('Failed to update musician');
        return res.json();
    },

    async deleteMusician(id: string): Promise<void> {
        const res = await fetchWithAuth(`${API_Base}/musicians/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to delete musician');
    },

    async getMusicianStats(id: string): Promise<MusicianStats> {
        const res = await fetchWithAuth(`${API_Base}/musicians/${id}/stats`);
        if (!res.ok) throw new Error('Failed to fetch musician stats');
        return res.json();
    },

    // --- Notes ---
    async getNotes(leadId: string): Promise<Note[]> {
        const res = await fetchWithAuth(`${API_Base}/leads/${leadId}/notes`);
        if (!res.ok) throw new Error('Failed to fetch notes');
        return res.json();
    },

    async createNote(leadId: string, data: { content: string; author: string; file_url?: string; file_name?: string }): Promise<Note> {
        const res = await fetchWithAuth(`${API_Base}/leads/${leadId}/notes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error('Failed to create note');
        return res.json();
    },

    async updateNote(noteId: string, data: { content: string }): Promise<Note> {
        const res = await fetchWithAuth(`${API_Base}/notes/${noteId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error('Failed to update note');
        return res.json();
    },

    async deleteNote(noteId: string): Promise<void> {
        const res = await fetchWithAuth(`${API_Base}/notes/${noteId}`, {
            method: 'DELETE',
        });
        if (!res.ok) throw new Error('Failed to delete note');
    },

    // --- Finance ---
    async getFinanceEntries(owner?: string): Promise<FinanceEntry[]> {
        const url = owner ? `${API_Base}/finance?owner=${owner}` : `${API_Base}/finance`;
        const res = await fetchWithAuth(url);
        if (!res.ok) throw new Error('Failed to fetch finance entries');
        return res.json();
    },

    async createFinanceEntry(data: Partial<FinanceEntry['fields']>): Promise<FinanceEntry> {
        const res = await fetchWithAuth(`${API_Base}/finance`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error('Failed to create finance entry');
        return res.json();
    },

    async updateFinanceEntry(id: string, data: Partial<FinanceEntry['fields']>): Promise<FinanceEntry> {
        const res = await fetchWithAuth(`${API_Base}/finance/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error('Failed to update finance entry');
        return res.json();
    },

    async deleteFinanceEntry(id: string): Promise<void> {
        const res = await fetchWithAuth(`${API_Base}/finance/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to delete finance entry');
    },

    async getFinanceSummary(): Promise<Record<string, FinanceSummaryItem>> {
        const res = await fetchWithAuth(`${API_Base}/finance/summary`);
        if (!res.ok) throw new Error('Failed to fetch finance summary');
        return res.json();
    },

    // ── Tasks ─────────────────────────────────────────

    async getTasks(): Promise<Task[]> {
        const res = await fetchWithAuth(`${API_Base}/tasks`);
        if (!res.ok) throw new Error('Failed to fetch tasks');
        const data = await res.json();
        return Array.isArray(data) ? data : [];
    },

    async createTask(data: Partial<Task['fields']>): Promise<Task> {
        const res = await fetchWithAuth(`${API_Base}/tasks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error('Failed to create task');
        return res.json();
    },

    async updateTask(id: string, data: Partial<Task['fields']>): Promise<Task> {
        const res = await fetchWithAuth(`${API_Base}/tasks/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error('Failed to update task');
        return res.json();
    },

    async deleteTask(id: string): Promise<void> {
        const res = await fetchWithAuth(`${API_Base}/tasks/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to delete task');
    },
    // ── Activities ────────────────────────────────────

    async getActivities(): Promise<Activity[]> {
        const res = await fetchWithAuth(`${API_Base}/activities`);
        if (!res.ok) throw new Error('Failed to fetch activities');
        return res.json();
    },

    // ── Analytics ─────────────────────────────────────

    async getAnalytics(): Promise<Analytics> {
        const res = await fetchWithAuth(`${API_Base}/analytics`);
        if (!res.ok) throw new Error('Failed to fetch analytics');
        return res.json();
    },

    async sendIntro(leadId: string, data: { custom_name?: string; video_urls: string[] }): Promise<{ status: string }> {
        const res = await fetchWithAuth(`${API_Base}/leads/${leadId}/send-intro`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error('Failed to send intro bundle');
        return res.json();
    },

    // --- Videos ---
    async getVideos(): Promise<Video[]> {
        const res = await fetchWithAuth(`${API_Base}/videos`);
        if (!res.ok) throw new Error('Failed to fetch videos');
        return res.json();
    },

    async createVideo(data: Partial<Video['fields']>): Promise<Video> {
        const res = await fetchWithAuth(`${API_Base}/videos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error('Failed to create video');
        return res.json();
    },

    async updateVideo(id: string, data: Partial<Video['fields']>): Promise<Video> {
        const res = await fetchWithAuth(`${API_Base}/videos/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error('Failed to update video');
        return res.json();
    },

    async deleteVideo(id: string): Promise<void> {
        const res = await fetchWithAuth(`${API_Base}/videos/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to delete video');
    },


    async createCalendarEvent(leadId: string, payload?: CalendarEventPayload): Promise<{ status: string; event_id: string }> {
        const res = await fetchWithAuth(`${API_Base}/leads/${leadId}/calendar-event`, {
            method: 'POST',
            headers: payload ? { 'Content-Type': 'application/json' } : {},
            body: payload ? JSON.stringify(payload) : undefined,
        });
        if (!res.ok) throw new Error('Failed to create calendar event');
        return res.json();
    },

    async updateCalendarEvent(leadId: string, payload: CalendarEventPayload): Promise<{ status: string }> {
        const res = await fetchWithAuth(`${API_Base}/leads/${leadId}/calendar-event`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('Failed to update calendar event');
        return res.json();
    },

    async deleteCalendarEvent(leadId: string): Promise<{ status: string }> {
        const res = await fetchWithAuth(`${API_Base}/leads/${leadId}/calendar-event`, {
            method: 'DELETE',
        });
        if (!res.ok) throw new Error('Failed to delete calendar event');
        return res.json();
    },

    async deleteLead(leadId: string, deleteCalendar: boolean = false): Promise<void> {
        const res = await fetchWithAuth(`${API_Base}/leads/${leadId}?delete_calendar=${deleteCalendar}`, {
            method: 'DELETE',
        });
        if (!res.ok) throw new Error('Failed to delete lead');
    }
};
