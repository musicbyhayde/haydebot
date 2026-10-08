/**
 * Partner transfers ("העברה בין שותפים"): admin-only create/edit/archive, partner read-only,
 * balance card + 🏦/💵 chips come from the summary (which already includes transfers).
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import FinancePage from '@/components/FinancePage';
import { api, ApiError } from '@/lib/api';
import { previewTransfer, transfersFor } from '@/lib/financeTransfers';
import { FinanceTransfer } from '@/types';

jest.mock('@/lib/api', () => {
    class ApiError extends Error {
        detail?: string; status?: number;
        constructor(m: string, d?: string, s?: number) { super(m); this.detail = d; this.status = s; }
    }
    return {
        ApiError,
        api: {
            getFinanceEntries: jest.fn(),
            getFinanceSummary: jest.fn(),
            getLeads: jest.fn(),
            getFinanceTransfers: jest.fn(),
            createFinanceTransfer: jest.fn(),
            updateFinanceTransfer: jest.fn(),
            archiveFinanceTransfer: jest.fn(),
            unarchiveFinanceTransfer: jest.fn(),
        },
    };
});

const m = api as jest.Mocked<typeof api>;
const admin = { id: '1', uid: '1', email: 'a@x.com', displayName: 'אילן', role: 'admin' as const };
const partner = { id: '2', uid: '2', email: 'k@x.com', displayName: 'קובי', role: 'partner' as const };

const T1: FinanceTransfer = {
    id: 't1', transfer_date: '2026-10-08', amount: 6000, from_partner: 'קובי', from_pool: 'מזומן',
    to_partner: 'אילן', to_pool: 'חשבון', note: 'יישור', created_by: 'a@x.com',
};
// Summary as returned by the backend: transfers already applied to balance + pools.
const SUMMARY = {
    'אילן': { income: 0, expenses: 3000, balance: 3000, cash_balance: 0, bank_balance: 3000, transfers_in: 6000, transfers_out: 0 },
    'קובי': { income: 10000, expenses: 0, balance: 4000, cash_balance: 4000, bank_balance: 0, transfers_in: 0, transfers_out: 6000 },
};

beforeEach(() => {
    jest.clearAllMocks();
    m.getFinanceEntries.mockResolvedValue([]);
    m.getFinanceSummary.mockResolvedValue(SUMMARY);
    m.getLeads.mockResolvedValue([]);
    m.getFinanceTransfers.mockResolvedValue([T1]);
    m.createFinanceTransfer.mockResolvedValue(T1);
    m.updateFinanceTransfer.mockResolvedValue(T1);
    m.archiveFinanceTransfer.mockResolvedValue({ ...T1, archived_at: '2026-10-08T10:00:00Z' });
    m.unarchiveFinanceTransfer.mockResolvedValue(T1);
});

describe('helpers', () => {
    it('previews pool balances and warns on a negative source', () => {
        const p = previewTransfer(SUMMARY, { from_partner: 'קובי', from_pool: 'מזומן', to_partner: 'אילן', to_pool: 'מזומן', amount: 5000 });
        expect(p).toEqual({ fromBefore: 4000, fromAfter: -1000, toBefore: 0, toAfter: 5000, fromNegative: true });
    });
    it('takes the original transfer out when editing', () => {
        const p = previewTransfer(SUMMARY, { ...T1, amount: 5000 }, T1);
        expect(p.fromBefore).toBe(10000);
        expect(p.fromAfter).toBe(5000);
        expect(p.toBefore).toBe(-3000);
        expect(p.toAfter).toBe(2000);
    });
    it('gives each partner its own direction', () => {
        expect(transfersFor([T1], 'קובי')[0]).toMatchObject({ outgoing: true, counterparty: 'אילן', ownPool: 'מזומן', signedAmount: -6000 });
        expect(transfersFor([T1], 'אילן')[0]).toMatchObject({ outgoing: false, counterparty: 'קובי', ownPool: 'חשבון', signedAmount: 6000 });
    });
});

describe('FinancePage transfers', () => {
    it('admin sees the transfer button and transfer rows in both partner tables', async () => {
        render(<FinancePage currentUser={admin} />);
        await waitFor(() => expect(screen.getByRole('button', { name: /העברה בין שותפים/ })).toBeInTheDocument());
        const rows = screen.getAllByTestId('transfer-row');
        expect(rows.length).toBeGreaterThanOrEqual(2);       // mobile tab + desktop columns
        expect(screen.getAllByText('→ לאילן (חשבון)').length).toBeGreaterThan(0);
        expect(screen.getAllByText('← מקובי (מזומן)').length).toBeGreaterThan(0);
        expect(screen.getAllByLabelText('ערוך העברה').length).toBeGreaterThan(0);
        expect(screen.getAllByLabelText('ארכב העברה').length).toBeGreaterThan(0);
    });

    it('balance card and chips show the summary values (chips sum to יתרה)', async () => {
        render(<FinancePage currentUser={admin} />);
        await waitFor(() => screen.getAllByTestId('transfer-row'));
        // אילן is the default tab: יתרה 3,000 = 🏦 3,000 + 💵 0
        expect(screen.getAllByText(/🏦\s*‏?3,000/).length).toBeGreaterThan(0);
        expect(screen.getAllByTitle('יתרה = הכנסות − הוצאות ± העברות בין שותפים').length).toBeGreaterThan(0);
    });

    it('partner sees transfers read-only (no button, no edit/archive)', async () => {
        render(<FinancePage currentUser={partner} />);
        await waitFor(() => expect(screen.getAllByTestId('transfer-row').length).toBeGreaterThan(0));
        expect(screen.queryByRole('button', { name: /העברה בין שותפים/ })).not.toBeInTheDocument();
        expect(screen.queryByLabelText('ערוך העברה')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('ארכב העברה')).not.toBeInTheDocument();
    });

    it('page still works when the transfers endpoint fails', async () => {
        m.getFinanceTransfers.mockRejectedValue(new Error('503'));
        render(<FinancePage currentUser={admin} />);
        await waitFor(() => expect(screen.getByText(/ניהול כספים/)).toBeInTheDocument());
        expect(screen.queryByTestId('transfer-row')).not.toBeInTheDocument();
    });

    it('admin creates a transfer; same partner is impossible; negative source warns', async () => {
        render(<FinancePage currentUser={admin} />);
        await waitFor(() => screen.getByRole('button', { name: /העברה בין שותפים/ }));
        fireEvent.click(screen.getByRole('button', { name: /העברה בין שותפים/ }));
        const dialog = screen.getByRole('dialog', { name: 'העברה בין שותפים' });
        const d = within(dialog);
        // choosing the same partner on both sides flips the other side
        fireEvent.change(d.getByLabelText('ל־ שותף'), { target: { value: 'אילן' } });
        expect((d.getByLabelText('מ־ שותף') as HTMLSelectElement).value).toBe('קובי');
        fireEvent.change(d.getByLabelText('מ־ מצבור'), { target: { value: 'מזומן' } });
        fireEvent.change(d.getByLabelText(/סכום/), { target: { value: '5000' } });
        expect(d.getByText(/יהיה שלילי אחרי ההעברה/)).toBeInTheDocument();     // 4,000 - 5,000
        fireEvent.change(d.getByLabelText('הערה'), { target: { value: '  יישור  ' } });
        fireEvent.click(d.getByText('שמור העברה'));
        await waitFor(() => expect(m.createFinanceTransfer).toHaveBeenCalledTimes(1));
        expect(m.createFinanceTransfer.mock.calls[0][0]).toMatchObject({
            amount: 5000, from_partner: 'קובי', from_pool: 'מזומן', to_partner: 'אילן', to_pool: 'חשבון', note: 'יישור',
        });
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(m.getFinanceSummary).toHaveBeenCalledTimes(2);      // refreshed after save
    });

    it('validates the amount and shows backend errors', async () => {
        m.createFinanceTransfer.mockRejectedValue(new ApiError('x', 'סכום גדול מדי', 400));
        render(<FinancePage currentUser={admin} />);
        await waitFor(() => screen.getByRole('button', { name: /העברה בין שותפים/ }));
        fireEvent.click(screen.getByRole('button', { name: /העברה בין שותפים/ }));
        const d = within(screen.getByRole('dialog'));
        fireEvent.click(d.getByText('שמור העברה'));
        expect(d.getByRole('alert')).toHaveTextContent('חובה להזין סכום חיובי');
        expect(m.createFinanceTransfer).not.toHaveBeenCalled();
        fireEvent.change(d.getByLabelText(/סכום/), { target: { value: '100' } });
        fireEvent.click(d.getByText('שמור העברה'));
        await waitFor(() => expect(d.getByRole('alert')).toHaveTextContent('סכום גדול מדי'));
    });

    it('admin edits and archives a transfer', async () => {
        render(<FinancePage currentUser={admin} />);
        await waitFor(() => screen.getAllByLabelText('ערוך העברה'));
        fireEvent.click(screen.getAllByLabelText('ערוך העברה')[0]);
        const d = within(screen.getByRole('dialog'));
        expect((d.getByLabelText(/סכום/) as HTMLInputElement).value).toBe('6000');
        fireEvent.change(d.getByLabelText(/סכום/), { target: { value: '5500' } });
        fireEvent.click(d.getByText('שמור העברה'));
        await waitFor(() => expect(m.updateFinanceTransfer).toHaveBeenCalledWith('t1', expect.objectContaining({ amount: 5500 })));

        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        fireEvent.click(screen.getAllByLabelText('ארכב העברה')[0]);
        await waitFor(() => expect(m.archiveFinanceTransfer).toHaveBeenCalledWith('t1'));
    });

    it('archived toggle reloads with archived transfers and offers restore', async () => {
        m.getFinanceTransfers.mockImplementation(async (inc?: boolean) => inc ? [{ ...T1, archived_at: '2026-10-08T10:00:00Z' }] : []);
        render(<FinancePage currentUser={admin} />);
        await waitFor(() => screen.getAllByText('הצג העברות מאורכבות'));
        expect(screen.queryByTestId('transfer-row')).not.toBeInTheDocument();
        fireEvent.click(screen.getAllByLabelText('הצג העברות מאורכבות')[0]);
        await waitFor(() => expect(m.getFinanceTransfers).toHaveBeenLastCalledWith(true));
        await waitFor(() => expect(screen.getAllByText('מאורכבת').length).toBeGreaterThan(0));
        fireEvent.click(screen.getAllByLabelText('שחזר העברה')[0]);
        await waitFor(() => expect(m.unarchiveFinanceTransfer).toHaveBeenCalledWith('t1'));
    });
});
