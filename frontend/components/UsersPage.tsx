'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyRound, Trash2, UserPlus, Power } from 'lucide-react';
import clsx from 'clsx';
import { api, ApiError, DashboardUserRow } from '@/lib/api';
import { PageHeader, useToast } from '@/components/ui';

const ROLE_LABEL: Record<string, string> = { admin: 'מנהל', partner: 'שותף', viewer: 'צפייה בלבד' };
const MIN_PASSWORD = 10;

function errText(e: unknown, fallback: string): string {
    if (e instanceof ApiError && e.detail) return e.detail;
    return fallback;
}

function formatWhen(iso?: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });
}

interface UsersPageProps {
    onMenuClick?: () => void;
}

/**
 * Admin screen "משתמשים": create and manage read-only (viewer) accounts.
 * All rules live in the backend (/api/v1/admin/users, admin only); this is just the UI.
 */
export default function UsersPage({ onMenuClick }: UsersPageProps) {
    const { success, error, confirm } = useToast();
    const [users, setUsers] = useState<DashboardUserRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState<string | null>(null);
    const [form, setForm] = useState({ email: '', display_name: '', password: '' });
    const [resetFor, setResetFor] = useState<string | null>(null);
    const [resetPassword, setResetPassword] = useState('');

    // useToast() returns new functions on every render; keep `load` stable so the effect runs once.
    const errorRef = useRef(error);
    useEffect(() => { errorRef.current = error; });

    const load = useCallback(async () => {
        try {
            setUsers(await api.listUsers());
        } catch (e) {
            errorRef.current(errText(e, 'שגיאה בטעינת המשתמשים'));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (form.password.length < MIN_PASSWORD) {
            error(`סיסמה חייבת להכיל לפחות ${MIN_PASSWORD} תווים`);
            return;
        }
        setBusy('create');
        try {
            await api.createUser({ email: form.email.trim(), display_name: form.display_name.trim(), password: form.password });
            success('משתמש הצפייה נוצר');
            setForm({ email: '', display_name: '', password: '' });
            await load();
        } catch (err) {
            error(errText(err, 'שגיאה ביצירת המשתמש'));
        } finally {
            setBusy(null);
        }
    };

    const toggleActive = async (u: DashboardUserRow) => {
        setBusy(u.email);
        try {
            const res = u.active ? await api.disableUser(u.email) : await api.enableUser(u.email);
            if (res.warning) error(res.warning);
            else success(u.active ? 'המשתמש הושבת' : 'המשתמש הופעל');
            await load();
        } catch (err) {
            error(errText(err, 'הפעולה נכשלה'));
        } finally {
            setBusy(null);
        }
    };

    const handleReset = async (email: string) => {
        if (resetPassword.length < MIN_PASSWORD) {
            error(`סיסמה חייבת להכיל לפחות ${MIN_PASSWORD} תווים`);
            return;
        }
        setBusy(email);
        try {
            await api.resetUserPassword(email, resetPassword);
            success('הסיסמה עודכנה');
            setResetFor(null);
            setResetPassword('');
        } catch (err) {
            error(errText(err, 'איפוס הסיסמה נכשל'));
        } finally {
            setBusy(null);
        }
    };

    const handleDelete = async (u: DashboardUserRow) => {
        const ok = await confirm({
            title: 'מחיקת משתמש',
            message: `למחוק לצמיתות את ${u.display_name || u.email}? הגישה תיחסם מיד.`,
            variant: 'danger',
            confirmLabel: 'מחק',
        });
        if (!ok) return;
        setBusy(u.email);
        try {
            await api.deleteUser(u.email);
            success('המשתמש נמחק');
            await load();
        } catch (err) {
            error(errText(err, 'המחיקה נכשלה'));
        } finally {
            setBusy(null);
        }
    };

    const input = 'w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-100';

    return (
        <div className="flex-1 overflow-y-auto bg-slate-50 p-4 md:p-8 pb-20 md:pb-8" dir="rtl">
            <div className="max-w-5xl mx-auto">
                <PageHeader title="👥 משתמשים" subtitle="ניהול משתמשי צפייה בלבד" onMenuClick={onMenuClick} />

                <form onSubmit={handleCreate} className="bg-white rounded-2xl border border-slate-200 p-5 mb-6" aria-label="יצירת משתמש צפייה">
                    <h2 className="font-bold text-sm text-slate-800 mb-3 flex items-center gap-2"><UserPlus size={16} /> משתמש צפייה חדש</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <input className={input} type="email" required placeholder="אימייל" aria-label="אימייל" dir="ltr"
                            value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                        <input className={input} type="text" required placeholder="שם תצוגה" aria-label="שם תצוגה"
                            value={form.display_name} onChange={e => setForm({ ...form, display_name: e.target.value })} />
                        <input className={input} type="password" required minLength={MIN_PASSWORD} placeholder={`סיסמה (לפחות ${MIN_PASSWORD} תווים)`} aria-label="סיסמה" dir="ltr" autoComplete="new-password"
                            value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3">
                        <p className="text-[11px] text-slate-400">המשתמש יוכל לצפות בלידים, בהודעות ובמשימות — בלי לשנות דבר. מסור לו את הסיסמה בערוץ מאובטח.</p>
                        <button type="submit" disabled={busy === 'create'} className="px-5 py-2 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 shrink-0">
                            {busy === 'create' ? 'יוצר...' : 'צור משתמש'}
                        </button>
                    </div>
                </form>

                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                    {loading ? (
                        <p className="p-6 text-center text-sm text-slate-400">טוען...</p>
                    ) : users.length === 0 ? (
                        <p className="p-6 text-center text-sm text-slate-400">אין משתמשים</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="text-slate-400 text-xs border-b border-slate-100">
                                    <tr>
                                        <th className="px-4 py-3 text-right font-medium">שם</th>
                                        <th className="px-4 py-3 text-right font-medium">אימייל</th>
                                        <th className="px-4 py-3 text-right font-medium">תפקיד</th>
                                        <th className="px-4 py-3 text-right font-medium">סטטוס</th>
                                        <th className="px-4 py-3 text-right font-medium">כניסה אחרונה</th>
                                        <th className="px-4 py-3" />
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {users.map(u => (
                                        <tr key={u.email} data-testid={`user-row-${u.email}`}>
                                            <td className="px-4 py-3 font-bold text-slate-700">{u.display_name || '—'}</td>
                                            <td className="px-4 py-3 text-slate-500 font-mono text-xs" dir="ltr">{u.email}</td>
                                            <td className="px-4 py-3 text-slate-600">{ROLE_LABEL[u.role] || u.role}</td>
                                            <td className="px-4 py-3">
                                                <span className={clsx('px-2 py-0.5 rounded-full text-[10px] font-bold border',
                                                    u.active ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-100 text-slate-500 border-slate-200')}>
                                                    {u.active ? 'פעיל' : 'מושבת'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-slate-500 text-xs">{formatWhen(u.last_sign_in_at)}</td>
                                            <td className="px-4 py-3">
                                                {u.manageable && (
                                                    <div className="flex items-center justify-end gap-2">
                                                        {resetFor === u.email ? (
                                                            <>
                                                                <input className="px-2 py-1 border border-slate-200 rounded text-xs w-36" type="password" dir="ltr" autoComplete="new-password"
                                                                    aria-label="סיסמה חדשה" placeholder="סיסמה חדשה" value={resetPassword} onChange={e => setResetPassword(e.target.value)} />
                                                                <button onClick={() => handleReset(u.email)} disabled={busy === u.email} className="text-xs font-bold text-blue-600 hover:text-blue-800">שמור</button>
                                                                <button onClick={() => { setResetFor(null); setResetPassword(''); }} className="text-xs text-slate-400 hover:text-slate-600">ביטול</button>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <button onClick={() => toggleActive(u)} disabled={busy === u.email}
                                                                    className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100" title={u.active ? 'השבת' : 'הפעל'} aria-label={u.active ? 'השבת' : 'הפעל'}>
                                                                    <Power size={15} />
                                                                </button>
                                                                <button onClick={() => { setResetFor(u.email); setResetPassword(''); }} disabled={busy === u.email}
                                                                    className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100" title="איפוס סיסמה" aria-label="איפוס סיסמה">
                                                                    <KeyRound size={15} />
                                                                </button>
                                                                <button onClick={() => handleDelete(u)} disabled={busy === u.email}
                                                                    className="p-1.5 rounded-lg text-red-500 hover:bg-red-50" title="מחק" aria-label="מחק">
                                                                    <Trash2 size={15} />
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
