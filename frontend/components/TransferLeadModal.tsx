'use client';

import React, { useState, useEffect } from 'react';
import { X, ArrowLeftRight, UserCheck, UserMinus, ShieldAlert } from 'lucide-react';
import { Lead, Note } from '@/types';
import { OWNERS, OWNER_COLORS } from '@/lib/constants';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui';

interface TransferLeadModalProps {
    isOpen: boolean;
    lead: Lead;
    currentUserName: string;
    onClose: () => void;
    onTransferred: (updatedLead: Lead, newNote?: Note) => void;
}

export default function TransferLeadModal({
    isOpen,
    lead,
    currentUserName,
    onClose,
    onTransferred,
}: TransferLeadModalProps) {
    const { success, error } = useToast();
    const currentOwner = lead.fields.Owner || '';
    const [selectedOwner, setSelectedOwner] = useState<string>('');
    const [handoverNote, setHandoverNote] = useState<string>('');
    const [submitting, setSubmitting] = useState<boolean>(false);

    // Default selection: the other owner if assigned, or current logged-in user if unassigned
    useEffect(() => {
        if (isOpen) {
            if (currentOwner === 'אילן') {
                setSelectedOwner('קובי');
            } else if (currentOwner === 'קובי') {
                setSelectedOwner('אילן');
            } else {
                setSelectedOwner(currentUserName || 'אילן');
            }
            setHandoverNote('');
        }
    }, [isOpen, currentOwner, currentUserName]);

    if (!isOpen) return null;

    const handleTransfer = async () => {
        if (selectedOwner === currentOwner) {
            error('המוביל שנבחר זהה למוביל הנוכחי');
            return;
        }

        if (!handoverNote.trim()) {
            error('חובה להזין הערת תיעוד / סיבת ההעברה');
            return;
        }

        setSubmitting(true);
        try {
            const result = await api.transferLead(lead.id, {
                new_owner: selectedOwner,
                previous_owner: currentOwner,
                handover_note: handoverNote.trim(),
                actor: currentUserName || 'מערכת',
            });

            const targetName = selectedOwner || 'ללא מוביל';
            success(`הליד הועבר בהצלחה ל-${targetName}!`);
            onTransferred(result.lead, result.note);
            onClose();
        } catch (e) {
            console.error('Failed to transfer lead:', e);
            error('שגיאה בהעברת הליד');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div 
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-[modal-backdrop-in_150ms_ease-out]"
            onClick={onClose}
            dir="rtl"
        >
            <div
                className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-[modal-slide-up_200ms_ease-out] border border-slate-100"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-blue-50/30">
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                            <ArrowLeftRight size={18} />
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-slate-800">העברת מוביל ליד</h3>
                            <p className="text-xs text-slate-500">{lead.fields.Name || lead.fields.Phone}</p>
                        </div>
                    </div>
                    <button 
                        onClick={onClose}
                        className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-5">
                    {/* Visual Transfer Overview */}
                    <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
                        {/* Current Owner */}
                        <div className="flex flex-col items-center flex-1 text-center">
                            <span className="text-[10px] font-bold text-slate-400 uppercase mb-1">מוביל נוכחי</span>
                            {currentOwner ? (
                                <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold shadow-sm ${OWNER_COLORS[currentOwner] || 'bg-slate-200 text-slate-700'}`}>
                                    <span className="w-2 h-2 rounded-full bg-current opacity-75" />
                                    {currentOwner}
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-slate-400 border border-dashed border-slate-300">
                                    ללא מוביל
                                </span>
                            )}
                        </div>

                        {/* Arrow */}
                        <div className="px-3 text-blue-500 font-bold flex flex-col items-center justify-center">
                            <ArrowLeftRight size={20} className="animate-pulse" />
                        </div>

                        {/* Target Owner */}
                        <div className="flex flex-col items-center flex-1 text-center">
                            <span className="text-[10px] font-bold text-slate-400 uppercase mb-1">מוביל חדש</span>
                            {selectedOwner ? (
                                <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold shadow-sm ${OWNER_COLORS[selectedOwner] || 'bg-slate-200 text-slate-700'}`}>
                                    <span className="w-2 h-2 rounded-full bg-current opacity-75" />
                                    {selectedOwner}
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-slate-400 border border-dashed border-slate-300">
                                    ללא מוביל
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Owner Options */}
                    <div>
                        <label className="block text-xs font-bold text-slate-700 mb-2">
                            בחר למי להעביר את הטיפול בליד:
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                            {OWNERS.map((owner) => {
                                const isCurrent = owner === currentOwner;
                                const isSelected = owner === selectedOwner;
                                const colorClass = OWNER_COLORS[owner];

                                return (
                                    <button
                                        key={owner}
                                        type="button"
                                        onClick={() => setSelectedOwner(owner)}
                                        className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 text-xs font-bold transition-all relative ${
                                            isSelected 
                                                ? 'border-blue-600 bg-blue-50/60 shadow-sm text-blue-900 ring-2 ring-blue-200' 
                                                : isCurrent
                                                    ? 'border-slate-200 bg-slate-100/70 text-slate-500 hover:border-slate-300'
                                                    : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-slate-50'
                                        }`}
                                    >
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center mb-1 text-xs font-bold ${colorClass}`}>
                                            {owner[0]}
                                        </div>
                                        <span>{owner}</span>
                                        {isCurrent && (
                                            <span className="text-[9px] text-slate-400 font-normal mt-0.5">(נוכחי)</span>
                                        )}
                                        {isSelected && !isCurrent && (
                                            <span className="absolute top-1.5 left-1.5 text-blue-600">
                                                <UserCheck size={14} />
                                            </span>
                                        )}
                                    </button>
                                );
                            })}

                            {/* Unassign option */}
                            <button
                                type="button"
                                onClick={() => setSelectedOwner('')}
                                className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 text-xs font-bold transition-all relative ${
                                    selectedOwner === ''
                                        ? 'border-amber-500 bg-amber-50 text-amber-800 ring-2 ring-amber-200'
                                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                                }`}
                            >
                                <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mb-1">
                                    <UserMinus size={14} />
                                </div>
                                <span>ללא מוביל</span>
                                {currentOwner === '' && (
                                    <span className="text-[9px] text-slate-400 font-normal mt-0.5">(נוכחי)</span>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Handover Note */}
                    <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                            <span>
                                הערת תיעוד / דגשים להמשך טיפול <span className="text-red-500 font-extrabold">* (חובה)</span>
                            </span>
                            {!handoverNote.trim() && (
                                <span className="text-[10px] text-amber-600 font-semibold">שדה חובה</span>
                            )}
                        </label>
                        <textarea
                            value={handoverNote}
                            onChange={(e) => setHandoverNote(e.target.value)}
                            placeholder={currentOwner 
                                ? "למשל: סוכם 5,000 ₪, מחכה להצעת מחיר סופית, לחזור אליו ביום שלישי..."
                                : "למשל: יצרתי קשר ראשוני עם הלקוח, לוקח לטיפולי עבור אירוע בוזוקי..."
                            }
                            rows={3}
                            className={`w-full text-xs p-3 bg-slate-50 border rounded-xl focus:ring-2 focus:bg-white outline-none resize-none transition-all placeholder:text-slate-400 leading-relaxed ${
                                !handoverNote.trim() 
                                    ? 'border-amber-300 focus:ring-amber-400' 
                                    : 'border-slate-200 focus:ring-blue-500'
                            }`}
                        />
                        <p className="text-[10px] text-slate-400 mt-1">
                            ההערה תירשם כעדכון רשמי בציר הזמן של הליד ותתעד את רגע השיוך/ההעברה.
                        </p>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center gap-3 px-6 py-4 bg-slate-50 border-t border-slate-100">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={submitting}
                        className="flex-1 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-200/70 rounded-xl transition-colors disabled:opacity-50"
                    >
                        ביטול
                    </button>
                    <button
                        type="button"
                        onClick={handleTransfer}
                        disabled={submitting || selectedOwner === currentOwner || !handoverNote.trim()}
                        className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {submitting ? (
                            <span>מעדכן...</span>
                        ) : (
                            <>
                                <ArrowLeftRight size={14} />
                                <span>{currentOwner ? 'בצע העברה' : 'שמור שיוך ליד'}</span>
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
