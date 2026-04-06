'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { api } from '@/lib/api';
import clsx from 'clsx';

interface AddLeadModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCreated: () => void;
    currentUserName?: string;
}

const STATUS_OPTIONS = [
    { value: 'New', label: 'חדש' },
    { value: 'Manual', label: 'בטיפול ידני' },
    { value: 'Processing', label: 'בטיפול בוט' },
    { value: 'Talking', label: 'בשיחה' },
    { value: 'Quote_Sent', label: 'נשלחה הצ"מ' },
    { value: 'Waiting_Payment', label: 'מחכה לתשלום' },
];

const SERVICE_OPTIONS = [
    { value: 'Bouzouki', label: 'בוזוקי' },
    { value: 'Band', label: 'הרכב' },
    { value: 'DJ', label: 'DJ' },
    { value: 'Reception', label: 'קבלת פנים' },
    { value: 'Talk', label: 'הרצאה' },
    { value: 'Other', label: 'אחר' },
];

export default function AddLeadModal({ isOpen, onClose, onCreated, currentUserName }: AddLeadModalProps) {
    const [form, setForm] = useState({
        Name: '',
        Phone: '',
        Service: '',
        Event_Date: '',
        Location: '',
        Guests: '',
        Owner: currentUserName || 'אילן',
        Status: 'New',
    });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.Phone.trim()) {
            setError('חובה להזין מספר טלפון');
            return;
        }
        setSubmitting(true);
        setError('');
        try {
            await api.createLead(form);
            onCreated();
            onClose();
            setForm({ Name: '', Phone: '', Service: '', Event_Date: '', Location: '', Guests: '', Owner: currentUserName || 'אילן', Status: 'New' });
        } catch (err: any) {
            setError(err.message || 'שגיאה ביצירת ליד');
        } finally {
            setSubmitting(false);
        }
    };

    const inputClass = "w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all";

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" dir="rtl">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90dvh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                    <h2 className="text-lg font-bold text-slate-800">➕ ליד חדש</h2>
                    <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
                        <X size={20} className="text-slate-500" />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-2.5">{error}</div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1">שם הלקוח</label>
                            <input type="text" className={inputClass} value={form.Name} onChange={(e) => setForm({ ...form, Name: e.target.value })} placeholder="שם מלא" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1">טלפון *</label>
                            <input type="tel" className={inputClass} value={form.Phone} onChange={(e) => setForm({ ...form, Phone: e.target.value })} placeholder="05X-XXXXXXX" dir="ltr" required />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1">שירות</label>
                            <select 
                                className={inputClass} 
                                value={form.Service} 
                                onChange={(e) => {
                                    const nextService = e.target.value;
                                    const nextStatus = (nextService !== 'Bouzouki' && form.Status === 'New') ? 'Manual' : form.Status;
                                    setForm({ ...form, Service: nextService, Status: nextStatus });
                                }}
                            >
                                <option value="">בחר שירות...</option>
                                {SERVICE_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1">תאריך אירוע</label>
                            <input type="date" className={inputClass} value={form.Event_Date} onChange={(e) => setForm({ ...form, Event_Date: e.target.value })} dir="ltr" />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1">מיקום</label>
                            <input type="text" className={inputClass} value={form.Location} onChange={(e) => setForm({ ...form, Location: e.target.value })} placeholder="עיר / אולם" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1">מספר אורחים</label>
                            <input type="text" className={inputClass} value={form.Guests} onChange={(e) => setForm({ ...form, Guests: e.target.value })} placeholder="לדוגמה: 200" />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1">מוביל</label>
                            <select className={inputClass} value={form.Owner} onChange={(e) => setForm({ ...form, Owner: e.target.value })}>
                                <option value="אילן">אילן</option>
                                <option value="קובי">קובי</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1">סטטוס</label>
                            <select className={inputClass} value={form.Status} onChange={(e) => setForm({ ...form, Status: e.target.value })}>
                                {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                            </select>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={submitting}
                        className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-all shadow-md text-sm"
                    >
                        {submitting ? '...שומר' : 'צור ליד'}
                    </button>
                </form>
            </div>
        </div>
    );
}
