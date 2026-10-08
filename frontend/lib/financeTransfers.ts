/**
 * Partner transfers ("העברה בין שותפים") — client-side helpers.
 * The backend (app/services/finance_transfers.py) is the source of truth: GET /finance/summary
 * already includes transfers in each partner's balance and cash/bank pools. These helpers only
 * power the modal's live preview and the transfer rows.
 */
import { FinancePool, FinanceSummaryItem, FinanceTransfer, FinanceTransferInput } from '@/types';

export const POOLS: readonly FinancePool[] = ['חשבון', 'מזומן'] as const;
export const POOL_LABEL: Record<FinancePool, string> = { 'חשבון': '🏦 חשבון', 'מזומן': '💵 מזומן' };
const POOL_KEY: Record<FinancePool, 'cash_balance' | 'bank_balance'> = { 'מזומן': 'cash_balance', 'חשבון': 'bank_balance' };

export function poolBalance(summary: Record<string, FinanceSummaryItem>, partner: string, pool: FinancePool): number {
    return Number(summary[partner]?.[POOL_KEY[pool]] || 0);
}

export interface TransferPreview {
    fromBefore: number;
    fromAfter: number;
    toBefore: number;
    toAfter: number;
    fromNegative: boolean;
}

/**
 * Pool balances before/after saving `draft`. When editing, `original` (already counted in the
 * summary unless archived) is first taken out so the preview shows the real effect of the edit.
 */
export function previewTransfer(
    summary: Record<string, FinanceSummaryItem>,
    draft: Pick<FinanceTransferInput, 'from_partner' | 'from_pool' | 'to_partner' | 'to_pool' | 'amount'>,
    original?: FinanceTransfer | null,
): TransferPreview {
    const base = (partner: string, pool: FinancePool) => {
        let v = poolBalance(summary, partner, pool);
        if (original && !original.archived_at) {
            if (original.from_partner === partner && original.from_pool === pool) v += Number(original.amount);
            if (original.to_partner === partner && original.to_pool === pool) v -= Number(original.amount);
        }
        return v;
    };
    const amount = Number.isFinite(draft.amount) && draft.amount > 0 ? draft.amount : 0;
    const fromBefore = base(draft.from_partner, draft.from_pool);
    const toBefore = base(draft.to_partner, draft.to_pool);
    const fromAfter = fromBefore - amount;
    return { fromBefore, fromAfter, toBefore, toAfter: toBefore + amount, fromNegative: fromAfter < 0 };
}

/** Transfers touching `partner`, with the direction and signed amount from that partner's view. */
export function transfersFor(transfers: FinanceTransfer[], partner: string) {
    return transfers
        .filter(t => t.from_partner === partner || t.to_partner === partner)
        .map(t => {
            const outgoing = t.from_partner === partner;
            return {
                transfer: t,
                outgoing,
                counterparty: outgoing ? t.to_partner : t.from_partner,
                counterpartyPool: outgoing ? t.to_pool : t.from_pool,
                ownPool: outgoing ? t.from_pool : t.to_pool,
                signedAmount: outgoing ? -Number(t.amount) : Number(t.amount),
            };
        });
}
