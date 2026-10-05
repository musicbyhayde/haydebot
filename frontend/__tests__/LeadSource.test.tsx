/**
 * Improvement #2: lead source in the dashboard (list column + filter, lead card, manual lead).
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import LeadsDashboard from '@/components/LeadsDashboard';
import LeadDetailPanel from '@/components/LeadDetailPanel';
import AddLeadModal from '@/components/AddLeadModal';
import LeadSourceBadge, { leadSourceTooltip } from '@/components/LeadSourceBadge';
import { api } from '@/lib/api';
import { LEAD_SOURCE_MAP, leadSourceLabel } from '@/lib/constants';

jest.mock('@/lib/api', () => ({
    api: {
        getLeads: jest.fn().mockResolvedValue([]),
        getMusicians: jest.fn().mockResolvedValue([]),
        getNotes: jest.fn().mockResolvedValue([]),
        getMessages: jest.fn().mockResolvedValue([]),
        getTasks: jest.fn().mockResolvedValue([]),
        getFinanceEntries: jest.fn().mockResolvedValue([]),
        createLead: jest.fn().mockResolvedValue({ id: 'new', fields: {} }),
        updateLead: jest.fn().mockResolvedValue({ id: 'l1', fields: {} }),
    },
}));

const leads = [
    { id: 'l1', createdTime: '2026-01-01', fields: { Phone: '111', Name: 'Meta Lead', Status: 'New', Service: 'DJ',
        Lead_Source: 'meta_form' as const, Source_Detail: 'חתונה' } },
    { id: 'l2', createdTime: '2026-01-02', fields: { Phone: '222', Name: 'Site Lead', Status: 'Talking', Service: 'Band',
        Lead_Source: 'website' as const, Source_Detail: 'נגן בוזוקי' } },
    { id: 'l3', createdTime: '2026-01-03', fields: { Phone: '333', Name: 'Unknown Source', Status: 'New' } },
    { id: 'l4', createdTime: '2026-01-04', fields: { Phone: '444', Name: 'Lost Ad', Status: 'Lost', Lead_Source: 'ctwa' as const } },
];

const user = { id: '1', uid: '1', email: 't@t.com', displayName: 'אילן', role: 'admin' as const };

describe('LeadSourceBadge', () => {
    it('shows the Hebrew label and a tooltip with the attribution', () => {
        render(<LeadSourceBadge fields={{ Phone: '1', Status: 'New', Lead_Source: 'ctwa', Source_Detail: 'להקה לחתונה',
            Campaign_Name: 'Wedding', UTM_Source: 'facebook', Source_Referral: { headline: 'כותרת אחרת' } }} />);
        const badge = screen.getByTestId('lead-source-badge');
        expect(badge).toHaveTextContent('מודעת וואטסאפ');
        expect(badge.getAttribute('title')).toBe('מודעת וואטסאפ · להקה לחתונה · קמפיין: Wedding · UTM: facebook · כותרת: כותרת אחרת');
    });

    it('shows a dash when the source is unknown', () => {
        render(<LeadSourceBadge fields={{ Phone: '1', Status: 'New' }} />);
        expect(screen.getByTestId('lead-source-badge')).toHaveTextContent('—');
        expect(leadSourceTooltip({ Phone: '1', Status: 'New' })).toBe('לא ידוע');
    });

    it('has a label for every backend value', () => {
        ['meta_form', 'ctwa', 'whatsapp_direct', 'website', 'referral', 'repeat', 'phone', 'other'].forEach((v) => {
            expect(LEAD_SOURCE_MAP[v]).toBeDefined();
        });
        expect(leadSourceLabel('meta_form')).toBe('טופס מטא');
        expect(leadSourceLabel(null)).toBe('לא ידוע');
    });
});

describe('LeadsDashboard: no source column, filter kept in the filter panel', () => {
    const props = { leads, onSelectLead: jest.fn(), onMenuClick: jest.fn(), currentUser: user, onRefresh: jest.fn() };

    it('has no source column in the active table or the archive tables (source lives in the lead panel)', () => {
        render(<LeadsDashboard {...props} />);
        expect(screen.getByText('Meta Lead')).toBeInTheDocument();
        // open every archive table (closed / lost / completed) that has rows
        ['לידים אבודים', 'לידים סגורים', 'הושלמו (ארכיון)'].forEach((t) => {
            const btn = screen.queryByText(t, { exact: false });
            if (btn) fireEvent.click(btn);
        });
        expect(screen.getByText('Lost Ad')).toBeInTheDocument();
        expect(screen.queryByText('מקור')).not.toBeInTheDocument();
        ['טופס מטא', 'אתר', 'מודעת וואטסאפ'].forEach((label) => {
            expect(screen.queryByText(label)).not.toBeInTheDocument();
        });
    });

    it('the source filter is not shown until the filter panel is opened, and no chip by default', () => {
        render(<LeadsDashboard {...props} />);
        expect(screen.queryByLabelText('סינון לפי מקור')).not.toBeInTheDocument();
        expect(screen.queryByText(/מקור:/)).not.toBeInTheDocument();
    });

    it('filters by source, including "unknown", and shows a removable chip', () => {
        render(<LeadsDashboard {...props} />);
        fireEvent.click(screen.getByText('סינון'));
        fireEvent.change(screen.getByLabelText('סינון לפי מקור'), { target: { value: 'meta_form' } });
        expect(screen.getByText('Meta Lead')).toBeInTheDocument();
        expect(screen.queryByText('Site Lead')).not.toBeInTheDocument();
        expect(screen.queryByText('Unknown Source')).not.toBeInTheDocument();

        fireEvent.change(screen.getByLabelText('סינון לפי מקור'), { target: { value: '__none__' } });
        expect(screen.getByText('Unknown Source')).toBeInTheDocument();
        expect(screen.queryByText('Meta Lead')).not.toBeInTheDocument();

        fireEvent.click(screen.getByText('סינון'));   // close panel -> chips visible
        const chip = screen.getByText(/מקור: לא ידוע/);
        fireEvent.click(within(chip).getByRole('button'));
        expect(screen.getByText('Meta Lead')).toBeInTheDocument();
        expect(screen.getByText('Site Lead')).toBeInTheDocument();
    });
});

describe('LeadDetailPanel source section', () => {
    const lead = {
        id: 'l1', createdTime: '2026-01-01',
        fields: { Phone: '972501234567', Name: 'Meta Lead', Status: 'New', Service: 'DJ',
            Lead_Source: 'meta_form' as const, Source_Detail: 'חתונה',
            Form_Answers: { language: 'he', full_name: 'שם אחר בטופס', phone: '+972529998877',
                event_type: 'חתונה', phone_matches_whatsapp: false } },
    };
    const props = { lead, onClose: jest.fn(), currentUser: user, currentUserName: 'אילן', onLeadUpdate: jest.fn(), onStatusChange: jest.fn() };

    it('shows the source badge with detail in the card header', () => {
        render(<LeadDetailPanel {...props} />);
        expect(screen.getAllByTestId('lead-source-badge')[0]).toHaveTextContent('טופס מטא');
        expect(screen.getAllByTestId('lead-source-badge')[0]).toHaveTextContent('חתונה');
    });

    it('shows form details in the info tab and lets the user correct the source', async () => {
        render(<LeadDetailPanel {...props} lead={{ ...lead, fields: { ...lead.fields } }} />);
        fireEvent.click(screen.getByText('פרטים'));
        const section = await screen.findByTestId('lead-source-section');
        expect(within(section).getByText('שם בטופס')).toBeInTheDocument();
        expect(within(section).getByText('שם אחר בטופס')).toBeInTheDocument();
        expect(within(section).getByText('טלפון בטופס (שונה מהוואטסאפ)')).toBeInTheDocument();
        fireEvent.change(within(section).getByLabelText('שינוי מקור הליד'), { target: { value: 'referral' } });
        await waitFor(() => expect(api.updateLead).toHaveBeenCalledWith('l1', { Lead_Source: 'referral' }));
    });
});

describe('AddLeadModal source', () => {
    beforeEach(() => (api.createLead as jest.Mock).mockClear());

    it('requires a source before creating', async () => {
        const { container } = render(<AddLeadModal isOpen onClose={jest.fn()} onCreated={jest.fn()} currentUserName="אילן" />);
        fireEvent.change(container.querySelector('input[type="tel"]')!, { target: { value: '0501234567' } });
        fireEvent.submit(container.querySelector('form')!);
        expect(await screen.findByText('חובה לבחור מקור ליד')).toBeInTheDocument();
        expect(api.createLead).not.toHaveBeenCalled();
    });

    it('sends the chosen source', async () => {
        const onCreated = jest.fn();
        const { container } = render(<AddLeadModal isOpen onClose={jest.fn()} onCreated={onCreated} currentUserName="אילן" />);
        fireEvent.change(container.querySelector('input[type="tel"]')!, { target: { value: '0501234567' } });
        fireEvent.change(screen.getByLabelText('מקור הליד *'), { target: { value: 'phone' } });
        fireEvent.submit(container.querySelector('form')!);
        await waitFor(() => expect(api.createLead).toHaveBeenCalled());
        expect((api.createLead as jest.Mock).mock.calls[0][0].Lead_Source).toBe('phone');
        await waitFor(() => expect(onCreated).toHaveBeenCalled());
    });
});
