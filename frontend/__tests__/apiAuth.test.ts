/**
 * Fix #1: the API client sends the Supabase session JWT, and keeps the legacy key during
 * the transition window.
 */
const getSession = jest.fn();
jest.mock('@/lib/auth', () => ({
    createSupabaseClient: () => ({ auth: { getSession } }),
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

const ok = { ok: true, status: 200, json: () => Promise.resolve([]) };

function headersOfLastCall(): Record<string, string> {
    return mockFetch.mock.calls[mockFetch.mock.calls.length - 1][1].headers;
}

describe('fetchWithAuth', () => {
    const OLD_ENV = process.env;
    beforeEach(() => {
        jest.resetModules();
        mockFetch.mockReset().mockResolvedValue(ok);
        getSession.mockReset();
        process.env = { ...OLD_ENV, NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co' };
    });
    afterAll(() => { process.env = OLD_ENV; });

    it('sends Bearer token and legacy key by default', async () => {
        getSession.mockResolvedValue({ data: { session: { access_token: 'tok123' } } });
        const { api } = await import('@/lib/api');
        await api.getLeads();
        const h = headersOfLastCall();
        expect(h['Authorization']).toBe('Bearer tok123');
        expect(h['x-api-key']).toBeDefined();
    });

    it('drops the legacy key when NEXT_PUBLIC_SEND_LEGACY_API_KEY=false', async () => {
        process.env.NEXT_PUBLIC_SEND_LEGACY_API_KEY = 'false';
        getSession.mockResolvedValue({ data: { session: { access_token: 'tok123' } } });
        const { api } = await import('@/lib/api');
        await api.getLeads();
        const h = headersOfLastCall();
        expect(h['Authorization']).toBe('Bearer tok123');
        expect(h['x-api-key']).toBeUndefined();
    });

    it('still works (legacy key) if there is no session or lookup throws', async () => {
        getSession.mockRejectedValue(new Error('boom'));
        const { api } = await import('@/lib/api');
        await api.getLeads();
        const h = headersOfLastCall();
        expect(h['Authorization']).toBeUndefined();
        expect(h['x-api-key']).toBeDefined();
    });

    it('keeps caller headers (Content-Type) intact', async () => {
        getSession.mockResolvedValue({ data: { session: { access_token: 't' } } });
        mockFetch.mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({}) });
        const { api } = await import('@/lib/api');
        await api.createLead({} as never);
        expect(headersOfLastCall()['Content-Type']).toBe('application/json');
    });
});
