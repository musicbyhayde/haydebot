import { isAllowedEmail, ALLOWED_USERS } from '@/lib/allowedUsers';

describe('isAllowedEmail (fix #5)', () => {
    it('accepts the dashboard users (case-insensitive)', () => {
        for (const e of Object.keys(ALLOWED_USERS)) expect(isAllowedEmail(e)).toBe(true);
        expect(isAllowedEmail('ZIV200@gmail.com')).toBe(true);
    });
    it('refuses anyone else', () => {
        expect(isAllowedEmail('attacker@example.com')).toBe(false);
        expect(isAllowedEmail('')).toBe(false);
        expect(isAllowedEmail(undefined)).toBe(false);
        expect(isAllowedEmail('constructor')).toBe(false);
    });
});
