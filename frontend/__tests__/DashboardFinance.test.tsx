/**
 * Home dashboard "סיכום כספי — <month>" widget: computed from the finance entries of the current
 * month (it used to look up a month key in the per-partner summary and was always empty).
 * Viewers never load finance data.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import AdminDashboard from '@/components/AdminDashboard';
import { ReadOnlyContext } from '@/lib/readOnly';
import { api } from '@/lib/api';
import { financeMonthKey, monthTotals } from '@/lib/financeMonth';

jest.mock('@/lib/api', () => ({
    api: {
        getTasks: jest.fn(),
        getActivities: jest.fn(),
        getFinanceEntries: jest.fn(),
        getFinanceSummary: jest.fn(),
        updateTask: jest.fn(),
    },
}));

const m = api as jest.Mocked<typeof api>;
const now = new Date();
const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
const prev = new Date(now.getFullYear(), now.getMonth() - 1, 15);
const prevYm = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
const e = (id: string, Type: 'income' | 'expense', Amount: number, Date: string, Owner = 'אילן') =>
    ({ id, fields: { Owner, Type, Amount, Date, Description: 'x', Payment_Status: 'שולם' } });
const ENTRIES = [
    e('1', 'income', 5000, `${ym}-03`),
    e('2', 'income', 2500, `${ym}-10`, 'קובי'),
    e('3', 'expense', 1200, `${ym}-11T00:00:00`),
    e('4', 'income', 99999, `${prevYm}-15`),          // other month: ignored
];

beforeEach(() => {
    jest.clearAllMocks();
    m.getTasks.mockResolvedValue([]);
    m.getActivities.mockResolvedValue([]);
    m.getFinanceEntries.mockResolvedValue(ENTRIES as never);
});

describe('financeMonth helpers', () => {
    it('reads the month of all date formats', () => {
        expect(financeMonthKey('2026-10-03')).toBe('2026-10');
        expect(financeMonthKey('2026-10-03T00:00:00+00:00')).toBe('2026-10');
        expect(financeMonthKey('3/10/2026')).toBe('2026-10');
        expect(financeMonthKey('')).toBe('');
    });
    it('sums income and expenses of one month across partners', () => {
        expect(monthTotals(ENTRIES as never, ym)).toEqual({ income: 7500, expenses: 1200, net: 6300, count: 3 });
        expect(monthTotals(ENTRIES as never, '1999-01').count).toBe(0);
    });
});

describe('AdminDashboard finance widget', () => {
    it('shows this month totals for admin/partner', async () => {
        render(<AdminDashboard leads={[]} />);
        await waitFor(() => expect(screen.getByText('רווח')).toBeInTheDocument());
        expect(m.getFinanceEntries).toHaveBeenCalledTimes(1);
        expect(m.getFinanceSummary).not.toHaveBeenCalled();
        const fmt = (n: number) => new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);
        const text = document.body.textContent || '';
        for (const n of [7500, 1200, 6300]) {
            const plain = fmt(n).replace(/[^\d,]/g, '');
            expect(text).toContain(plain);
        }
        expect(text).not.toContain('99,999');
    });

    it('shows the empty state when the month has no entries', async () => {
        m.getFinanceEntries.mockResolvedValue([ENTRIES[3]] as never);
        render(<AdminDashboard leads={[]} />);
        await waitFor(() => expect(screen.getByText('אין נתונים כספיים לחודש זה')).toBeInTheDocument());
    });

    it('viewer: no finance request and no widget', async () => {
        render(<ReadOnlyContext.Provider value={true}><AdminDashboard leads={[]} /></ReadOnlyContext.Provider>);
        await waitFor(() => expect(m.getTasks).toHaveBeenCalled());
        expect(m.getFinanceEntries).not.toHaveBeenCalled();
        expect(screen.queryByText(/סיכום כספי/)).not.toBeInTheDocument();
    });
});
