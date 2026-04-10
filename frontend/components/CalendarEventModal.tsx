'use client';

import { useState, useEffect } from 'react';
import { X, Calendar, MapPin, AlignLeft, Users, RefreshCw, Check } from 'lucide-react';
import clsx from 'clsx';
import { Musician } from '@/types';

interface CalendarEventModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (data: {
        summary: string;
        location: string;
        event_date: string;
        description: string;
        team_emails: string[];
    }) => void;
    leadName: string;
    initialLocation: string;
    initialDate: string;
    teamEmails: string[];
    isUpdate?: boolean;
}

export default function CalendarEventModal({
    isOpen,
    onClose,
    onConfirm,
    leadName,
    initialLocation,
    initialDate,
    teamEmails,
    isUpdate = false
}: CalendarEventModalProps) {
    const [summary, setSummary] = useState('');
    const [location, setLocation] = useState(initialLocation);
    const [date, setDate] = useState(initialDate);
    const [description, setDescription] = useState('');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setSummary(isUpdate ? leadName : `(אופציה) - ${leadName} + ${initialLocation}`);
            setLocation(initialLocation);
            setDate(initialDate);
            setDescription(`אירוע שנוצר מהיידהבוט עבור ${leadName}.`);
        }
    }, [isOpen, leadName, initialLocation, initialDate, isUpdate]);

    const handleConfirm = async () => {
        if (!summary.trim() || !date.trim()) {
            alert('חובה למלא כותרת ותאריך');
            return;
        }
        setSubmitting(true);
        try {
            await onConfirm({
                summary,
                location,
                event_date: date,
                description,
                team_emails: teamEmails
            });
            onClose();
        } catch (e) {
            console.error(e);
        } finally {
            setSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in duration-200" dir="rtl" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className={clsx(
                    "p-5 border-b border-slate-100 flex justify-between items-center",
                    isUpdate ? "bg-amber-50" : "bg-purple-50"
                )}>
                    <div>
                        <h3 className={clsx("text-lg font-bold", isUpdate ? "text-amber-800" : "text-purple-800")}>
                            {isUpdate ? 'עדכון אירוע ביומן 📅' : 'יצירת אירוע ביומן 📅'}
                        </h3>
                        <p className={clsx("text-[10px] mt-0.5", isUpdate ? "text-amber-600" : "text-purple-600")}>
                            {isUpdate ? 'ערוך את פרטי האירוע הקיים' : 'וודא את הפרטים לפני שליחת הזמנות לצוות'}
                        </p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="p-6 space-y-4">
                    {/* Summary */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                            <Calendar size={14} className="text-slate-400" /> כותרת האירוע
                        </label>
                        <input
                            type="text"
                            value={summary}
                            onChange={(e) => setSummary(e.target.value)}
                            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-purple-500 outline-none"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        {/* Location */}
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                                <MapPin size={14} className="text-slate-400" /> מיקום
                            </label>
                            <input
                                type="text"
                                value={location}
                                onChange={(e) => setLocation(e.target.value)}
                                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                            />
                        </div>

                        {/* Date */}
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                                <Calendar size={14} className="text-slate-400" /> תאריך (DD.MM.YY)
                            </label>
                            <input
                                type="text"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                            />
                        </div>
                    </div>

                    {/* Description */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                            <AlignLeft size={14} className="text-slate-400" /> תיאור (אופציונלי)
                        </label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={2}
                            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 outline-none resize-none"
                        />
                        <p className="text-[9px] text-slate-400 font-medium italic">הנגנים יראו את התיאור הזה ביומן שלהם.</p>
                    </div>

                    {/* Audience/Team (Read-only for info) */}
                    <div className="pt-2">
                        <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mb-2">
                            <Users size={14} className="text-slate-400" /> מוזמנים ({teamEmails.length})
                        </label>
                        <div className="flex flex-wrap gap-1.5">
                            {teamEmails.length > 0 ? teamEmails.map(email => (
                                <span key={email} className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-medium rounded-full border border-slate-200">
                                    {email}
                                </span>
                            )) : (
                                <span className="text-[10px] text-slate-400 italic">לא נבחרו מוזמנים עם אימייל...</span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-5 py-2.5 text-slate-500 text-sm font-bold hover:text-slate-700 transition-colors"
                    >
                        ביטול
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={submitting}
                        className={clsx(
                            "px-8 py-2.5 text-white font-bold rounded-xl shadow-lg transition-all flex items-center gap-2 text-sm",
                            isUpdate 
                                ? "bg-amber-600 hover:bg-amber-700 shadow-amber-200" 
                                : "bg-purple-600 hover:bg-purple-700 shadow-purple-200"
                        )}
                    >
                        {submitting ? (
                            <RefreshCw className="w-5 h-5 animate-spin" />
                        ) : (
                            <>
                                <Check className="w-4 h-4" />
                                <span>{isUpdate ? 'עדכן אירוע' : 'צור אירוע ושלח הזמנות'}</span>
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
