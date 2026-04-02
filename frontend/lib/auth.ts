import { createBrowserClient } from '@supabase/ssr';

export type UserRole = 'partner' | 'admin';

export interface AppUser {
    id: string;
    email: string;
    role: UserRole;
    displayName: string;
}

const USER_MAP: Record<string, { role: UserRole; displayName: string }> = {
    'ziv200@gmail.com': { role: 'admin', displayName: 'אילן' },
    'kobile@gmail.com': { role: 'partner', displayName: 'קובי' },
    'musicbyhayde@gmail.com': { role: 'admin', displayName: 'מנהל' },
};

export function createSupabaseClient() {
    return createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
}

export async function getCurrentUser(): Promise<AppUser | null> {
    const supabase = createSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) return null;

    const mapped = USER_MAP[user.email];
    if (!mapped) return null;

    return {
        id: user.id,
        email: user.email,
        role: mapped.role,
        displayName: mapped.displayName,
    };
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

export function getOwnerName(email: string): string {
    return USER_MAP[email]?.displayName ?? email;
}

export function isAdmin(email: string): boolean {
    return USER_MAP[email]?.role === 'admin';
}
