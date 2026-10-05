import { createSupabaseClient } from '@/lib/supabaseClient';
import { api, ApiError } from '@/lib/api';

export { createSupabaseClient };

export type UserRole = 'partner' | 'admin' | 'viewer';

export interface AppUser {
    id: string;
    email: string;
    role: UserRole;
    displayName: string;
}

/** Signs out and sends the browser to the login page with a "not allowed" message. */
export async function redirectNotAllowed(): Promise<void> {
    try {
        await signOut();
    } finally {
        window.location.assign('/login?error=not_allowed');
    }
}

/**
 * The logged-in dashboard user, with role and display name from the backend
 * (GET /api/v1/me, backed by the Supabase table public.dashboard_users - no hard-coded map).
 * - no session                      -> null
 * - backend says 403 (not a dashboard user / deactivated) -> onNotAllowed() (sign out + login), null
 * - backend unreachable / 5xx       -> null, session kept (UI just hides role-based items)
 */
export async function getCurrentUser(
    onNotAllowed: () => Promise<void> | void = redirectNotAllowed,
): Promise<AppUser | null> {
    const supabase = createSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) return null;

    try {
        const me = await api.getMe();
        if (me.role !== 'admin' && me.role !== 'partner' && me.role !== 'viewer') return null;
        return {
            id: user.id,
            email: me.email ?? user.email,
            role: me.role,
            displayName: me.display_name || user.email,
        };
    } catch (err) {
        if (err instanceof ApiError && err.status === 403) {
            await onNotAllowed();
        } else {
            console.warn('Could not load current user from /me', err);
        }
        return null;
    }
}

export async function signIn(email: string, password: string) {
    const supabase = createSupabaseClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
}

export async function signOut() {
    const supabase = createSupabaseClient();
    await supabase.auth.signOut();
}
