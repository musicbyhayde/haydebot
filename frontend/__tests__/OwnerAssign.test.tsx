/**
 * Improvement #4 (owner assignment): first assignment needs no note, transfers do, and the
 * "make you the owner?" prompt after a partner's first note on an unowned lead.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import LeadDetailPanel from '@/components/LeadDetailPanel';
import TransferLeadModal from '@/components/TransferLeadModal';
import { api } from '@/lib/api';
import { shouldOfferOwnership, ownerChangeNeedsNote, isOwnerName, OWNER_NOTE_PROMPT } from '@/lib/ownership';

const mockConfirm = jest.fn();
const mockSuccess = jest.fn();
const mockError = jest.fn();

jest.mock('@/components/ui', () => {
    const actual = jest.requireActual('@/components/ui');
    return {
        ...actual,
        useToast: () => ({
            success: mockSuccess,
            error: mockError,
            warning: jest.fn(),
            info: jest.fn(),
            toast: jest.fn(),
            confirm: mockConfirm,
        }),
    };
});

jest.mock('@/lib/api', () => ({
    api: {
        getNotes: jest.fn(),
        createNote: jest.fn(),
        updateNote: jest.fn(),
        transferLead: jest.fn(),
        updateLead: jest.fn(),
        getMessages: jest.fn().mockResolvedValue([]),
        getMusicians: jest.fn().mockResolvedValue([]),
        getTasks: jest.fn().mockResolvedValue([]),
        getFinanceEntries: jest.fn().mockResolvedValue([]),
        getLeadFinance: jest.fn().mockResolvedValue([]),
    },
}));

const mocked = api as jest.Mocked<typeof api>;

const makeLead = (fields: Record<string, unknown> = {}) => ({
    id: 'lead1',
    createdTime: '2026-01-01',
    fields: { Phone: '972501234567', Name: 'Test Lead', Status: 'Contacted', Service: 'DJ', ...fields },
});

const priorNote = {
    id: 'n0',
    fields: { Lead_ID: 'lead1', Author: 'קובי', Content: 'קודמת', Created_At: '2026-01-14T10:00:00Z' },
};

const renderPanel = (lead = makeLead(), userName = 'קובי') =>
    render(
        <LeadDetailPanel
            lead={lead as never}
            onClose={jest.fn()}
            currentUserName={userName}
            onStatusChange={jest.fn()}
        />
    );

const typeNote = (text = 'דיברתי איתו') => {
    fireEvent.change(screen.getByPlaceholderText(/כתוב עדכון/), { target: { value: text } });
};

beforeEach(() => {
    jest.clearAllMocks();
    mocked.getNotes.mockResolvedValue([]);
    mocked.createNote.mockResolvedValue({ id: 'new', fields: {} } as never);
    mocked.updateNote.mockResolvedValue({} as never);
    mocked.transferLead.mockResolvedValue({
        status: 'success',
        lead: { id: 'lead1', createdTime: '2026-01-01', fields: { Owner: 'קובי' } },
        note: { id: 'n_t', fields: { Lead_ID: 'lead1', Content: '🔄 שיוך', Author: 'קובי', Created_At: '2026-10-05T06:00:00Z' } },
    } as never);
    mockConfirm.mockResolvedValue(true);
});

describe('ownership helpers', () => {
    it('only partners are owner values', () => {
        expect(isOwnerName('אילן')).toBe(true);
        expect(isOwnerName('קובי')).toBe(true);
        expect(isOwnerName('מנהל')).toBe(false);
        expect(isOwnerName('bot:hayde-office-bot')).toBe(false);
        expect(isOwnerName('')).toBe(false);
    });

    it('note needed only for transfer/removal', () => {
        expect(ownerChangeNeedsNote('', 'אילן')).toBe(false);
        expect(ownerChangeNeedsNote(undefined, 'קובי')).toBe(false);
        expect(ownerChangeNeedsNote('קובי', 'אילן')).toBe(true);
        expect(ownerChangeNeedsNote('קובי', '')).toBe(true);
    });

    it('offer rules', () => {
        const base = { owner: '', notesBefore: 0, notesLoaded: true, userName: 'קובי' };
        expect(shouldOfferOwnership(base)).toBe(true);
        expect(shouldOfferOwnership({ ...base, owner: 'אילן' })).toBe(false);
        expect(shouldOfferOwnership({ ...base, notesBefore: 1 })).toBe(false);
        expect(shouldOfferOwnership({ ...base, notesLoaded: false })).toBe(false);
        expect(shouldOfferOwnership({ ...base, userName: 'מנהל' })).toBe(false);
        expect(shouldOfferOwnership({ ...base, userName: 'bot:hayde-office-bot' })).toBe(false);
    });
});

describe('LeadDetailPanel: owner prompt after first note', () => {
    it('nudge path "send without date": prompts and "yes" assigns via transfer (no note, via=note_prompt)', async () => {
        renderPanel();
        await waitFor(() => expect(mocked.getNotes).toHaveBeenCalled());
        await act(async () => {});
        typeNote();
        fireEvent.click(screen.getByText('שלח'));
        fireEvent.click(await screen.findByText('שלח בלי תאריך'));

        await waitFor(() => expect(mocked.createNote).toHaveBeenCalled());
        await waitFor(() => expect(mockConfirm).toHaveBeenCalledWith(
            expect.objectContaining({ message: OWNER_NOTE_PROMPT, confirmLabel: 'כן', cancelLabel: 'לא' })
        ));
        await waitFor(() => expect(mocked.transferLead).toHaveBeenCalledWith('lead1', {
            new_owner: 'קובי',
            previous_owner: '',
            handover_note: '',
            actor: 'קובי',
            via: 'note_prompt',
        }));
        // the note is created before the question is asked
        expect(mocked.createNote.mock.invocationCallOrder[0]).toBeLessThan(mockConfirm.mock.invocationCallOrder[0]);
    });

    it('nudge path "with date": prompts too', async () => {
        renderPanel(makeLead(), 'אילן');
        await waitFor(() => expect(mocked.getNotes).toHaveBeenCalled());
        await act(async () => {});
        typeNote();
        fireEvent.click(screen.getByText('שלח'));
        await screen.findByText('הוסף תאריך ושלח ✅');
        const nudge = screen.getByText('הוסף תאריך ושלח ✅').closest('.max-w-sm') as HTMLElement;
        fireEvent.change(nudge.querySelector('input[type="date"]')!, { target: { value: '2030-01-01' } });
        fireEvent.click(screen.getByText('הוסף תאריך ושלח ✅'));

        await waitFor(() => expect(mocked.createNote).toHaveBeenCalledWith('lead1', expect.objectContaining({ follow_up_date: '2030-01-01' })));
        await waitFor(() => expect(mocked.transferLead).toHaveBeenCalledWith('lead1', expect.objectContaining({ new_owner: 'אילן', via: 'note_prompt' })));
    });

    it('direct path (follow-up date already set, no nudge): prompts too', async () => {
        const { container } = renderPanel();
        await waitFor(() => expect(mocked.getNotes).toHaveBeenCalled());
        await act(async () => {});
        typeNote();
        const fu = container.querySelector('input[type="date"]') as HTMLInputElement;
        fireEvent.change(fu, { target: { value: '2030-02-02' } });
        fireEvent.click(screen.getByText('שלח'));
        await waitFor(() => expect(mocked.createNote).toHaveBeenCalled());
        expect(screen.queryByText('שלח בלי תאריך')).toBeNull();
        await waitFor(() => expect(mockConfirm).toHaveBeenCalledWith(expect.objectContaining({ message: OWNER_NOTE_PROMPT })));
        await waitFor(() => expect(mocked.transferLead).toHaveBeenCalled());
    });

    it('"no" keeps the lead without owner', async () => {
        mockConfirm.mockResolvedValue(false);
        renderPanel();
        await waitFor(() => expect(mocked.getNotes).toHaveBeenCalled());
        await act(async () => {});
        typeNote();
        fireEvent.click(screen.getByText('שלח'));
        fireEvent.click(await screen.findByText('שלח בלי תאריך'));
        await waitFor(() => expect(mockConfirm).toHaveBeenCalled());
        await act(async () => {});
        expect(mocked.transferLead).not.toHaveBeenCalled();
    });

    const expectNoPrompt = async (lead: ReturnType<typeof makeLead>, user: string) => {
        renderPanel(lead, user);
        await waitFor(() => expect(mocked.getNotes).toHaveBeenCalled());
        await act(async () => {});
        typeNote();
        fireEvent.click(screen.getByText('שלח'));
        fireEvent.click(await screen.findByText('שלח בלי תאריך'));
        await waitFor(() => expect(mocked.createNote).toHaveBeenCalled());
        await act(async () => {});
        expect(mockConfirm).not.toHaveBeenCalled();
        expect(mocked.transferLead).not.toHaveBeenCalled();
    };

    it('no prompt when the lead already has an owner', async () => {
        await expectNoPrompt(makeLead({ Owner: 'אילן' }), 'קובי');
    });

    it('no prompt when the lead already has notes', async () => {
        mocked.getNotes.mockResolvedValue([priorNote] as never);
        await expectNoPrompt(makeLead(), 'קובי');
    });

    it('no prompt for a non-partner user (admin "מנהל")', async () => {
        await expectNoPrompt(makeLead(), 'מנהל');
    });

    it('no prompt when notes failed to load (unknown history)', async () => {
        mocked.getNotes.mockRejectedValue(new Error('down'));
        await expectNoPrompt(makeLead(), 'קובי');
    });

    it('a stale view (409) shows the server reason and does not crash', async () => {
        mocked.transferLead.mockRejectedValue(Object.assign(new Error('x'), { status: 409, detail: 'המוביל השתנה בינתיים: אילן' }));
        renderPanel();
        await waitFor(() => expect(mocked.getNotes).toHaveBeenCalled());
        await act(async () => {});
        typeNote();
        fireEvent.click(screen.getByText('שלח'));
        fireEvent.click(await screen.findByText('שלח בלי תאריך'));
        await waitFor(() => expect(mockError).toHaveBeenCalledWith(expect.stringContaining('המוביל השתנה בינתיים')));
    });
});

describe('LeadDetailPanel: "שייך אליי"', () => {
    it('assigns directly without a note for a partner, in a non-New status', async () => {
        renderPanel(makeLead({ Status: 'Quote Sent' }), 'קובי');
        fireEvent.click(await screen.findByText(/שייך אליי \(קובי\)/));
        await waitFor(() => expect(mocked.transferLead).toHaveBeenCalledWith('lead1', {
            new_owner: 'קובי', previous_owner: '', handover_note: '', actor: 'קובי',
        }));
        expect(screen.queryByText('שיוך מוביל לליד')).toBeNull();
    });

    it('is hidden for the admin user (not an owner value)', async () => {
        renderPanel(makeLead(), 'מנהל');
        await waitFor(() => expect(mocked.getNotes).toHaveBeenCalled());
        expect(screen.queryByText(/שייך אליי/)).toBeNull();
        expect(screen.getByText('בחר מוביל...')).toBeInTheDocument();
    });
});

describe('TransferLeadModal rules', () => {
    const open = (fields: Record<string, unknown>, user = 'קובי') =>
        render(
            <TransferLeadModal isOpen lead={makeLead(fields) as never} currentUserName={user} onClose={jest.fn()} onTransferred={jest.fn()} />
        );

    it.each(['New', 'Contacted', 'Quote Sent', 'Won'])('first assignment in status %s: note optional', async (Status) => {
        open({ Status });
        expect(screen.getByText('שיוך מוביל לליד')).toBeInTheDocument();
        expect(screen.getByText('(אופציונלי)')).toBeInTheDocument();
        const btn = screen.getByText('שמור שיוך ליד').closest('button')!;
        expect(btn).not.toBeDisabled();
        fireEvent.click(btn);
        await waitFor(() => expect(mocked.transferLead).toHaveBeenCalledWith('lead1', {
            new_owner: 'קובי', previous_owner: '', handover_note: '', actor: 'קובי',
        }));
    });

    it('transfer between partners requires the hand-over note', () => {
        open({ Owner: 'קובי', Status: 'Contacted' });
        expect(screen.getByText('העברת מוביל ליד')).toBeInTheDocument();
        expect(screen.getByText('* (חובה)')).toBeInTheDocument();
        expect(screen.getByText('בצע העברה').closest('button')).toBeDisabled();
        expect(mocked.transferLead).not.toHaveBeenCalled();
    });

    it('admin user gets no default selection (must pick a partner)', () => {
        open({ Status: 'Contacted' }, 'מנהל');
        expect(screen.getByText('שמור שיוך ליד').closest('button')).toBeDisabled();
    });
});
