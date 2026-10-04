export type UserRole = 'partner' | 'admin';

/** Dashboard users. Anyone else who manages to get a Supabase session is refused (fix #5). */
export const ALLOWED_USERS: Record<string, { role: UserRole; displayName: string }> = {
    'ziv200@gmail.com': { role: 'admin', displayName: 'אילן' },
    'kobile@gmail.com': { role: 'partner', displayName: 'קובי' },
    'musicbyhayde@gmail.com': { role: 'admin', displayName: 'מנהל' },
};

export function isAllowedEmail(email: string | null | undefined): boolean {
    return !!email && Object.prototype.hasOwnProperty.call(ALLOWED_USERS, email.toLowerCase());
}
