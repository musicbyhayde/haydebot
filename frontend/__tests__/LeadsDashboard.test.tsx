/**
 * LeadsDashboard component tests.
 * Tests archive splitting, collapsible sections, and table rendering.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import LeadsDashboard from '@/components/LeadsDashboard';

const mockLeads = [
    { id: 'l1', createdTime: '2026-01-01', fields: { Phone: '111', Name: 'Active Lead', Status: 'New', Service: 'DJ' } },
    { id: 'l2', createdTime: '2026-01-02', fields: { Phone: '222', Name: 'Processing Lead', Status: 'Processing', Service: 'Band' } },
    { id: 'l3', createdTime: '2026-01-03', fields: { Phone: '333', Name: 'Closed Lead', Status: 'Closed', Closing_Amount: 5000 } },
    { id: 'l4', createdTime: '2026-01-04', fields: { Phone: '444', Name: 'Lost Lead', Status: 'Lost', Lost_Reason: 'מחיר' } },
    { id: 'l5', createdTime: '2026-01-05', fields: { Phone: '555', Name: 'Another Closed', Status: 'Closed', Closing_Amount: 3000 } },
];

jest.mock('@/lib/api', () => ({
    api: {
        getLeads: jest.fn().mockResolvedValue([]),
        getMusicians: jest.fn().mockResolvedValue([]),
        getNotes: jest.fn().mockResolvedValue([]),
        getMessages: jest.fn().mockResolvedValue([]),
        getTasks: jest.fn().mockResolvedValue([]),
    },
}));

const defaultProps = {
    leads: mockLeads,
    onSelectLead: jest.fn(),
    onMenuClick: jest.fn(),
    currentUser: { id: '1', uid: '1', email: 'test@test.com', displayName: 'אילן', role: 'admin' as const },
    onRefresh: jest.fn(),
};

describe('LeadsDashboard', () => {
    describe('Active Leads Table', () => {
        it('displays only active leads in the main table', () => {
            render(<LeadsDashboard {...defaultProps} />);
            expect(screen.getByText('Active Lead')).toBeInTheDocument();
            expect(screen.getByText('Processing Lead')).toBeInTheDocument();
        });

        it('does not display closed/lost leads in the main view', () => {
            render(<LeadsDashboard {...defaultProps} />);
            expect(screen.getByText('Active Lead')).toBeInTheDocument();
            expect(screen.queryByText('Closed Lead')).not.toBeInTheDocument();
            expect(screen.queryByText('Lost Lead')).not.toBeInTheDocument();
        });
    });

    describe('Closed Leads Archive', () => {
        it('shows closed leads section with correct count', () => {
            render(<LeadsDashboard {...defaultProps} />);
            const closedButton = screen.getByText(/לידים סגורים/);
            expect(closedButton).toBeInTheDocument();
            // The badge with count 2 should be near the closed section
            const closedSection = closedButton.closest('button')!;
            expect(within(closedSection).getByText('2')).toBeInTheDocument();
        });

        it('is collapsed by default', () => {
            render(<LeadsDashboard {...defaultProps} />);
            // Closed leads names should NOT be visible since collapsed
            expect(screen.queryByText('Closed Lead')).not.toBeInTheDocument();
        });

        it('expands on click to show closed leads', () => {
            render(<LeadsDashboard {...defaultProps} />);
            fireEvent.click(screen.getByText(/לידים סגורים/));
            expect(screen.getByText('Closed Lead')).toBeInTheDocument();
            expect(screen.getByText('Another Closed')).toBeInTheDocument();
        });
    });

    describe('Lost Leads Archive', () => {
        it('shows lost leads section with correct count', () => {
            render(<LeadsDashboard {...defaultProps} />);
            const lostButton = screen.getByText(/לידים אבודים/);
            expect(lostButton).toBeInTheDocument();
            const lostSection = lostButton.closest('button')!;
            expect(within(lostSection).getByText('1')).toBeInTheDocument();
        });

        it('is collapsed by default', () => {
            render(<LeadsDashboard {...defaultProps} />);
            expect(screen.queryByText('Lost Lead')).not.toBeInTheDocument();
        });

        it('expands on click to show lost leads', () => {
            render(<LeadsDashboard {...defaultProps} />);
            fireEvent.click(screen.getByText(/לידים אבודים/));
            expect(screen.getByText('Lost Lead')).toBeInTheDocument();
        });
    });

    describe('Archive Toggle Independence', () => {
        it('opening closed does not open lost', () => {
            render(<LeadsDashboard {...defaultProps} />);
            fireEvent.click(screen.getByText(/לידים סגורים/));
            expect(screen.getByText('Closed Lead')).toBeInTheDocument();
            expect(screen.queryByText('Lost Lead')).not.toBeInTheDocument();
        });

        it('opening lost does not open closed', () => {
            render(<LeadsDashboard {...defaultProps} />);
            fireEvent.click(screen.getByText(/לידים אבודים/));
            expect(screen.getByText('Lost Lead')).toBeInTheDocument();
            expect(screen.queryByText('Closed Lead')).not.toBeInTheDocument();
        });
    });

    describe('Edge Cases', () => {
        it('hides archive sections when no archived leads', () => {
            const activeOnly = mockLeads.filter(l => !['Closed', 'Lost'].includes(l.fields.Status));
            render(<LeadsDashboard {...defaultProps} leads={activeOnly} />);
            expect(screen.queryByText(/לידים סגורים/)).not.toBeInTheDocument();
            expect(screen.queryByText(/לידים אבודים/)).not.toBeInTheDocument();
        });

        it('handles empty leads array', () => {
            render(<LeadsDashboard {...defaultProps} leads={[]} />);
            expect(screen.queryByText(/לידים סגורים/)).not.toBeInTheDocument();
        });
    });
});
