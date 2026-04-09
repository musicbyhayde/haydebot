/**
 * Tests for the frontend API client.
 * Mocks fetch to verify correct URLs, methods, headers, and error handling.
 */
import { api } from '@/lib/api';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => {
    mockFetch.mockReset();
});

const okJson = (data: unknown) => ({
    ok: true,
    json: () => Promise.resolve(data),
    status: 200,
});

const errorResponse = () => ({
    ok: false,
    status: 500,
    json: () => Promise.resolve({ detail: 'error' }),
});


// ═══════════════════════════════════════════════════════
//  Leads
// ═══════════════════════════════════════════════════════

describe('api.getLeads', () => {
    it('calls GET /leads and returns data', async () => {
        const mockLeads = [{ id: 'rec1', fields: { Phone: '111', Status: 'New' } }];
        mockFetch.mockResolvedValueOnce(okJson(mockLeads));

        const result = await api.getLeads();
        expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/leads'));
        expect(result).toEqual(mockLeads);
    });

    it('throws on error', async () => {
        mockFetch.mockResolvedValueOnce(errorResponse());
        await expect(api.getLeads()).rejects.toThrow('Failed to fetch leads');
    });
});

describe('api.createLead', () => {
    it('sends POST with correct body', async () => {
        const leadData = { Phone: '972501234567', Name: 'Test' };
        const mockResult = { id: 'rec1', fields: leadData };
        mockFetch.mockResolvedValueOnce(okJson(mockResult));

        const result = await api.createLead(leadData);
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('/leads'),
            expect.objectContaining({
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(leadData),
            })
        );
        expect(result.id).toBe('rec1');
    });
});

describe('api.updateLead', () => {
    it('sends PATCH with correct body and URL', async () => {
        const update = { Status: 'Closed', Closing_Amount: 5000 };
        mockFetch.mockResolvedValueOnce(okJson({ id: 'rec1', fields: update }));

        await api.updateLead('rec1', update);
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('/leads/rec1'),
            expect.objectContaining({
                method: 'PATCH',
                body: JSON.stringify(update),
            })
        );
    });

    it('throws on error', async () => {
        mockFetch.mockResolvedValueOnce(errorResponse());
        await expect(api.updateLead('rec1', { Status: 'Lost' })).rejects.toThrow('Failed to update lead');
    });
});


// ═══════════════════════════════════════════════════════
//  Messages
// ═══════════════════════════════════════════════════════

describe('api.getMessages', () => {
    it('calls correct URL with lead ID', async () => {
        mockFetch.mockResolvedValueOnce(okJson([]));
        await api.getMessages('rec_lead_001');
        expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/leads/rec_lead_001/messages'));
    });
});

describe('api.sendMessage', () => {
    it('sends POST with text payload', async () => {
        mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
        await api.sendMessage('rec_lead_001', 'Hello!');
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('/leads/rec_lead_001/messages'),
            expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({ text: 'Hello!' }),
            })
        );
    });
});


// ═══════════════════════════════════════════════════════
//  Notes
// ═══════════════════════════════════════════════════════

describe('api.getNotes', () => {
    it('calls correct URL', async () => {
        mockFetch.mockResolvedValueOnce(okJson([]));
        await api.getNotes('rec_lead_001');
        expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/leads/rec_lead_001/notes'));
    });
});

describe('api.createNote', () => {
    it('sends correct payload', async () => {
        const noteData = { content: 'test note', author: 'Ilan' };
        mockFetch.mockResolvedValueOnce(okJson({ id: 'n1', fields: noteData }));
        await api.createNote('rec_lead_001', noteData);
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('/leads/rec_lead_001/notes'),
            expect.objectContaining({
                method: 'POST',
                body: JSON.stringify(noteData),
            })
        );
    });

    it('sends file metadata when present', async () => {
        const noteData = { content: 'with file', author: 'Ilan', file_url: 'https://x.com/f.pdf', file_name: 'f.pdf' };
        mockFetch.mockResolvedValueOnce(okJson({ id: 'n2', fields: noteData }));
        await api.createNote('rec_lead_001', noteData);
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.file_url).toBe('https://x.com/f.pdf');
        expect(body.file_name).toBe('f.pdf');
    });
});


// ═══════════════════════════════════════════════════════
//  Finance
// ═══════════════════════════════════════════════════════

describe('api.getFinanceEntries', () => {
    it('calls without owner filter', async () => {
        mockFetch.mockResolvedValueOnce(okJson([]));
        await api.getFinanceEntries();
        expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/finance'));
        expect(mockFetch.mock.calls[0][0]).not.toContain('owner=');
    });

    it('calls with owner filter', async () => {
        mockFetch.mockResolvedValueOnce(okJson([]));
        await api.getFinanceEntries('אילן');
        expect(mockFetch.mock.calls[0][0]).toContain('owner=');
    });
});

describe('api.createFinanceEntry', () => {
    it('sends POST with all fields', async () => {
        const data = { Owner: 'אילן', Type: 'income', Date: '2026-03-01', Description: 'Test', Amount: 5000 };
        mockFetch.mockResolvedValueOnce(okJson({ id: 'f1', fields: data }));
        await api.createFinanceEntry(data);
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.Amount).toBe(5000);
        expect(body.Owner).toBe('אילן');
    });

    it('throws on error', async () => {
        mockFetch.mockResolvedValueOnce(errorResponse());
        await expect(api.createFinanceEntry({})).rejects.toThrow('Failed to create finance entry');
    });
});

describe('api.updateFinanceEntry', () => {
    it('sends PATCH to correct URL', async () => {
        mockFetch.mockResolvedValueOnce(okJson({}));
        await api.updateFinanceEntry('f1', { Amount: 999 });
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('/finance/f1'),
            expect.objectContaining({ method: 'PATCH' })
        );
    });
});

describe('api.deleteFinanceEntry', () => {
    it('sends DELETE to correct URL', async () => {
        mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
        await api.deleteFinanceEntry('f1');
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('/finance/f1'),
            expect.objectContaining({ method: 'DELETE' })
        );
    });

    it('throws on error', async () => {
        mockFetch.mockResolvedValueOnce(errorResponse());
        await expect(api.deleteFinanceEntry('f1')).rejects.toThrow('Failed to delete finance entry');
    });
});

describe('api.getFinanceSummary', () => {
    it('calls correct URL', async () => {
        mockFetch.mockResolvedValueOnce(okJson({ אילן: { income: 5000, expenses: 1000, balance: 4000 } }));
        const result = await api.getFinanceSummary();
        expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/finance/summary'));
        expect(result['אילן'].balance).toBe(4000);
    });
});


// ═══════════════════════════════════════════════════════
//  Musicians
// ═══════════════════════════════════════════════════════

describe('api.getMusicians', () => {
    it('calls correct URL', async () => {
        mockFetch.mockResolvedValueOnce(okJson([]));
        await api.getMusicians();
        expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/musicians'));
    });
});

describe('api.sendMusicianMessage', () => {
    it('sends POST with text', async () => {
        mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
        await api.sendMusicianMessage('mus1', 'Hello musician');
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('/musicians/mus1/messages'),
            expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({ text: 'Hello musician' }),
            })
        );
    });
});
