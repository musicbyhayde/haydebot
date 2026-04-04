import { Lead, Message, Note, FinanceEntry, Task } from '@/types';

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

    async updateLead(leadId: string, data: Partial<Lead['fields']>): Promise<any> {
        const res = await fetchWithAuth(`${API_Base}/leads/${leadId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error('Failed to update lead');
        return res.json();
    },

    async markLeadAsRead(leadId: string): Promise<any> {
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
    async getMusicians(): Promise<any[]> {
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

    async createMusician(data: any): Promise<any> {
        const res = await fetchWithAuth(`${API_Base}/musicians`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error('Failed to create musician');
        return res.json();
    },

    async updateMusician(id: string, data: any): Promise<any> {
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

    async getMusicianStats(id: string): Promise<{ received: number; closed: number; lost: number; revenue: number; commission: number }> {
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

    // --- Finance ---
    async getFinanceEntries(owner?: string): Promise<FinanceEntry[]> {
        const url = owner ? `${API_Base}/finance?owner=${owner}` : `${API_Base}/finance`;
        const res = await fetchWithAuth(url);
        if (!res.ok) throw new Error('Failed to fetch finance entries');
        return res.json();
    },

    async createFinanceEntry(data: any): Promise<FinanceEntry> {
        const res = await fetchWithAuth(`${API_Base}/finance`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error('Failed to create finance entry');
        return res.json();
    },

    async updateFinanceEntry(id: string, data: any): Promise<any> {
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

    async getFinanceSummary(): Promise<any> {
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

    async createTask(data: any): Promise<Task> {
        const res = await fetchWithAuth(`${API_Base}/tasks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error('Failed to create task');
        return res.json();
    },

    async updateTask(id: string, data: any): Promise<Task> {
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

    // ── Analytics ─────────────────────────────────────

    async getAnalytics(): Promise<any> {
        const res = await fetchWithAuth(`${API_Base}/analytics`);
        if (!res.ok) throw new Error('Failed to fetch analytics');
        return res.json();
    },
};
