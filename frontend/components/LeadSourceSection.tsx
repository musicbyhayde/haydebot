'use client';

import { useState } from 'react';
import { Lead } from '@/types';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui';
import { LEAD_SOURCE_OPTIONS } from '@/lib/constants';
import { toDisplayPhone } from '@/lib/formatters';
import LeadSourceBadge from './LeadSourceBadge';
import { useReadOnly } from '@/lib/readOnly';

interface LeadSourceSectionProps {
    lead: Lead;
}

const AUTO_DETAILS = ['זוהה אוטומטית'];

/** "Where did this lead come from" block of the lead card (improvement #2). */
export default function LeadSourceSection({ lead }: LeadSourceSectionProps) {
    const { success, error } = useToast();
    const readOnly = useReadOnly();
    const [saving, setSaving] = useState(false);
    const [value, setValue] = useState<string>(lead.fields.Lead_Source || '');
    const f = lead.fields;
    const form = f.Form_Answers || null;
    const ref = f.Source_Referral || null;

    const rows: Array<[string, string]> = [];
    if (f.Source_Detail && !AUTO_DETAILS.includes(f.Source_Detail)) rows.push(['פירוט', f.Source_Detail]);
    if (f.Campaign_Name || f.Campaign_ID) rows.push(['קמפיין', [f.Campaign_Name, f.Campaign_ID].filter(Boolean).join(' · ')]);
    if (f.Adset_Name || f.Adset_ID) rows.push(['קבוצת מודעות', [f.Adset_Name, f.Adset_ID].filter(Boolean).join(' · ')]);
    if (f.Ad_Name || f.Ad_ID) rows.push(['מודעה', [f.Ad_Name, f.Ad_ID].filter(Boolean).join(' · ')]);
    if (f.Form_Name || f.Form_ID) rows.push(['טופס', [f.Form_Name, f.Form_ID].filter(Boolean).join(' · ')]);
    const utm = [f.UTM_Source, f.UTM_Medium, f.UTM_Campaign, f.UTM_Content].filter(Boolean).join(' / ');
    if (utm) rows.push(['UTM', utm]);
    if (ref?.headline && ref.headline !== f.Source_Detail) rows.push(['כותרת המודעה', String(ref.headline)]);
    if (form?.event_type && form.event_type !== f.Source_Detail) rows.push(['סוג אירוע (טופס)', form.event_type]);
    if (form?.full_name && form.full_name !== f.Name) rows.push(['שם בטופס', form.full_name]);
    if (form?.phone && form.phone_matches_whatsapp === false) rows.push(['טלפון בטופס (שונה מהוואטסאפ)', toDisplayPhone(form.phone)]);
    if (form?.answers) {
        Object.entries(form.answers).forEach(([q, a]) => rows.push([q, a]));
    }
    if (form?.note) rows.push(['הקליד/ה בטופס', form.note]);

    const handleChange = async (next: string) => {
        if (!next || next === (lead.fields.Lead_Source || '')) {
            setValue(next);
            return;
        }
        setValue(next);
        setSaving(true);
        try {
            await api.updateLead(lead.id, { Lead_Source: next as Lead['fields']['Lead_Source'] });
            Object.assign(lead.fields, { Lead_Source: next, Source_Detail: 'עודכן ידנית' });
            success('מקור הליד עודכן');
        } catch (e) {
            console.error(e);
            setValue(lead.fields.Lead_Source || '');
            error('עדכון המקור נכשל');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2" data-testid="lead-source-section">
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-500">מקור הליד</span>
                    <LeadSourceBadge fields={f} size="sm" />
                </div>
                {!readOnly && (
                <select
                    aria-label="שינוי מקור הליד"
                    value={value}
                    disabled={saving}
                    onChange={(e) => handleChange(e.target.value)}
                    className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-[11px] font-bold text-slate-700 disabled:opacity-50"
                >
                    <option value="">{f.Lead_Source ? 'בחר מקור...' : 'לא ידוע - בחר מקור...'}</option>
                    {LEAD_SOURCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                )}
            </div>
            {rows.length > 0 && (
                <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-[11px]">
                    {rows.map(([k, v], i) => (
                        <div key={`${k}-${i}`} className="contents">
                            <dt className="text-slate-400 font-bold whitespace-nowrap">{k}</dt>
                            <dd className="text-slate-700 break-words">{v}</dd>
                        </div>
                    ))}
                </dl>
            )}
            {ref?.source_url && (
                <a href={String(ref.source_url)} target="_blank" rel="noopener noreferrer" className="text-[11px] text-blue-600 hover:underline break-all" dir="ltr">
                    {String(ref.source_url)}
                </a>
            )}
        </div>
    );
}
