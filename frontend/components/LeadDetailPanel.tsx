'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Send, FileText, Clock, Paperclip, Image, File } from 'lucide-react';
import { api } from '@/lib/api';
import { Lead, Note } from '@/types';
import clsx from 'clsx';

interface LeadDetailPanelProps {
    lead: Lead;
    currentUserName: string;
    onClose: () => void;
    onStatusChange: (leadId: string, status: string) => void;
}

const STATUS_OPTIONS = [
    { value: 'New', label: 'חדש', color: 'bg-blue-100 text-blue-800' },
    { value: 'Talking', label: 'רק דיבורים', color: 'bg-cyan-100 text-cyan-800' },
    { value: 'Processing', label: 'בטיפול', color: 'bg-yellow-100 text-yellow-800' },
    { value: 'Quote_Sent', label: 'נשלחה הצעת מחיר', color: 'bg-amber-100 text-amber-800' },
    { value: 'Waiting_Payment', label: 'מחכה לתשלום', color: 'bg-orange-100 text-orange-800' },
    { value: 'Assigned', label: 'שובץ נגן', color: 'bg-indigo-100 text-indigo-800' },
    { value: 'Closed', label: 'נסגר', color: 'bg-green-100 text-green-800' },
    { value: 'Lost', label: 'אבוד', color: 'bg-red-100 text-red-800' },
];

