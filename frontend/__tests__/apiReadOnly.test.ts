/**
 * Client-side guard: in read-only (viewer) mode no write request leaves the browser.
 */
const getSession = jest.fn();
jest.mock('@/lib/supabaseClient', () => ({
    createSupabaseClient: () => ({ auth: { getSession } }),
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('read-only API guard', () => {
    const OLD_ENV = process.env;
    beforeEach(() => {
        jest.resetModules();
        mockFetch.mockReset().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve([]) });
        getSession.mockReset().mockResolvedValue({ data: { session: { access_token: 'tok' } } });
        process.env = { ...OLD_ENV, NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co' };
    });
    afterAll(() => { process.env = OLD_ENV; });

    async function load(readOnly: boolean) {
        const ro = await import('@/lib/readOnly');
        ro.setReadOnlyMode(readOnly);
        return import('@/lib/api');
    }

    it('blocks POST/PATCH/DELETE with a 403 ApiError and never calls fetch', async () => {
        const { api, ApiError } = await load(true);
        await expect(api.updateLead('l1', { Status: 'Lost' })).rejects.toBeInstanceOf(ApiError);
        await expect(api.createNote('l1', { content: 'x', author: 'רוני' })).rejects.toMatchObject({ status: 403 });
        await expect(api.deleteFinanceEntry('f1')).rejects.toMatchObject({ status: 403 });
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('still allows GETs, including finance per lead', async () => {
        const { api } = await load(true);
        await api.getLeads();
        await api.getLeadFinance('lead 1');
        expect(mockFetch).toHaveBeenCalledTimes(2);
        expect(mockFetch.mock.calls[1][0]).toMatch(/\/leads\/lead%201\/finance$/);
    });

    it('mark-as-read is a no-op for viewers', async () => {
        const { api } = await load(true);
        await expect(api.markLeadAsRead('l1')).resolves.toEqual({ status: 'skipped' });
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('normal users write as before', async () => {
        const { api } = await load(false);
        mockFetch.mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({}) });
        await api.updateLead('l1', { Status: 'Lost' });
        expect(mockFetch.mock.calls[0][1].method).toBe('PATCH');
    });

    it('admin user API encodes the email and sends role viewer', async () => {
        const { api } = await load(false);
        mockFetch.mockResolvedValue({ ok: true, status: 201, json: () => Promise.resolve({}) });
        await api.createUser({ email: 'r@example.com', password: 'x'.repeat(12), display_name: 'רוני' });
        expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toMatchObject({ role: 'viewer', email: 'r@example.com' });
        await api.disableUser('a+b@example.com');
        expect(mockFetch.mock.calls[1][0]).toMatch(/\/admin\/users\/a%2Bb%40example\.com\/disable$/);
        await api.deleteUser('a+b@example.com');
        expect(mockFetch.mock.calls[2][1].method).toBe('DELETE');
    });
});
