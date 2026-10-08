/**
 * Finance owner rules (Ilan 2026-10-08): moving an entry between partners is admin-only;
 * every new entry belongs to a partner (the admin account 'מנהל' must pick one).
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LeadDetailPanel from '@/components/LeadDetailPanel';
import FinancePage from '@/components/FinancePage';
import LeadsDashboard from '@/components/LeadsDashboard';
import { api } from '@/lib/api';

jest.mock('@/lib/api', () => ({
    api: {
        getNotes: jest.fn(), getMessages: jest.fn(), getMusicians: jest.fn(), getTasks: jest.fn(),
        getFinanceEntries: jest.fn(), getLeadFinance: jest.fn(), getFinanceSummary: jest.fn(),
        getLeads: jest.fn(), getFinanceTransfers: jest.fn(), getPendingFollowUps: jest.fn(), updateLead: jest.fn(),
        updateFinanceEntry: jest.fn(), createFinanceEntry: jest.fn(), deleteFinanceEntry: jest.fn(),
    },
}));

const m = api as jest.Mocked<typeof api>;
const lead = { id: 'lead1', createdTime: '2026-01-01', fields: { Phone: '972501234567', Name: 'Test Lead', Status: 'New', Service: 'DJ' } };
const ENTRY = {
    id: 'f1',
    fields: { Owner: 'קובי', Type: 'income' as const, Date: '2026-10-01', Description: 'מקדמה', Amount: 1000,
              Payment_Status: 'שולם', Payment_Method: 'חשבון' as const, Lead_ID: 'lead1' },
};

beforeEach(() => {
    jest.clearAllMocks();
    for (const f of ['getNotes', 'getMessages', 'getMusicians', 'getTasks', 'getFinanceEntries', 'getLeads', 'getFinanceTransfers', 'getPendingFollowUps'] as const) {
        m[f].mockResolvedValue([] as never);
    }
    m.getLeadFinance.mockResolvedValue([ENTRY] as never);
    m.getFinanceSummary.mockResolvedValue({});
    m.updateFinanceEntry.mockResolvedValue(ENTRY as never);
    m.createFinanceEntry.mockResolvedValue(ENTRY as never);
    m.updateLead.mockResolvedValue({} as never);
});

// the finance modal's amount field (the panel has another '0' input above it)
const modalAmount = () => screen.getAllByPlaceholderText('0').slice(-1)[0];

async function panel(props: { currentUserName: string; isAdminUser: boolean }) {
    render(<LeadDetailPanel lead={lead as never} onClose={jest.fn()} onStatusChange={jest.fn()} isAdmin {...props} />);
    await waitFor(() => expect(m.getLeadFinance).toHaveBeenCalled());
    fireEvent.click(screen.getByText(/פיננסי/));
}

describe('LeadDetailPanel finance', () => {
    it('partner edit: owner is read-only and Owner is not sent', async () => {
        await panel({ currentUserName: 'קובי', isAdminUser: false });
        fireEvent.click(await screen.findByLabelText('ערוך תנועה'));
        expect(screen.getByTestId('finance-owner-readonly')).toHaveTextContent('קובי');
        expect(screen.queryByRole('button', { name: 'אילן' })).not.toBeInTheDocument();
        fireEvent.click(screen.getByText('שמור'));
        await waitFor(() => expect(m.updateFinanceEntry).toHaveBeenCalledTimes(1));
        expect(m.updateFinanceEntry.mock.calls[0][1]).not.toHaveProperty('Owner');
    });

    it('admin edit: can move the entry to the other partner', async () => {
        await panel({ currentUserName: 'מנהל', isAdminUser: true });
        fireEvent.click(await screen.findByLabelText('ערוך תנועה'));
        fireEvent.click(screen.getByRole('button', { name: 'אילן' }));
        fireEvent.click(screen.getByText('שמור'));
        await waitFor(() => expect(m.updateFinanceEntry).toHaveBeenCalledWith('f1', expect.objectContaining({ Owner: 'אילן' })));
    });

    it("admin account 'מנהל' must pick a partner before creating", async () => {
        await panel({ currentUserName: 'מנהל', isAdminUser: true });
        fireEvent.click(await screen.findByText('+ הוסף הכנסה'));
        fireEvent.change(modalAmount(), { target: { value: '300' } });
        fireEvent.change(screen.getByPlaceholderText(/מקדמה, דלק/), { target: { value: 'מקדמה' } });
        expect(screen.getByText('שמור')).toBeDisabled();
        expect(screen.getByText('יש לבחור שותף')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'קובי' }));
        fireEvent.click(screen.getByText('שמור'));
        await waitFor(() => expect(m.createFinanceEntry).toHaveBeenCalledWith(expect.objectContaining({ Owner: 'קובי', Lead_ID: 'lead1' })));
    });

    it('partner creating is locked to themselves', async () => {
        await panel({ currentUserName: 'קובי', isAdminUser: false });
        fireEvent.click(await screen.findByText('+ הוסף הכנסה'));
        expect(screen.getByTestId('finance-owner-readonly')).toHaveTextContent('קובי');
        expect(screen.queryByRole('button', { name: 'אילן' })).not.toBeInTheDocument();
        fireEvent.change(modalAmount(), { target: { value: '300' } });
        fireEvent.change(screen.getByPlaceholderText(/מקדמה, דלק/), { target: { value: 'מקדמה' } });
        fireEvent.click(screen.getByText('שמור'));
        await waitFor(() => expect(m.createFinanceEntry).toHaveBeenCalledWith(expect.objectContaining({ Owner: 'קובי' })));
    });
});

describe('FinancePage', () => {
    it('partner edit never sends Owner', async () => {
        m.getFinanceEntries.mockResolvedValue([ENTRY] as never);
        render(<FinancePage currentUser={{ id: '2', email: 'k@x.com', displayName: 'קובי', role: 'partner' }} />);
        await waitFor(() => expect(screen.getAllByLabelText('ערוך תנועה').length).toBeGreaterThan(0));
        fireEvent.click(screen.getAllByLabelText('ערוך תנועה')[0]);
        expect(screen.queryByText(/למי לשייך/)).not.toBeInTheDocument();
        fireEvent.click(screen.getByText('שמור רשומה'));
        await waitFor(() => expect(m.updateFinanceEntry).toHaveBeenCalledTimes(1));
        expect(m.updateFinanceEntry.mock.calls[0][1]).not.toHaveProperty('Owner');
    });

    it('admin edit can move an entry to the other partner', async () => {
        m.getFinanceEntries.mockResolvedValue([{ ...ENTRY, fields: { ...ENTRY.fields, Owner: 'אילן' } }] as never);
        render(<FinancePage currentUser={{ id: '1', email: 'a@x.com', displayName: 'מנהל', role: 'admin' }} />);
        await waitFor(() => expect(screen.getAllByLabelText('ערוך תנועה').length).toBeGreaterThan(0));
        fireEvent.click(screen.getAllByLabelText('ערוך תנועה')[0]);
        expect(screen.getByText(/למי לשייך/)).toBeInTheDocument();
        // admin moves it to קובי (the modal's owner picker is the first 'קובי' button in the DOM)
        fireEvent.click(screen.getAllByRole('button', { name: 'קובי' })[0]);
        fireEvent.click(screen.getByText('שמור רשומה'));
        await waitFor(() => expect(m.updateFinanceEntry).toHaveBeenCalledWith('f1', expect.objectContaining({ Owner: 'קובי' })));
    });
});

describe('LeadsDashboard commission collection', () => {
    const referred = [{ id: 'r1', createdTime: '2026-01-01', fields: { Phone: '111', Name: 'Ref Lead', Status: 'Referred',
        Commission_Status: 'ממתין לגבייה', Commission_Amount: 500 } }];
    const open = async (user: { id: string; email: string; displayName: string; role: 'admin' | 'partner' }) => {
        render(<LeadsDashboard leads={referred as never} onSelectLead={jest.fn()} currentUser={user} onRefresh={jest.fn()} />);
        fireEvent.click((await screen.findAllByTitle('סמן כנגבה וצור פעולה כספית'))[0]);
    };

    it('partner collects only for themselves (no picker)', async () => {
        await open({ id: '2', email: 'k@x.com', displayName: 'קובי', role: 'partner' });
        expect(screen.getByTestId('collect-owner-readonly')).toHaveTextContent('קובי');
        fireEvent.click(screen.getByText('אישור וסיום'));
        await waitFor(() => expect(m.createFinanceEntry).toHaveBeenCalledWith(expect.objectContaining({ Owner: 'קובי', Lead_ID: 'r1' })));
    });

    it("admin account 'מנהל' must pick a partner", async () => {
        await open({ id: '1', email: 'a@x.com', displayName: 'מנהל', role: 'admin' });
        expect(screen.getByText('אישור וסיום')).toBeDisabled();
        fireEvent.change(screen.getByDisplayValue('בחר שותף'), { target: { value: 'אילן' } });
        fireEvent.click(screen.getByText('אישור וסיום'));
        await waitFor(() => expect(m.createFinanceEntry).toHaveBeenCalledWith(expect.objectContaining({ Owner: 'אילן' })));
    });
});
