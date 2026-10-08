/**
 * Monthly finance totals for the home dashboard, computed from the finance entries
 * (GET /finance, which viewers cannot read). Same rules as the per-partner summary:
 * every row counts regardless of payment status; partner transfers are not income/expense.
 */
import { FinanceEntry } from '@/types';
import { parseDateToSortable } from '@/lib/formatters';

export interface MonthTotals {
    income: number;
    expenses: number;
    net: number;
    count: number;
}

/** 'YYYY-MM' of a finance Date ('2026-10-01', '2026-10-01T00:00:00', '1/10/2026'...) or ''. */
export function financeMonthKey(dateStr?: string | null): string {
    if (!dateStr) return '';
    const iso = dateStr.trim().match(/^(\d{4})-(\d{2})-\d{2}[T ]/);
    if (iso) return `${iso[1]}-${iso[2]}`;
    return parseDateToSortable(dateStr).slice(0, 7);
}

export function monthTotals(entries: FinanceEntry[], month: string): MonthTotals {
    const t: MonthTotals = { income: 0, expenses: 0, net: 0, count: 0 };
    for (const e of entries) {
        if (financeMonthKey(e.fields.Date) !== month) continue;
        const amount = Number(e.fields.Amount) || 0;
        if (e.fields.Type === 'income') t.income += amount;
        else t.expenses += amount;
        t.count += 1;
    }
    t.net = t.income - t.expenses;
    return t;
}
