/**
 * Read-only "viewer" role in the dashboard UI.
 * The backend is the real gate (deny-by-default); these tests check the UI stays honest:
 * write controls hidden, viewer-hidden screens absent, writes never leave the browser.
 */
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ReadOnlyContext, VIEWER_HIDDEN_VIEWS, isViewHiddenForViewer } from '@/lib/readOnly';
import LeadDetailPanel from '@/components/LeadDetailPanel';
import LeadsDashboard from '@/components/LeadsDashboard';
import Sidebar from '@/components/Sidebar';
import BottomNav from '@/components/BottomNav';
import ChatWindow from '@/components/ChatWindow';
import { api } from '@/lib/api';

jest.mock('@/lib/api', () => {
    const actual = jest.requireActual('@/lib/api');
    return {
        ...actual,
        api: {
            getNotes: jest.fn().mockResolvedValue([]),
            getMessages: jest.fn().mockResolvedValue([]),
            getMusicians: jest.fn().mockResolvedValue([]),
            getTasks: jest.fn().mockResolvedValue([]),
            getFinanceEntries: jest.fn().mockResolvedValue([]),
            getLeadFinance: jest.fn().mockResolvedValue([]),
            getLeads: jest.fn().mockResolvedValue([]),
            getPendingFollowUps: jest.fn().mockResolvedValue([]),
            updateLead: jest.fn(),
            createNote: jest.fn(),
        },
    };
});

const mocked = api as jest.Mocked<typeof api>;

const lead = {
    id: 'lead1',
    createdTime: '2026-01-01',
    fields: { Phone: '972501234567', Name: 'Viewer Lead', Status: 'New', Service: 'DJ' },
};

const asViewer = (ui: React.ReactElement) =>
    render(<ReadOnlyContext.Provider value={true}>{ui}</ReadOnlyContext.Provider>);

beforeEach(() => jest.clearAllMocks());

describe('viewer-hidden screens', () => {
    it('lists finance, musicians, videos, contacts, analytics and users', () => {
        for (const v of ['finance', 'musicians', 'videos', 'business-contacts', 'analytics', 'users']) {
            expect(VIEWER_HIDDEN_VIEWS).toContain(v);
        }
        expect(isViewHiddenForViewer('dashboard')).toBe(false);
        expect(isViewHiddenForViewer('tasks')).toBe(false);
        expect(isViewHiddenForViewer('history')).toBe(false);
    });
});

describe('LeadDetailPanel as viewer', () => {
    it('has no note composer or source selector, and loads finance per lead only', async () => {
        asViewer(
            <LeadDetailPanel lead={lead as never} onClose={jest.fn()} currentUserName="רוני" onStatusChange={jest.fn()} />
        );
        await waitFor(() => expect(mocked.getLeadFinance).toHaveBeenCalledWith('lead1'));
        expect(mocked.getFinanceEntries).not.toHaveBeenCalled();
        expect(screen.queryByPlaceholderText(/כתוב עדכון/)).not.toBeInTheDocument();
        expect(screen.queryByLabelText('שינוי מקור הליד')).not.toBeInTheDocument();
        expect(screen.getByText('Viewer Lead')).toBeInTheDocument();
    });

    it('still shows the composer for a normal user', async () => {
        render(<LeadDetailPanel lead={lead as never} onClose={jest.fn()} currentUserName="קובי" onStatusChange={jest.fn()} />);
        await waitFor(() => expect(mocked.getLeadFinance).toHaveBeenCalled());
        expect(screen.getByPlaceholderText(/כתוב עדכון/)).toBeInTheDocument();
    });
});

describe('LeadsDashboard as viewer', () => {
    const props = {
        leads: [lead] as never,
        onSelectLead: jest.fn(),
        onMenuClick: jest.fn(),
        currentUser: { id: 'v', email: 'v@example.com', displayName: 'רוני', role: 'viewer' as const },
        onRefresh: jest.fn(),
    };

    it('hides "new lead" and disables the status select', () => {
        asViewer(<LeadsDashboard {...props} />);
        expect(screen.queryByText('ליד חדש')).not.toBeInTheDocument();
        const select = screen.getByDisplayValue('חדש') as HTMLSelectElement;
        expect(select).toBeDisabled();
        fireEvent.change(select, { target: { value: 'Lost' } });
        expect(mocked.updateLead).not.toHaveBeenCalled();
    });
});

describe('navigation', () => {
    const base = {
        leads: [], musicians: [], activeId: null, onSelect: jest.fn(),
        currentView: 'home' as const, onViewChange: jest.fn(), onSignOut: jest.fn(),
    };

    it('viewer: no finance/musicians/videos/contacts/users, role label צפייה', () => {
        asViewer(<Sidebar {...base} currentUser={{ id: 'v', email: 'v@example.com', role: 'viewer', displayName: 'רוני' }} />);
        expect(screen.getByText('צפייה')).toBeInTheDocument();
        for (const label of [/כספים/, /^נגנים$/, /בנק סרטונים/, /אנשי קשר עסקיים/, /משתמשים/, /הורד גיבוי/]) {
            expect(screen.queryByText(label)).not.toBeInTheDocument();
        }
        expect(screen.getByText(/לידים/)).toBeInTheDocument();
        expect(screen.getByText(/משימות/)).toBeInTheDocument();
    });

    it('admin sees the users screen; partner does not', () => {
        const { unmount } = render(<Sidebar {...base} currentUser={{ id: 'a', email: 'a@example.com', role: 'admin', displayName: 'אילן' }} />);
        fireEvent.click(screen.getByText(/משתמשים/));
        expect(base.onViewChange).toHaveBeenCalledWith('users');
        unmount();
        render(<Sidebar {...base} currentUser={{ id: 'p', email: 'p@example.com', role: 'partner', displayName: 'קובי' }} />);
        expect(screen.queryByText(/משתמשים/)).not.toBeInTheDocument();
        expect(screen.getByText(/כספים/)).toBeInTheDocument();
    });

    it('bottom nav hides finance for viewers only', () => {
        const { unmount } = asViewer(<BottomNav currentView="home" onViewChange={jest.fn()} />);
        expect(screen.queryByText('כספים')).not.toBeInTheDocument();
        unmount();
        render(<BottomNav currentView="home" onViewChange={jest.fn()} />);
        expect(screen.getByText('כספים')).toBeInTheDocument();
    });
});

describe('ChatWindow as viewer', () => {
    beforeAll(() => { Element.prototype.scrollIntoView = jest.fn(); });
    it('shows messages without a composer', () => {
        asViewer(<ChatWindow item={lead as never} messages={[]} onSend={jest.fn()} />);
        expect(screen.queryByPlaceholderText(/הקלד תגובה/)).not.toBeInTheDocument();
        expect(screen.getByTestId('chat-read-only')).toBeInTheDocument();
        expect(screen.queryByText('שלח חומרים')).not.toBeInTheDocument();
    });
});
