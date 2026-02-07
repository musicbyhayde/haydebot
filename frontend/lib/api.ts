import { Lead, Message } from '@/types';

const API_Base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

export const api = {
    async getLeads(): Promise<Lead[]> {
        const res = await fetch(`${API_Base}/leads`);
        if (!res.ok) throw new Error('Failed to fetch leads');
        return res.json();
    },

    async getMessages(leadId: string): Promise<Message[]> {
        const res = await fetch(`${API_Base}/leads/${leadId}/messages`);
        if (!res.ok) throw new Error('Failed to fetch messages');
        return res.json();
    },

    async sendMessage(leadId: string, text: string): Promise<void> {
        const res = await fetch(`${API_Base}/leads/${leadId}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text }),
        });
        if (!res.ok) throw new Error('Failed to send message');
    },

    async getMusicians(): Promise<any[]> {
        const res = await fetch(`${API_Base}/musicians`);
        if (!res.ok) throw new Error('Failed to fetch musicians');
        return res.json();
    },

    async getMusicianMessages(musicianId: string): Promise<Message[]> {
        const res = await fetch(`${API_Base}/musicians/${musicianId}/messages`);
        if (!res.ok) throw new Error('Failed to fetch musician messages');
        return res.json();
    },

    async sendMusicianMessage(musicianId: string, text: string): Promise<void> {
        const res = await fetch(`${API_Base}/musicians/${musicianId}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text }),
        });
        if (!res.ok) throw new Error('Failed to send musician message');
    }
};
