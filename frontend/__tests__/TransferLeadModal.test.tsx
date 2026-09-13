import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TransferLeadModal from '@/components/TransferLeadModal';
import { api } from '@/lib/api';

jest.mock('@/lib/api', () => ({
    api: {
        transferLead: jest.fn().mockResolvedValue({
            status: 'success',
            lead: { id: 'lead1', fields: { Owner: 'אילן' } },
            note: { id: 'n_transfer', fields: { Content: '🔄 העברת מוביל: הטיפול בליד הועבר מ-קובי ל-אילן' } },
        }),
    },
}));

jest.mock('@/components/ui', () => ({
    useToast: () => ({
        success: jest.fn(),
        error: jest.fn(),
    }),
}));

describe('TransferLeadModal', () => {
    const mockLead = {
        id: 'lead1',
        createdTime: '2026-01-01',
        fields: {
            Phone: '972501234567',
            Name: 'ישראל ישראלי',
            Status: 'New',
            Owner: 'קובי',
        },
    };

    it('renders current owner and target owner options when open', () => {
        render(
            <TransferLeadModal
                isOpen={true}
                lead={mockLead}
                currentUserName="קובי"
                onClose={jest.fn()}
                onTransferred={jest.fn()}
            />
        );

        expect(screen.getByText('העברת מוביל ליד')).toBeInTheDocument();
        expect(screen.getByText('ישראל ישראלי')).toBeInTheDocument();
        expect(screen.getByText('בחר למי להעביר את הטיפול בליד:')).toBeInTheDocument();
    });

    it('submits transfer when clicking "בצע העברה"', async () => {
        const handleTransferred = jest.fn();
        const handleClose = jest.fn();

        render(
            <TransferLeadModal
                isOpen={true}
                lead={mockLead}
                currentUserName="קובי"
                onClose={handleClose}
                onTransferred={handleTransferred}
            />
        );

        // Type handover note
        const noteInput = screen.getByPlaceholderText(/סוכם 5,000 ₪/);
        fireEvent.change(noteInput, { target: { value: 'דיברתי איתו, מעוניין בבוזוקי' } });

        // Click transfer button
        const submitBtn = screen.getByText('בצע העברה');
        fireEvent.click(submitBtn);

        await waitFor(() => {
            expect(api.transferLead).toHaveBeenCalledWith('lead1', {
                new_owner: 'אילן',
                previous_owner: 'קובי',
                handover_note: 'דיברתי איתו, מעוניין בבוזוקי',
                actor: 'קובי',
            });
            expect(handleTransferred).toHaveBeenCalled();
            expect(handleClose).toHaveBeenCalled();
        });
    });

    it('does not render when isOpen is false', () => {
        const { container } = render(
            <TransferLeadModal
                isOpen={false}
                lead={mockLead}
                currentUserName="קובי"
                onClose={jest.fn()}
                onTransferred={jest.fn()}
            />
        );

        expect(container.firstChild).toBeNull();
    });
});
