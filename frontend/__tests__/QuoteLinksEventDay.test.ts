import { newQuoteToken, withQuoteTokens, quoteUrl, pickPublicQuote } from '@/lib/quoteLinks';
import { leadEventSortKey } from '@/lib/formatters';

describe('quote links', () => {
    it('tokens are url-safe, 32 chars and random', () => {
        const a = newQuoteToken(), b = newQuoteToken();
        expect(a).toMatch(/^[A-Za-z0-9_-]{32}$/);
        expect(a).not.toBe(b);
    });

    it('withQuoteTokens keeps existing, fills missing, de-duplicates copies', () => {
        const t = 'A'.repeat(32);
        const out = withQuoteTokens([{ id: '1' }, { id: '2', token: t }, { id: '3', token: t }]);
        expect(out[1].token).toBe(t);
        expect(new Set(out.map(q => q.token)).size).toBe(3);
    });

    it('quoteUrl prefers the token, falls back to the legacy lead link', () => {
        expect(quoteUrl('https://x', 'r1', { id: 'q', token: 'T'.repeat(32) })).toBe(`https://x/quote/${'T'.repeat(32)}`);
        expect(quoteUrl('https://x', 'r1', { id: 'q' })).toBe('https://x/quote/r1?qid=q');
    });

    it('pickPublicQuote reads new and old response shapes', () => {
        expect(pickPublicQuote({ name: 'a', quote: { id: 'n' } }, null)).toEqual({ id: 'n' });
        const old = { quote_data: { quotes: [{ id: 'a' }, { id: 'b' }] } };
        expect(pickPublicQuote(old, null)).toEqual({ id: 'b' });
        expect(pickPublicQuote(old, 'a')).toEqual({ id: 'a' });
        expect(pickPublicQuote({ quote_data: { quotes: [] } }, null)).toBeNull();
        expect(pickPublicQuote(null, null)).toBeNull();
    });
});

describe('leadEventSortKey', () => {
    it('uses Event_Day when present, else parses the text', () => {
        expect(leadEventSortKey({ Event_Day: '2026-09-09', Event_Date: 'בערך בספטמבר' })).toBe('2026-09-09');
        expect(leadEventSortKey({ Event_Date: '09.09.2026 (ערב)' })).toBe('2026-09-09');
        expect(leadEventSortKey({ Event_Day: null, Event_Date: '' })).toBe('');
        expect(leadEventSortKey(undefined)).toBe('');
    });
});
