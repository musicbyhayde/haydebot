import React, { useState } from 'react';
import { Lead, Note } from '@/types';
import { api } from '@/lib/api';
import { X, Calendar, CheckCircle, ExternalLink } from 'lucide-react';
import { useToast } from '@/components/ui';

interface PendingFollowUpsModalProps {
    pendingNotes: Note[];
    leads: Lead[];
    onClose: () => void;
    onRefresh: () => void;
    onOpenDetails?: (leadId: string) => void;
}

export default function PendingFollowUpsModal({ pendingNotes, leads, onClose, onRefresh, onOpenDetails }: PendingFollowUpsModalProps) {
    const { success, error } = useToast();
    const [submitting, setSubmitting] = useState<string | null>(null);
    const [actionNote, setActionNote] = useState<{ noteId: string, leadId: string, action: 'done' | 'postpone' } | null>(null);
    const [newSummary, setNewSummary] = useState('');
    const [postponeDate, setPostponeDate] = useState('');

    const handleMarkDone = async (noteId: string, leadId: string) => {
        if (!newSummary.trim()) {
            error('אנא הזן סיכום קצר');
            return;
        }
        setSubmitting(noteId);
        try {
            // Update the note as completed
            await api.updateNote(noteId, { follow_up_completed: true });
            
            // Create a new note with the summary
            await api.createNote(leadId, {
                content: newSummary,
                author: 'מערכת (פולו-אפ)',
            });

            success('הפולו-אפ טופל בהצלחה');
            setActionNote(null);
            setNewSummary('');
            onRefresh();
        } catch (err) {
            console.error(err);
            error('שגיאה בעדכון');
        } finally {
            setSubmitting(null);
        }
    };

    const handlePostpone = async (noteId: string) => {
        if (!postponeDate) {
            error('אנא בחר תאריך חדש');
            return;
        }
        setSubmitting(noteId);
        try {
            await api.updateNote(noteId, { follow_up_date: postponeDate });
            success('הפולו-אפ נדחה בהצלחה');
            setActionNote(null);
            setPostponeDate('');
            onRefresh();
        } catch (err) {
            console.error(err);
            error('שגיאה בדחיית הפולו-אפ');
        } finally {
            setSubmitting(null);
        }
    };

    if (pendingNotes.length === 0) {
        return null;
    }

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-red-50">
                    <h2 className="text-xl font-bold text-red-700 flex items-center gap-2">
                        <span className="text-2xl">⏰</span>
                        יש לך {pendingNotes.length} פולו-אפים שדורשים התייחסות
                    </h2>
                    <button 
                        onClick={onClose}
                        className="p-2 text-red-500 hover:bg-red-100 rounded-full transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
                
                <div className="p-6 overflow-y-auto max-h-[60vh]">
                    <div className="space-y-4">
                        {pendingNotes.map(note => {
                            const lead = leads.find(l => l.id === note.fields.Lead_ID);
                            if (!lead) return null;
                            
                            const isActionDone = actionNote?.noteId === note.id && actionNote.action === 'done';
                            const isActionPostpone = actionNote?.noteId === note.id && actionNote.action === 'postpone';
                            
                            return (
                                <div key={note.id} className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
                                    <div className="flex justify-between items-start mb-3">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h3 className="font-bold text-slate-800 text-lg">{lead.fields.Name || 'ללא שם'}</h3>
                                                <button
                                                    onClick={() => {
                                                        onOpenDetails?.(lead.id);
                                                        onClose();
                                                    }}
                                                    className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-0.5 rounded font-medium transition-colors flex items-center gap-1 ml-2"
                                                    title="פתח תיק ליד"
                                                >
                                                    <ExternalLink size={12} /> תיק ליד
                                                </button>
                                                {lead.fields.Owner && (
                                                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-bold border border-blue-100">
                                                        מוביל: {lead.fields.Owner}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-slate-500 text-sm">{lead.fields.Phone}</p>
                                        </div>
                                        <div className="text-left">
                                            <p className="text-xs text-red-600 font-semibold bg-red-100 px-2 py-1 rounded-full">
                                                תאריך יעד: {note.fields.Follow_Up_Date}
                                            </p>
                                        </div>
                                    </div>
                                    
                                    <div className="mb-4">
                                        <p className="text-slate-600 text-sm bg-white p-3 rounded-lg border border-slate-100">
                                            <span className="font-bold text-slate-700 text-xs block mb-1">הערה מקורית:</span>
                                            {note.fields.Content}
                                        </p>
                                    </div>
                                    
                                    {!isActionDone && !isActionPostpone && (
                                        <div className="flex gap-2">
                                            <button 
                                                onClick={() => setActionNote({ noteId: note.id, leadId: lead.id, action: 'done' })}
                                                className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                                            >
                                                <CheckCircle className="w-4 h-4" />
                                                טופל
                                            </button>
                                            <button 
                                                onClick={() => setActionNote({ noteId: note.id, leadId: lead.id, action: 'postpone' })}
                                                className="flex-1 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                                            >
                                                <Calendar className="w-4 h-4" />
                                                דחה פולו-אפ
                                            </button>
                                        </div>
                                    )}
                                    
                                    {isActionDone && (
                                        <div className="bg-white p-4 rounded-lg border border-green-200 mt-2 animate-in slide-in-from-top-2">
                                            <label className="block text-sm font-medium text-slate-700 mb-1">סיכום שיחה / טיפול:</label>
                                            <textarea 
                                                className="w-full border border-slate-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-green-500 outline-none mb-3"
                                                rows={3}
                                                value={newSummary}
                                                onChange={e => setNewSummary(e.target.value)}
                                                placeholder="מה קרה בפולו-אפ?"
                                            />
                                            <div className="flex gap-2">
                                                <button 
                                                    onClick={() => handleMarkDone(note.id, lead.id)}
                                                    disabled={submitting === note.id}
                                                    className="bg-green-600 hover:bg-green-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
                                                >
                                                    {submitting === note.id ? 'שומר...' : 'שמור'}
                                                </button>
                                                <button 
                                                    onClick={() => setActionNote(null)}
                                                    className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
                                                >
                                                    ביטול
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                    
                                    {isActionPostpone && (
                                        <div className="bg-white p-4 rounded-lg border border-blue-200 mt-2 animate-in slide-in-from-top-2">
                                            <label className="block text-sm font-medium text-slate-700 mb-1">תאריך חדש לפולו-אפ:</label>
                                            <input 
                                                type="date"
                                                className="w-full border border-slate-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none mb-3"
                                                value={postponeDate}
                                                onChange={e => setPostponeDate(e.target.value)}
                                                min={new Date().toISOString().split('T')[0]}
                                            />
                                            <div className="flex gap-2">
                                                <button 
                                                    onClick={() => handlePostpone(note.id)}
                                                    disabled={submitting === note.id}
                                                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
                                                >
                                                    {submitting === note.id ? 'שומר...' : 'שמור'}
                                                </button>
                                                <button 
                                                    onClick={() => setActionNote(null)}
                                                    className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
                                                >
                                                    ביטול
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
