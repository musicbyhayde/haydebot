'use client';

/**
 * Create / edit a partner transfer ("העברה בין שותפים"). Admin only (the backend enforces it).
 * One source pool -> one destination pool. Same partner on both sides = a rebalance between
 * that partner's pools ("העברה בין מצבורים", any partner); identical partner+pool is rejected.
 * A negative source pool is allowed but warned about.
 */
import { useMemo, useState } from 'react';
import { AlertCircle, ArrowLeftRight, X } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { OWNERS } from '@/lib/constants';
import { POOLS, POOL_LABEL, isRebalance, previewTransfer } from '@/lib/financeTransfers';
import { FinancePool, FinanceSummaryItem, FinanceTransfer, FinanceTransferInput } from '@/types';

interface Props {
    summary: Record<string, FinanceSummaryItem>;
    editing?: FinanceTransfer | null;
    defaultFrom?: string;
    onClose: () => void;
    onSaved: () => void;
}

const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const ils = (n: number) =>
    new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);

export default function PartnerTransferModal({ summary, editing, defaultFrom, onClose, onSaved }: Props) {
    const partners = OWNERS as readonly string[];
    const otherThan = (p: string) => partners.find(x => x !== p) || '';
    const initialFrom = editing?.from_partner || (defaultFrom && partners.includes(defaultFrom) ? defaultFrom : partners[0]);
    const [fromPartner, setFromPartner] = useState<string>(initialFrom);
    const [fromPool, setFromPool] = useState<FinancePool>(editing?.from_pool || 'חשבון');
    const [toPartner, setToPartner] = useState<string>(editing?.to_partner || otherThan(initialFrom));
    const [toPool, setToPool] = useState<FinancePool>(editing?.to_pool || 'חשבון');
    const [amount, setAmount] = useState<string>(editing ? String(editing.amount) : '');
    const [date, setDate] = useState<string>(editing?.transfer_date || today());
    const [note, setNote] = useState<string>(editing?.note || '');
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const amountNum = parseFloat(amount);
    const preview = useMemo(
        () => previewTransfer(summary, { from_partner: fromPartner, from_pool: fromPool, to_partner: toPartner, to_pool: toPool, amount: amountNum }, editing),
        [summary, fromPartner, fromPool, toPartner, toPool, amountNum, editing],
    );

    const otherPool = (p: FinancePool): FinancePool => (p === 'מזומן' ? 'חשבון' : 'מזומן');
    const rebalance = isRebalance({ from_partner: fromPartner, to_partner: toPartner });
    // Same partner on both sides is a rebalance: keep the two pools different.
    const changeFrom = (p: string) => {
        setFromPartner(p);
        if (p === toPartner && fromPool === toPool) setFromPool(otherPool(toPool));
    };
    const changeTo = (p: string) => {
        setToPartner(p);
        if (p === fromPartner && fromPool === toPool) setToPool(otherPool(fromPool));
    };

    const validate = (): string | null => {
        if (!fromPartner || !toPartner) return 'יש לבחור שותף בשני הצדדים';
        if (rebalance && fromPool === toPool) return 'המקור והיעד זהים — בחר מצבור אחר';
        if (!amount || !Number.isFinite(amountNum) || amountNum <= 0) return 'חובה להזין סכום חיובי';
        if (!date) return 'חובה לבחור תאריך';
        return null;
    };

    const save = async () => {
        const v = validate();
        setError(v);
        if (v) return;
        const payload: FinanceTransferInput = {
            transfer_date: date, amount: Math.round(amountNum * 100) / 100,
            from_partner: fromPartner, from_pool: fromPool, to_partner: toPartner, to_pool: toPool,
            note: note.trim() || null,
        };
        setSaving(true);
        try {
            if (editing) await api.updateFinanceTransfer(editing.id, payload);
            else await api.createFinanceTransfer(payload);
            onSaved();
        } catch (e) {
            setError((e instanceof ApiError && e.detail) || 'שגיאה בשמירת ההעברה');
        } finally {
            setSaving(false);
        }
    };

    const select = 'w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white';
    const side = (label: string, partner: string, setP: (p: string) => void, pool: FinancePool, setPool: (p: FinancePool) => void,
        before: number, after: number, testId: string) => (
        <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-3" data-testid={testId}>
            <div className="text-[10px] font-bold text-slate-500 mb-2">{label}</div>
            <select aria-label={`${label} שותף`} value={partner} onChange={e => setP(e.target.value)} className={`${select} mb-2`}>
                {partners.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <select aria-label={`${label} מצבור`} value={pool} onChange={e => setPool(e.target.value as FinancePool)} className={select}>
                {POOLS.map(p => <option key={p} value={p}>{POOL_LABEL[p]}</option>)}
            </select>
            <div className="mt-2 text-[11px] text-slate-600" dir="rtl">
                {ils(before)} ← <span className={after < 0 ? 'text-orange-700 font-bold' : 'font-bold'}>{ils(after)}</span>
            </div>
        </div>
    );

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" onClick={onClose}>
            <div role="dialog" aria-label={rebalance ? 'העברה בין מצבורים' : 'העברה בין שותפים'} className="w-full max-w-lg bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()} dir="rtl">
                <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center bg-indigo-50">
                    <h3 className="text-sm font-bold text-indigo-800 flex items-center gap-1.5">
                        <ArrowLeftRight size={16} /> {editing ? 'עריכת ' : ''}{rebalance ? `העברה בין מצבורים — ${fromPartner}` : 'העברה בין שותפים'}
                    </h3>
                    <button onClick={onClose} aria-label="סגור" className="text-slate-400 hover:text-red-500"><X size={18} /></button>
                </div>
                <div className="px-5 py-4 overflow-y-auto space-y-3">
                    <p className="text-[11px] text-slate-500">
                        {rebalance
                            ? 'העברה בין מצבורים של אותו שותף משנה רק את החלוקה בין 🏦 ל־💵 — היתרה, ההכנסות וההוצאות לא משתנות.'
                            : 'העברה משנה רק את היתרה והמצבורים של השותפים — לא הכנסות, הוצאות או רווח.'}
                    </p>
                    <div className="flex gap-3 items-stretch">
                        {side('מ־', fromPartner, changeFrom, fromPool, setFromPool, preview.fromBefore, preview.fromAfter, 'transfer-from')}
                        <div className="flex items-center text-indigo-400"><ArrowLeftRight size={18} /></div>
                        {side('ל־', toPartner, changeTo, toPool, setToPool, preview.toBefore, preview.toAfter, 'transfer-to')}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label htmlFor="transfer-amount" className="block text-[10px] font-bold text-slate-500 mb-1">סכום (₪) *</label>
                            <input id="transfer-amount" type="number" min="0" step="0.01" inputMode="decimal" value={amount}
                                onChange={e => setAmount(e.target.value)} className={select} />
                        </div>
                        <div>
                            <label htmlFor="transfer-date" className="block text-[10px] font-bold text-slate-500 mb-1">תאריך *</label>
                            <input id="transfer-date" type="date" value={date} onChange={e => setDate(e.target.value)} className={select} />
                        </div>
                    </div>
                    <div>
                        <label htmlFor="transfer-note" className="block text-[10px] font-bold text-slate-500 mb-1">הערה</label>
                        <input id="transfer-note" type="text" maxLength={500} value={note} onChange={e => setNote(e.target.value)}
                            placeholder="אופציונלי" className={select} />
                    </div>
                    {preview.fromNegative && amountNum > 0 && (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-800 flex items-center gap-2">
                            <AlertCircle size={14} className="shrink-0" />
                            המצבור של {fromPartner} ({fromPool}) יהיה שלילי אחרי ההעברה. אפשר לשמור בכל זאת.
                        </div>
                    )}
                    {error && (
                        <div role="alert" className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700 flex items-center gap-2">
                            <AlertCircle size={14} className="shrink-0" /> {error}
                        </div>
                    )}
                </div>
                <div className="px-5 py-4 border-t border-slate-100 bg-slate-50 flex gap-2 justify-end">
                    <button onClick={onClose} className="px-4 py-2 text-slate-500 text-xs font-bold hover:text-slate-700">ביטול</button>
                    <button onClick={save} disabled={saving}
                        className="px-6 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 shadow-md">
                        {saving ? 'שומר...' : 'שמור העברה'}
                    </button>
                </div>
            </div>
        </div>
    );
}
