/**
 * The API client authenticates with the Supabase session JWT only; no shared key.
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

    it('sends only the Bearer token (no shared key)', async () => {
        getSession.mockResolvedValue({ data: { session: { access_token: 'tok123' } } });
        const { api } = await import('@/lib/api');
        await api.getLeads();
        const h = headersOfLastCall();
        expect(h['Authorization']).toBe('Bearer tok123');
        expect(h['x-api-key']).toBeUndefined();
    });

    it('ignores leftover NEXT_PUBLIC_API_KEY / NEXT_PUBLIC_SEND_LEGACY_API_KEY env', async () => {
        process.env.NEXT_PUBLIC_API_KEY = 'leftover';
        process.env.NEXT_PUBLIC_SEND_LEGACY_API_KEY = 'true';
        getSession.mockResolvedValue({ data: { session: { access_token: 'tok123' } } });
        const { api } = await import('@/lib/api');
        await api.getLeads();
        const h = headersOfLastCall();
        expect(h['x-api-key']).toBeUndefined();
        expect(h['Authorization']).toBe('Bearer tok123');
    });

    it('sends no auth header if there is no session or lookup throws', async () => {
        getSession.mockRejectedValue(new Error('boom'));
        const { api } = await import('@/lib/api');
        await api.getLeads();
        const h = headersOfLastCall();
        expect(h['Authorization']).toBeUndefined();
        expect(h['x-api-key']).toBeUndefined();
    });

    it('keeps caller headers (Content-Type) intact', async () => {
        getSession.mockResolvedValue({ data: { session: { access_token: 't' } } });
        mockFetch.mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({}) });
        const { api } = await import('@/lib/api');
        await api.createLead({} as never);
        expect(headersOfLastCall()['Content-Type']).toBe('application/json');
    });
});

describe('send errors carry backend detail (fix #3)', () => {
    beforeEach(() => {
        jest.resetModules();
        mockFetch.mockReset();
        getSession.mockResolvedValue({ data: { session: null } });
    });

    it('sendMessage throws ApiError with detail on 502', async () => {
        mockFetch.mockResolvedValue({ ok: false, status: 502, json: () => Promise.resolve({ detail: 'ההודעה לא נשלחה' }) });
        const { api } = await import('@/lib/api');
        await expect(api.sendMessage('rec1', 'hi')).rejects.toMatchObject({
            message: 'Failed to send message', detail: 'ההודעה לא נשלחה', status: 502,
        });
    });

    it('non-JSON error body still throws the old message', async () => {
        mockFetch.mockResolvedValue({ ok: false, status: 500, json: () => Promise.reject(new Error('x')) });
        const { api } = await import('@/lib/api');
        await expect(api.sendIntro('rec1', { video_urls: [] })).rejects.toThrow('Failed to send intro bundle');
    });
});
