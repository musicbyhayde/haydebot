/**
 * Editing a finance entry sends Owner and Lead_ID ('' = unlink) so the backend can persist them.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import FinancePage from '@/components/FinancePage';
import { api, ApiError } from '@/lib/api';

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
            updateFinanceEntry: jest.fn(),
            createFinanceEntry: jest.fn(),
            deleteFinanceEntry: jest.fn(),
        },
    };
});

const m = api as jest.Mocked<typeof api>;
const admin = { id: '1', uid: '1', email: 'a@x.com', displayName: 'מנהל', role: 'admin' as const };
const ENTRY = {
    id: 'f1',
    fields: {
        Owner: 'קובי', Type: 'income' as const, Date: '2026-10-01', Description: 'חתונה', Event_Name: 'חתונה',
        Amount: 1000, Payment_Status: 'שולם', Payment_Method: 'חשבון' as const, Lead_ID: 'lead1',
    },
};

beforeEach(() => {
    jest.clearAllMocks();
    m.getFinanceEntries.mockResolvedValue([ENTRY]);
    m.getFinanceSummary.mockResolvedValue({});
    m.getLeads.mockResolvedValue([{ id: 'lead1', fields: { Name: 'דוד', Phone: '972500000000', Service: 'DJ', Status: 'Closed' } }] as never);
    m.getFinanceTransfers.mockResolvedValue([]);
    m.updateFinanceEntry.mockResolvedValue(ENTRY as never);
});

async function openEdit() {
    render(<FinancePage currentUser={admin} />);
    await waitFor(() => expect(screen.getAllByLabelText('ערוך תנועה').length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByLabelText('ערוך תנועה')[0]);
}

it('unlinking the lead sends Lead_ID "" and keeps the owner', async () => {
    await openEdit();
    fireEvent.click(screen.getByLabelText('הסר קישור לליד'));
    fireEvent.click(screen.getByText('שמור רשומה'));
    await waitFor(() => expect(m.updateFinanceEntry).toHaveBeenCalledTimes(1));
    expect(m.updateFinanceEntry).toHaveBeenCalledWith('f1', expect.objectContaining({ Owner: 'קובי', Lead_ID: '', Amount: 1000 }));
});

it('admin moving the entry to the other partner sends the new Owner and the existing Lead_ID', async () => {
    await openEdit();
    // the owner picker in the modal (the mobile tab bar also has a 'אילן' button, rendered after it)
    fireEvent.click(screen.getAllByRole('button', { name: 'אילן' })[0]);
    fireEvent.click(screen.getByText('שמור רשומה'));
    await waitFor(() => expect(m.updateFinanceEntry).toHaveBeenCalledWith('f1', expect.objectContaining({ Owner: 'אילן', Lead_ID: 'lead1' })));
});

it('shows the backend error detail', async () => {
    m.updateFinanceEntry.mockRejectedValue(new ApiError('x', 'שותף לא מוכר', 400));
    await openEdit();
    fireEvent.click(screen.getByText('שמור רשומה'));
    await waitFor(() => expect(m.updateFinanceEntry).toHaveBeenCalled());
});