export default function LeadDetailPanel({ lead, currentUserName, onClose, onStatusChange }: LeadDetailPanelProps) {
    const [tab, setTab] = useState<'updates' | 'files' | 'info'>('updates');
    const [notes, setNotes] = useState<Note[]>([]);
    const [noteText, setNoteText] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [attachedFile, setAttachedFile] = useState<{ file: File; previewUrl?: string } | null>(null);
    const [fileError, setFileError] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [closingAmount, setClosingAmount] = useState('');

    useEffect(() => {
        fetchNotes();
    }, [lead.id]);

    const fetchNotes = async () => {
        try {
            const data = await api.getNotes(lead.id);
            setNotes(data);
        } catch (e) {
            console.error(e);
        }
    };

    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
    const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setFileError('');

        if (!ALLOWED_TYPES.includes(file.type)) {
            setFileError('ניתן לצרף רק תמונות (JPG, PNG, WebP) או PDF');
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
        }
        if (file.size > MAX_FILE_SIZE) {
            setFileError(`הקובץ גדול מדי (${(file.size / 1024 / 1024).toFixed(1)}MB). מקסימום 5MB`);
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
        }

        const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
        setAttachedFile({ file, previewUrl });
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const removeFile = () => {
        if (attachedFile?.previewUrl) URL.revokeObjectURL(attachedFile.previewUrl);
        setAttachedFile(null);
    };

    const handleAddNote = async () => {
        if (!noteText.trim() && !attachedFile) return;
        setSubmitting(true);
        try {
            let file_url: string | undefined;
            let file_name: string | undefined;

            // Upload file if attached
            if (attachedFile) {
                const formData = new FormData();
                formData.append('file', attachedFile.file);
                const uploadRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'}/upload`, {
                    method: 'POST',
                    body: formData,
                });
                if (uploadRes.ok) {
                    const uploadData = await uploadRes.json();
                    file_url = uploadData.url;
                    file_name = attachedFile.file.name;
                }
            }

            await api.createNote(lead.id, {
                content: noteText || `📎 ${attachedFile?.file.name || 'קובץ'}`,
                author: currentUserName,
                file_url,
                file_name,
            });
            setNoteText('');
            removeFile();
            fetchNotes();
        } catch (e) {
            console.error(e);
        } finally {
            setSubmitting(false);
        }
    };

    const handleStatusChange = async (newStatus: string) => {
        const updateData: any = { Status: newStatus };
        if (newStatus === 'Closed' && closingAmount) {
            updateData.Closing_Amount = parseFloat(closingAmount);
        }
        await api.updateLead(lead.id, updateData);
        onStatusChange(lead.id, newStatus);
    };

    const formatDate = (d: string) => {
        try {
            return new Date(d).toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        } catch { return d; }
    };

    const tabs = [
        { key: 'updates' as const, label: 'עדכונים', count: notes.length },
        { key: 'info' as const, label: 'פרטים' },
    ];

    return (
        <div className="fixed inset-0 z-50 flex items-stretch md:items-center justify-end bg-black/30 backdrop-blur-sm" dir="rtl" onClick={onClose}>
            <div className="w-full md:w-[560px] h-full md:h-[90vh] bg-white md:rounded-r-2xl shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                    <div>
                        <h2 className="text-lg font-bold text-slate-800">{lead.fields.Name || lead.fields.Phone}</h2>
                        <p className="text-xs text-slate-500">{lead.fields.Phone} · {lead.fields.Service || '—'}</p>
                    </div>
                    <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg">
                        <X size={20} className="text-slate-500" />
                    </button>
                </div>

                {/* Status Bar */}
                <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-slate-500">סטטוס:</span>
                    {STATUS_OPTIONS.map(s => (
                        <button
                            key={s.value}
                            onClick={() => handleStatusChange(s.value)}
                            className={clsx(
                                "text-[11px] px-2.5 py-1 rounded-full font-bold transition-all",
                                lead.fields.Status === s.value
                                    ? s.color + " ring-2 ring-offset-1 ring-slate-300"
                                    : "bg-slate-50 text-slate-400 hover:bg-slate-100"
                            )}
                        >
                            {s.label}
                        </button>
                    ))}
                </div>

                {/* Closing Amount (shown when Closed) */}
                {lead.fields.Status === 'Closed' || lead.fields.Closing_Amount ? (
                    <div className="px-5 py-2 border-b border-slate-100 flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-500">סכום סגירה:</span>
                        <input
                            type="number"
                            value={closingAmount || lead.fields.Closing_Amount || ''}
                            onChange={(e) => setClosingAmount(e.target.value)}
                            className="px-2 py-1 border border-slate-200 rounded-lg text-sm w-28"
                            placeholder="₪"
                            dir="ltr"
                        />
                        <span className="text-xs text-slate-400">₪</span>
                    </div>
                ) : null}

                {/* Tabs */}
                <div className="flex border-b border-slate-100">
                    {tabs.map(t => (
                        <button
                            key={t.key}
                            onClick={() => setTab(t.key)}
                            className={clsx(
                                "flex-1 py-3 text-sm font-bold transition-all border-b-2",
                                tab === t.key
                                    ? "border-blue-500 text-blue-600"
                                    : "border-transparent text-slate-400 hover:text-slate-600"
                            )}
                        >
                            {t.label} {t.count !== undefined && <span className="text-xs opacity-60">({t.count})</span>}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto">
                    {tab === 'updates' && (
                        <div className="p-4 space-y-4">
                            {/* Note Input */}
                            <div className="border border-slate-200 rounded-xl p-3 bg-slate-50">
                                <textarea
                                    value={noteText}
                                    onChange={(e) => setNoteText(e.target.value)}
                                    className="w-full bg-transparent text-sm resize-none h-20 focus:outline-none placeholder:text-slate-400"
                                    placeholder="כתוב עדכון... (סיכום שיחה, הערה, הצעת מחיר...)"
                                />
                                {/* File preview */}
                                {attachedFile && (
                                    <div className="flex items-center gap-2 mt-2 px-2.5 py-1.5 bg-blue-50 border border-blue-100 rounded-lg">
                                        {attachedFile.previewUrl ? (
                                            <img src={attachedFile.previewUrl} alt="preview" className="w-8 h-8 rounded object-cover" />
                                        ) : (
                                            <File size={16} className="text-blue-500" />
                                        )}
                                        <span className="text-xs text-blue-700 font-medium flex-1 truncate">{attachedFile.file.name}</span>
                                        <button onClick={removeFile} className="text-blue-400 hover:text-red-500 transition-colors">
                                            <X size={14} />
                                        </button>
                                    </div>
                                )}
                                {fileError && (
                                    <p className="text-red-500 text-xs mt-1.5 flex items-center gap-1">⚠️ {fileError}</p>
                                )}
                                <div className="flex items-center justify-between mt-2">
                                    <div>
                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            className="hidden"
                                            accept="image/jpeg,image/png,image/webp,image/gif,.pdf"
                                            onChange={handleFileSelect}
                                        />
                                        <button
                                            onClick={() => fileInputRef.current?.click()}
                                            className="text-slate-400 hover:text-blue-500 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                                            title="צרף קובץ"
                                        >
                                            <Paperclip size={16} />
                                        </button>
                                    </div>
                                    <button
                                        onClick={handleAddNote}
                                        disabled={(!noteText.trim() && !attachedFile) || submitting}
                                        className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-all"
                                    >
                                        <Send size={12} /> שלח
                                    </button>
                                </div>
                            </div>

                            {/* Notes Feed */}
                            {notes.length === 0 ? (
                                <p className="text-center text-slate-400 text-sm py-8">אין עדכונים עדיין</p>
                            ) : (
                                notes.map((note) => (
                                    <div key={note.id} className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                                <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-blue-400 to-blue-600 flex items-center justify-center text-white text-[10px] font-bold">
                                                    {note.fields.Author?.substring(0, 1)}
                                                </div>
                                                <span className="text-sm font-bold text-slate-700">{note.fields.Author}</span>
                                            </div>
                                            <span className="text-[10px] text-slate-400 flex items-center gap-1">
                                                <Clock size={10} /> {formatDate(note.fields.Created_At)}
                                            </span>
                                        </div>
                                        <p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">{note.fields.Content}</p>
                                        {note.fields.File_URL && (() => {
                                            const url = note.fields.File_URL!;
                                            const name = note.fields.File_Name || 'קובץ מצורף';
                                            const isImage = /\.(jpg|jpeg|png|webp|gif)$/i.test(name) || /\.(jpg|jpeg|png|webp|gif)/i.test(url);
                                            const isPdf = /\.pdf$/i.test(name) || /\.pdf/i.test(url);

                                            return (
                                                <div className="mt-3">
                                                    {isImage && (
                                                        <a href={url} target="_blank" rel="noopener noreferrer">
                                                            <img
                                                                src={url}
                                                                alt={name}
                                                                className="max-w-full max-h-48 rounded-lg border border-slate-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer object-contain"
                                                            />
                                                        </a>
                                                    )}
                                                    {isPdf && (
                                                        <div className="border border-slate-200 rounded-lg overflow-hidden">
                                                            <iframe
                                                                src={url}
                                                                className="w-full h-48 bg-white"
                                                                title={name}
                                                            />
                                                        </div>
                                                    )}
                                                    <a href={url} target="_blank" rel="noopener noreferrer" className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-blue-500 hover:underline">
                                                        <FileText size={12} /> {name}
                                                    </a>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {tab === 'info' && (
                        <div className="p-5 space-y-3">
                            {[
                                { label: 'שם', value: lead.fields.Name },
                                { label: 'טלפון', value: lead.fields.Phone },
                                { label: 'שירות', value: lead.fields.Service },
                                { label: 'תאריך אירוע', value: lead.fields.Event_Date },
                                { label: 'מיקום', value: lead.fields.Location },
                                { label: 'אורחים', value: lead.fields.Guests },
                                { label: 'מוביל', value: lead.fields.Owner },
                                { label: 'סיכום אחרון', value: lead.fields.Last_Summary },
                            ].map((field, i) => (
                                <div key={i} className="flex justify-between py-2 border-b border-slate-50 last:border-0">
                                    <span className="text-xs font-semibold text-slate-500">{field.label}</span>
                                    <span className="text-sm text-slate-800">{field.value || '—'}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
