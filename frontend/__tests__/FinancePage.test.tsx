/**
 * FinancePage component tests.
 * Tests form validation, dynamic fields, lead search, and rendering.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FinancePage from '@/components/FinancePage';

// Mock API
jest.mock('@/lib/api', () => ({
    api: {
        getFinanceEntries: jest.fn().mockResolvedValue([]),
        getFinanceSummary: jest.fn().mockResolvedValue({}),
        getLeads: jest.fn().mockResolvedValue([
            { id: 'lead1', fields: { Name: 'David Cohen', Phone: '972501111111', Service: 'DJ', Status: 'New', Event_Date: '2026-06-15' } },
            { id: 'lead2', fields: { Name: 'Sarah Levi', Phone: '972502222222', Service: 'Band', Status: 'Processing' } },
            { id: 'lead3', fields: { Name: 'Lost Lead', Phone: '972503333333', Service: 'DJ', Status: 'Lost' } },
        ]),
        createFinanceEntry: jest.fn().mockResolvedValue({ id: 'f1', fields: {} }),
        updateFinanceEntry: jest.fn().mockResolvedValue({}),
        deleteFinanceEntry: jest.fn().mockResolvedValue(undefined),
    },
}));

const mockUser = { id: '1', uid: '1', email: 'test@test.com', displayName: 'אילן', role: 'admin' as const };

describe('FinancePage', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('renders loading state initially', () => {
        render(<FinancePage currentUser={mockUser} />);
        expect(screen.getByText('טוען נתונים...')).toBeInTheDocument();
    });

    it('renders page header after loading', async () => {
        render(<FinancePage currentUser={mockUser} />);
        await waitFor(() => {
            expect(screen.getByText(/ניהול כספים/)).toBeInTheDocument();
        });
    });

    it('shows add form when button clicked', async () => {
        render(<FinancePage currentUser={mockUser} />);
        await waitFor(() => {
            expect(screen.getByText(/רשומה חדשה/)).toBeInTheDocument();
        });
        fireEvent.click(screen.getByText(/רשומה חדשה/));
        expect(screen.getByText('סוג תנועה *')).toBeInTheDocument();
    });

    describe('Form Validation', () => {
        it('shows error when submitting empty form', async () => {
            render(<FinancePage currentUser={mockUser} />);
            await waitFor(() => screen.getByText(/רשומה חדשה/));
            fireEvent.click(screen.getByText(/רשומה חדשה/));

            // Click submit without filling anything
            fireEvent.click(screen.getByText('+ אילן'));
            await waitFor(() => {
                expect(screen.getByText(/שדות חובה שלא מולאו/)).toBeInTheDocument();
            });
        });

        it('shows description error when empty', async () => {
            render(<FinancePage currentUser={mockUser} />);
            await waitFor(() => screen.getByText(/רשומה חדשה/));
            fireEvent.click(screen.getByText(/רשומה חדשה/));
            fireEvent.click(screen.getByText('+ אילן'));
            await waitFor(() => {
                expect(screen.getByText(/חובה להזין פירוט/)).toBeInTheDocument();
            });
        });

        it('shows amount error for missing amount', async () => {
            render(<FinancePage currentUser={mockUser} />);
            await waitFor(() => screen.getByText(/רשומה חדשה/));
            fireEvent.click(screen.getByText(/רשומה חדשה/));
            fireEvent.click(screen.getByText('+ אילן'));
            await waitFor(() => {
                expect(screen.getByText(/חובה להזין סכום חיובי/)).toBeInTheDocument();
            });
        });
    });

    describe('Dynamic Fields', () => {
        it('shows musician field for income type', async () => {
            render(<FinancePage currentUser={mockUser} />);
            await waitFor(() => screen.getByText(/רשומה חדשה/));
            fireEvent.click(screen.getByText(/רשומה חדשה/));
            // Musician input with placeholder should exist in form
            expect(screen.getByPlaceholderText('אופציונלי')).toBeInTheDocument();
        });

        it('hides musician form field for expense type', async () => {
            render(<FinancePage currentUser={mockUser} />);
            await waitFor(() => screen.getByText(/רשומה חדשה/));
            fireEvent.click(screen.getByText(/רשומה חדשה/));

            // Switch to expense
            fireEvent.change(screen.getByDisplayValue('💰 הכנסה'), { target: { value: 'expense' } });
            // Musician input should not exist in form
            expect(screen.queryByPlaceholderText('אופציונלי')).not.toBeInTheDocument();
        });
    });

    describe('Lead Dropdown', () => {
        it('excludes lost leads from the dropdown', async () => {
            render(<FinancePage currentUser={mockUser} />);
            await waitFor(() => screen.getByText(/רשומה חדשה/));
            fireEvent.click(screen.getByText(/רשומה חדשה/));

            // Open lead dropdown
            fireEvent.click(screen.getByText('— ללא קישור —'));

            await waitFor(() => {
                expect(screen.getByText('David Cohen')).toBeInTheDocument();
                expect(screen.getByText('Sarah Levi')).toBeInTheDocument();
                expect(screen.queryByText('Lost Lead')).not.toBeInTheDocument();
            });
        });

        it('filters leads by search', async () => {
            render(<FinancePage currentUser={mockUser} />);
            await waitFor(() => screen.getByText(/רשומה חדשה/));
            fireEvent.click(screen.getByText(/רשומה חדשה/));

            // Open dropdown
            fireEvent.click(screen.getByText('— ללא קישור —'));

            // Type in search
            const searchInput = screen.getByPlaceholderText(/חפש לפי שם/);
            await userEvent.type(searchInput, 'David');

            expect(screen.getByText('David Cohen')).toBeInTheDocument();
            expect(screen.queryByText('Sarah Levi')).not.toBeInTheDocument();
        });
    });

    describe('Admin vs Partner', () => {
        it('shows both owner buttons for admin', async () => {
            render(<FinancePage currentUser={mockUser} />);
            await waitFor(() => screen.getByText(/רשומה חדשה/));
            fireEvent.click(screen.getByText(/רשומה חדשה/));
            expect(screen.getByText('+ אילן')).toBeInTheDocument();
            expect(screen.getByText('+ קובי')).toBeInTheDocument();
        });

        it('shows single owner button for partner', async () => {
            const partnerUser = { ...mockUser, role: 'partner' as const };
            render(<FinancePage currentUser={partnerUser} />);
            await waitFor(() => screen.getByText(/רשומה חדשה/));
            fireEvent.click(screen.getByText(/רשומה חדשה/));
            expect(screen.getByText('הוסף ל-אילן')).toBeInTheDocument();
            expect(screen.queryByText('+ קובי')).not.toBeInTheDocument();
        });
    });
});
