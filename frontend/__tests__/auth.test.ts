/**
 * The current user's role / display name come from GET /api/v1/me (public.dashboard_users),
 * not from a hard-coded map in the frontend.
 */
const getUser = jest.fn();
const getSession = jest.fn();
const authSignOut = jest.fn();
jest.mock('@/lib/supabaseClient', () => ({
    createSupabaseClient: () => ({ auth: { getUser, getSession, signOut: authSignOut } }),
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

function respond(status: number, body: unknown) {
    mockFetch.mockResolvedValue({ ok: status < 400, status, json: () => Promise.resolve(body) });
}

describe('getCurrentUser via /api/v1/me', () => {
    const OLD_ENV = process.env;
    beforeEach(() => {
        jest.resetModules();
        mockFetch.mockReset();
        getUser.mockReset().mockResolvedValue({ data: { user: { id: 'u1', email: 'someone@example.com' } } });
        getSession.mockReset().mockResolvedValue({ data: { session: { access_token: 'tok' } } });
        authSignOut.mockReset().mockResolvedValue({});
        process.env = { ...OLD_ENV, NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co' };
    });
    afterAll(() => { process.env = OLD_ENV; });

    it('uses role and display name from the backend (any email, no local list)', async () => {
        respond(200, { email: 'someone@example.com', role: 'partner', display_name: 'חדש', auth_method: 'jwt' });
        const { getCurrentUser } = await import('@/lib/auth');
        const onNotAllowed = jest.fn();
        await expect(getCurrentUser(onNotAllowed)).resolves.toEqual({
            id: 'u1', email: 'someone@example.com', role: 'partner', displayName: 'חדש',
        });
        expect(mockFetch.mock.calls[0][0]).toMatch(/\/me$/);
        expect(mockFetch.mock.calls[0][1].headers['Authorization']).toBe('Bearer tok');
        expect(onNotAllowed).not.toHaveBeenCalled();
    });

    it('403 from the backend -> not allowed handler (sign out + login), returns null', async () => {
        respond(403, { detail: 'User not allowed' });
        const { getCurrentUser } = await import('@/lib/auth');
        const onNotAllowed = jest.fn();
        await expect(getCurrentUser(onNotAllowed)).resolves.toBeNull();
        expect(onNotAllowed).toHaveBeenCalledTimes(1);
    });

    it('default not-allowed handler signs out', async () => {
        respond(403, { detail: 'User not allowed' });
        const { getCurrentUser } = await import('@/lib/auth');
        await getCurrentUser().catch(() => undefined); // jsdom may not implement navigation
        expect(authSignOut).toHaveBeenCalled();
    });

    it('backend down / 5xx -> null but stays logged in', async () => {
        respond(503, { detail: 'Auth service unavailable, retry' });
        const { getCurrentUser } = await import('@/lib/auth');
        const onNotAllowed = jest.fn();
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
        await expect(getCurrentUser(onNotAllowed)).resolves.toBeNull();
        mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));
        await expect(getCurrentUser(onNotAllowed)).resolves.toBeNull();
        expect(onNotAllowed).not.toHaveBeenCalled();
        expect(authSignOut).not.toHaveBeenCalled();
        warn.mockRestore();
    });

    it('no session -> null without calling the backend', async () => {
        getUser.mockResolvedValue({ data: { user: null } });
        const { getCurrentUser } = await import('@/lib/auth');
        await expect(getCurrentUser(jest.fn())).resolves.toBeNull();
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('a service (API key) identity is not a dashboard user', async () => {
        respond(200, { email: null, role: 'service', display_name: null, auth_method: 'api_key' });
        const { getCurrentUser } = await import('@/lib/auth');
        await expect(getCurrentUser(jest.fn())).resolves.toBeNull();
    });
});

export {}; // module scope for tsc
