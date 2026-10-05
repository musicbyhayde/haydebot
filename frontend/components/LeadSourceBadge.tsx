'use client';

import clsx from 'clsx';
import { Lead } from '@/types';
import { LEAD_SOURCE_MAP, leadSourceLabel } from '@/lib/constants';

interface LeadSourceBadgeProps {
    fields: Lead['fields'];
    size?: 'xs' | 'sm';
    showDetail?: boolean;
}

/** Hover text: the short attribution story (detail, campaign / ad / form / UTM, ad headline). */
export function leadSourceTooltip(fields: Lead['fields']): string {
    const parts: string[] = [leadSourceLabel(fields.Lead_Source)];
    if (fields.Source_Detail) parts.push(fields.Source_Detail);
    const campaign = fields.Campaign_Name || fields.Campaign_ID;
    if (campaign) parts.push(`קמפיין: ${campaign}`);
    const ad = fields.Ad_Name || fields.Ad_ID;
    if (ad) parts.push(`מודעה: ${ad}`);
    const form = fields.Form_Name || fields.Form_ID;
    if (form) parts.push(`טופס: ${form}`);
    const utm = [fields.UTM_Source, fields.UTM_Medium, fields.UTM_Campaign].filter(Boolean).join(' / ');
    if (utm) parts.push(`UTM: ${utm}`);
    const headline = fields.Source_Referral?.headline;
    if (headline && headline !== fields.Source_Detail) parts.push(`כותרת: ${headline}`);
    return parts.join(' · ');
}

export default function LeadSourceBadge({ fields, size = 'xs', showDetail = false }: LeadSourceBadgeProps) {
    const src = fields.Lead_Source;
    if (!src) {
        return (
            <span className="text-[10px] text-slate-300" data-testid="lead-source-badge" title="מקור לא ידוע">—</span>
        );
    }
    const info = LEAD_SOURCE_MAP[src] || { label: src, icon: '•', class: 'bg-gray-50 text-gray-700 border-gray-200' };
    return (
        <span
            data-testid="lead-source-badge"
            title={leadSourceTooltip(fields)}
            className={clsx(
                'inline-flex items-center gap-1 rounded-full border font-bold whitespace-nowrap max-w-full overflow-hidden',
                size === 'xs' ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[11px]',
                info.class,
            )}
        >
            <span aria-hidden>{info.icon}</span>
            <span className="truncate">{info.label}</span>
            {showDetail && fields.Source_Detail && (
                <span className="font-normal opacity-75 truncate">· {fields.Source_Detail}</span>
            )}
        </span>
    );
}
