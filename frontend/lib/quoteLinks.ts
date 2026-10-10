// Public quote links: each quote has its own random token (see app/services/quote_links.py).
// Old /quote/<leadId>?qid= links keep working on the backend while QUOTE_LEGACY_ID_LINKS is on.

export function newQuoteToken(): string {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    let bin = '';
    bytes.forEach(b => { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function withQuoteTokens<T extends { token?: string }>(quotes: T[]): T[] {
    const seen = new Set<string>();
    return quotes.map(q => {
        let token = q.token;
        if (!token || seen.has(token)) token = newQuoteToken();
        seen.add(token);
        return token === q.token ? q : { ...q, token };
    });
}

export function quoteUrl(origin: string, leadId: string, q: { id: string; token?: string }): string {
    return q.token ? `${origin}/quote/${q.token}` : `${origin}/quote/${leadId}?qid=${q.id}`;
}

/** Response of GET /quote/{key}: new shape { name, date, quote }, old shape { quote_data }. */
// Quote content is free-form JSON authored in ProposalModal and rendered by QuotePreview.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PublicQuote = { id?: string; [key: string]: any };
export interface PublicQuoteResponse {
    name?: string;
    date?: string;
    quote?: PublicQuote;
    quote_data?: PublicQuote & { quotes?: PublicQuote[] };
}

export function pickPublicQuote(data: PublicQuoteResponse | null | undefined, qid: string | null): PublicQuote | null {
    if (!data) return null;
    if (data.quote && typeof data.quote === 'object') return data.quote;
    const qd = data.quote_data;
    if (!qd) return null;
    if (Array.isArray(qd.quotes) && qd.quotes.length > 0) {
        return (qid && qd.quotes.find(q => q.id === qid)) || qd.quotes[qd.quotes.length - 1];
    }
    if (!qd.quotes && Object.keys(qd).length > 0) return qd;
    return null;
}
