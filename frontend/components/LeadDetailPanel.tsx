'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Send, FileText, Clock, Paperclip, Image, File, RefreshCw, RotateCcw, BellOff, Wrench, Trash2, Pencil, Calendar, ExternalLink, Star } from 'lucide-react';
import { api } from '@/lib/api';
import { Lead, Note, FinanceEntry, Task } from '@/types';
import clsx from 'clsx';

interface LeadDetailPanelProps {
    lead: Lead;
    currentUserName: string;
    isAdmin?: boolean;
    onClose: () => void;
    onStatusChange: (leadId: string, status: string) => void;
}

const BOUZOUKI_STATUSES = [
    { value: 'New', label: 'חדש', color: 'bg-blue-100 text-blue-800' },
    { value: 'Processing', label: 'בטיפול בוט', color: 'bg-yellow-100 text-yellow-800' },
    { value: 'Distributed', label: 'בהפצה', color: 'bg-purple-100 text-purple-800' },
    { value: 'Assigned', label: 'שובץ נגן', color: 'bg-indigo-100 text-indigo-800' },
    { value: 'Closed', label: 'נסגר', color: 'bg-green-100 text-green-800' },
    { value: 'Lost', label: 'אבוד', color: 'bg-red-100 text-red-800' },
];

const MANUAL_STATUSES = [
    { value: 'New', label: 'חדש', color: 'bg-blue-100 text-blue-800' },
    { value: 'Manual', label: 'בטיפול ידני', color: 'bg-indigo-100 text-indigo-800' },
    { value: 'Talking', label: 'בשיחה', color: 'bg-cyan-100 text-cyan-800' },
    { value: 'Quote_Sent', label: 'נשלחה הצ"מ', color: 'bg-amber-100 text-amber-800' },
    { value: 'Waiting_Payment', label: 'מחכה לתשלום', color: 'bg-orange-100 text-orange-800' },
    { value: 'Closed', label: 'נסגר', color: 'bg-green-100 text-green-800' },
    { value: 'Lost', label: 'אבוד', color: 'bg-red-100 text-red-800' },
];

export default function LeadDetailPanel({ lead, currentUserName, isAdmin = false, onClose, onStatusChange }: LeadDetailPanelProps) {
    const [tab, setTab] = useState<'updates' | 'tasks' | 'info' | 'finance'>('updates');
    const [notes, setNotes] = useState<Note[]>([]);
    const [noteText, setNoteText] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [attachedFile, setAttachedFile] = useState<{ file: File; previewUrl?: string } | null>(null);
    const [fileError, setFileError] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [closingAmount, setClosingAmount] = useState('');
    const [editData, setEditData] = useState<Partial<Lead['fields']>>({});
    const [savingInfo, setSavingInfo] = useState(false);
    const [isStarMenuOpen, setIsStarMenuOpen] = useState(false);

    // Tasks Tab State
    const [tasks, setTasks] = useState<Task[]>([]);
    const [newTaskTitle, setNewTaskTitle] = useState('');
    const [newTaskAssignee, setNewTaskAssignee] = useState<string>('');
    const [newTaskDueDate, setNewTaskDueDate] = useState('');
    const [taskSubmitting, setTaskSubmitting] = useState(false);

    // Finance Tab State
    const [finances, setFinances] = useState<FinanceEntry[]>([]);
    const [financeType, setFinanceType] = useState<'income' | 'expense'>('income');
    const [financeAmount, setFinanceAmount] = useState('');
    const [financeDesc, setFinanceDesc] = useState('');
    const [financePaymentMethod, setFinancePaymentMethod] = useState<'חשבון' | 'מזומן'>('חשבון');
    const [financeSubmitting, setFinanceSubmitting] = useState(false);
    const [financeModalOpen, setFinanceModalOpen] = useState(false);
    const [financeEditId, setFinanceEditId] = useState<string | null>(null);

    useEffect(() => {
        setClosingAmount(lead.fields.Closing_Amount?.toString() || '');
        setEditData({
            Name: lead.fields.Name,
            Phone: lead.fields.Phone,
            Service: lead.fields.Service,
            Event_Date: lead.fields.Event_Date,
            Location: lead.fields.Location,
            Guests: lead.fields.Guests,
            Owner: lead.fields.Owner,
            Last_Summary: lead.fields.Last_Summary,
        });
    }, [lead]);

    useEffect(() => {
        fetchNotes();
        fetchFinances();
        fetchTasks();
    }, [lead.id]);

    const fetchNotes = async () => {
        try {
            const data = await api.getNotes(lead.id);
            setNotes(data);
        } catch (e) {
            console.error(e);
        }
    };

    const fetchFinances = async () => {
        try {
            const allFinances = await api.getFinanceEntries();
            const leadFinances = allFinances.filter(f => f.fields.Lead_ID === lead.id);
            // Sort by Date descending
            leadFinances.sort((a, b) => new Date(b.fields.Date || 0).getTime() - new Date(a.fields.Date || 0).getTime());
            setFinances(leadFinances);
        } catch (e) {
            console.error(e);
        }
    };

    const fetchTasks = async () => {
        try {
            const allTasks = await api.getTasks();
            setTasks(allTasks.filter(t => t.fields.Lead_ID === lead.id));
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

    const handleAddTask = async () => {
        if (!newTaskTitle.trim()) return;
        setTaskSubmitting(true);
        try {
            await api.createTask({
                Title: newTaskTitle.trim(),
                Assignee: newTaskAssignee || currentUserName,
                Due_Date: newTaskDueDate,
                Is_Completed: false,
                Lead_ID: lead.id
            });
            setNewTaskTitle('');
            setNewTaskDueDate('');
            fetchTasks();
        } catch (e) {
            console.error(e);
            alert('שגיאה ביצירת המשימה');
        } finally {
            setTaskSubmitting(false);
        }
    };

    const handleToggleTask = async (task: Task) => {
        try {
            const updated = await api.updateTask(task.id, { Is_Completed: !task.fields.Is_Completed });
            setTasks(tasks.map(t => t.id === updated.id ? updated : t));
        } catch (e) {
            console.error(e);
        }
    };

    const handleDeleteTask = async (id: string) => {
        if (!confirm('למחוק את המשימה?')) return;
        try {
            await api.deleteTask(id);
            setTasks(tasks.filter(t => t.id !== id));
        } catch (e) {
            console.error(e);
            alert('שגיאה במחיקת המשימה');
        }
    };

    const handleSaveFinance = async () => {
        if (!financeAmount || !financeDesc) return;
        setFinanceSubmitting(true);
        try {
            if (financeEditId) {
                await api.updateFinanceEntry(financeEditId, {
                    Type: financeType,
                    Description: financeDesc,
                    Amount: parseFloat(financeAmount),
                    Payment_Method: financePaymentMethod,
                });
            } else {
                await api.createFinanceEntry({
                    Owner: currentUserName,
                    Type: financeType,
                    Date: new Date().toISOString().split('T')[0],
                    Description: financeDesc,
                    Event_Name: lead.fields.Service || '',
                    Amount: parseFloat(financeAmount),
                    Payment_Status: 'שולם',
                    Payment_Method: financePaymentMethod,
                    Lead_ID: lead.id
                });
            }
            setFinanceAmount('');
            setFinanceDesc('');
            setFinanceEditId(null);
            setFinanceModalOpen(false);
            fetchFinances(); // Refresh the list
        } catch (e) {
            console.error(e);
            alert('שגיאה בשמירת התנועה');
        } finally {
            setFinanceSubmitting(false);
        }
    };

    const handleDeleteFinance = async (id: string) => {
        if (!confirm('למחוק תנועה זו?')) return;
        try {
            await api.deleteFinanceEntry(id);
            fetchFinances();
        } catch (e) {
            console.error(e);
            alert('שגיאה במחיקת התנועה');
        }
    };
    
    const openFinanceModal = (type: 'income' | 'expense') => {
        setFinanceType(type);
        setFinanceAmount('');
        setFinanceDesc('');
        setFinanceEditId(null);
        setFinancePaymentMethod('חשבון');
        setFinanceModalOpen(true);
    };

    const handleEditFinance = (entry: FinanceEntry) => {
        setFinanceType(entry.fields.Type);
        setFinanceAmount(entry.fields.Amount.toString());
        setFinanceDesc(entry.fields.Description);
        setFinancePaymentMethod(entry.fields.Payment_Method || 'חשבון');
        setFinanceEditId(entry.id);
        setFinanceModalOpen(true);
    };

    const handleUpdateInfo = async () => {
        setSavingInfo(true);
        try {
            await api.updateLead(lead.id, editData);
            // We don't have a direct onUpdate callback here, but the realtime subscription 
            // in the parent will catch it. However, to be immediate:
            Object.assign(lead.fields, editData);
            alert('הפרטים עודכנו בהצלחה');
        } catch (e) {
            console.error(e);
            alert('עדכון הפרטים נכשל');
        } finally {
            setSavingInfo(false);
        }
    };

    const formatDate = (d: string) => {
        try {
            return new Date(d).toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        } catch { return d; }
    };

    const totalFinance = finances.reduce((sum, entry) => {
        if (entry.fields.Type === 'income') return sum + (entry.fields.Amount || 0);
        return sum - (entry.fields.Amount || 0);
    }, 0);

    const tabs = [
        { key: 'updates' as const, label: 'עדכונים', count: notes.length },
        { key: 'finance' as const, label: 'פיננסי', count: finances.length },
        { key: 'tasks' as const, label: 'משימות', count: tasks.filter(t => !t.fields.Is_Completed).length },
        { key: 'info' as const, label: 'פרטים' },
    ];

    return (
        <div className="fixed inset-0 z-50 flex items-stretch md:items-center justify-end bg-black/30 backdrop-blur-sm" dir="rtl" onClick={onClose}>
            <div className="w-full md:w-[560px] h-full md:h-[90vh] bg-white md:rounded-r-2xl shadow-2xl flex flex-col relative" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                    <div>
                        <div className="flex items-center gap-2.5 flex-wrap">
                            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                {lead.fields.Name || lead.fields.Phone}
                                {(lead.fields.Starred_By || []).length > 0 && (
                                    <Star size={18} className="text-amber-400 fill-amber-400 drop-shadow-sm" />
                                )}
                            </h2>
                            {lead.fields.Event_Date && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 border border-blue-100 text-blue-700 text-sm font-bold rounded-lg">
                                    <Calendar size={14} className="text-blue-500" />
                                    {lead.fields.Event_Date}
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">{lead.fields.Phone} · {lead.fields.Service || '—'}</p>
                    </div>
                    <div className="flex items-center gap-2 relative">
                        {/* Star Menu Toggle */}
                        <div className="relative">
                            <button 
                                onClick={() => setIsStarMenuOpen(!isStarMenuOpen)} 
                                className="p-2 hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-1 text-slate-600 font-medium text-sm"
                            >
                                <Star size={20} className={(lead.fields.Starred_By || []).includes(currentUserName) ? 'text-amber-400 fill-amber-400' : 'text-slate-400'} />
                            </button>

                            {isStarMenuOpen && (
                                <>
                                    <div className="fixed inset-0 z-[60]" onClick={() => setIsStarMenuOpen(false)}></div>
                                    <div className="absolute left-0 mt-2 w-48 bg-white border border-slate-100 rounded-xl shadow-xl z-[70] py-1 overflow-hidden" dir="rtl">
                                        <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 border-b border-slate-50 uppercase tracking-wider">סמן במועדפים עבור:</div>
                                        {['אילן', 'קובי', 'כולם'].map(assignee => {
                                            const isStarred = (lead.fields.Starred_By || []).includes(assignee);
                                            const isDisabled = currentUserName === 'קובי' && assignee === 'אילן';
                                            
                                            return (
                                                <button
                                                    key={assignee}
                                                    disabled={isDisabled}
                                                    onClick={() => {
                                                        const currentStars = lead.fields.Starred_By || [];
                                                        const newStars = isStarred 
                                                            ? currentStars.filter(n => n !== assignee)
                                                            : [...currentStars, assignee];
                                                        
                                                        api.updateLead(lead.id, { Starred_By: newStars }).then(() => {
                                                            onStatusChange(lead.id, lead.fields.Status);
                                                        });
                                                        setIsStarMenuOpen(false);
                                                    }}
                                                    className={clsx(
                                                        "w-full text-right px-4 py-2 text-sm flex items-center justify-between transition-colors",
                                                        isDisabled ? "text-slate-300 cursor-not-allowed bg-slate-50/50" : "text-slate-700 hover:bg-slate-50"
                                                    )}
                                                >
                                                    <span className="flex items-center gap-2">
                                                        {assignee}
                                                        {isDisabled && <span className="text-[9px] text-slate-400 font-normal">(רק אילן יכול)</span>}
                                                    </span>
                                                    {isStarred && <Star size={14} className="text-amber-400 fill-amber-400" />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </>
                            )}
                        </div>

                        <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg">
                            <X size={20} className="text-slate-500" />
                        </button>
                    </div>
                </div>

                {/* Status Pipeline */}
                <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50">
                    <span className="block text-xs font-bold text-slate-500 mb-2.5">שלב נוכחי: בתהליך</span>
                    <div className="flex items-center flex-wrap gap-y-2">
                        {(lead.fields.Service === 'Bouzouki' ? BOUZOUKI_STATUSES : MANUAL_STATUSES).map((s, idx, arr) => (
                            <div key={s.value} className="flex items-center">
                                <button
                                    onClick={() => handleStatusChange(s.value)}
                                    className={clsx(
                                        "text-[11px] px-3 py-1.5 rounded-lg font-bold transition-all border shadow-sm",
                                        lead.fields.Status === s.value
                                            ? s.color + " border-transparent ring-2 ring-offset-1 ring-slate-300 scale-105"
                                            : "bg-white text-slate-500 border-slate-200 hover:bg-slate-100 hover:text-slate-800 hover:-translate-y-0.5"
                                    )}
                                >
                                    {s.label}
                                </button>
                                {idx < arr.length - 1 && (
                                    <div className="w-3 md:w-5 border-t-2 border-dashed border-slate-300 mx-0.5 shrink-0" />
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Admin Flow Control */}
                {isAdmin && (
                    <div className="px-5 py-2.5 border-b border-slate-100 bg-slate-50">
                        <div className="flex items-center gap-1.5 mb-2">
                            <Wrench size={12} className="text-slate-500" />
                            <span className="text-[10px] font-bold text-slate-500">שליטה בפלואו (מנהל)</span>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                            {lead.fields.Service === 'Bouzouki' && (
                                <button
                                    onClick={() => {
                                        if (confirm('להחזיר את הליד להפצה לכל הנגנים?')) {
                                            api.updateLead(lead.id, { Status: 'New', Musician_Assigned: [] });
                                            onStatusChange(lead.id, 'New');
                                        }
                                    }}
                                    className="flex items-center gap-1 px-2.5 py-1.5 bg-indigo-50 text-indigo-700 text-[11px] font-bold rounded-lg hover:bg-indigo-100 transition-all"
                                >
                                    <RefreshCw size={12} /> החזר להפצה
                                </button>
                            )}
                            <button
                                onClick={() => {
                                    if (confirm('לאפס את הליד לסטטוס "חדש"? זה ינקה את שיוך הנגן.')) {
                                        api.updateLead(lead.id, { Status: 'New', Musician_Assigned: [] });
                                        onStatusChange(lead.id, 'New');
                                    }
                                }}
                                className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-50 text-blue-700 text-[11px] font-bold rounded-lg hover:bg-blue-100 transition-all"
                            >
                                <RotateCcw size={12} /> החזר לחדש
                            </button>
                            <button
                                onClick={() => {
                                    if (confirm('להשתיק את הבוט ל-24 שעות עבור ליד זה?')) {
                                        const muteUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
                                        api.updateLead(lead.id, { Bot_Mute_Until: muteUntil });
                                        alert('הבוט הושתק ל-24 שעות עבור ליד זה.');
                                    }
                                }}
                                className="flex items-center gap-1 px-2.5 py-1.5 bg-amber-50 text-amber-700 text-[11px] font-bold rounded-lg hover:bg-amber-100 transition-all"
                            >
                                <BellOff size={12} /> השתק בוט 24ש׳
                            </button>
                        </div>
                    </div>
                )}

                {/* Closing Amount / Quote */}
                <div className="px-5 py-2.5 border-b border-slate-100 flex items-center justify-between gap-2 bg-slate-50">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-500">הצעת מחיר / סכום:</span>
                        <div className="relative">
                            <input
                                type="number"
                                value={closingAmount}
                                onChange={(e) => setClosingAmount(e.target.value)}
                                className="pl-6 pr-2 py-1.5 border border-slate-200 rounded-lg text-sm w-32 focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="0"
                                dir="ltr"
                            />
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">₪</span>
                        </div>
                    </div>
                    {closingAmount !== (lead.fields.Closing_Amount?.toString() || '') && (
                        <button
                            onClick={async () => {
                                try {
                                    const val = closingAmount ? parseFloat(closingAmount) : undefined;
                                    await api.updateLead(lead.id, { Closing_Amount: val });
                                    // Update locally for immediate reflect
                                    Object.assign(lead.fields, { Closing_Amount: val });
                                    // small trick to re-evaluate the condition
                                    setClosingAmount(val?.toString() || '');
                                } catch (e) {
                                    console.error(e);
                                    alert('שגיאה בשמירת הסכום');
                                }
                            }}
                            className="text-[11px] font-bold bg-green-100 text-green-700 px-3 py-1.5 rounded-lg hover:bg-green-200 transition-colors shadow-sm"
                        >
                            שמור סכום
                        </button>
                    )}
                </div>

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
                                                                src={`https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`}
                                                                className="w-full h-48 bg-white"
                                                                title={name}
                                                            />
                                                        </div>
                                                    )}
                                                    <a href={url} target="_blank" rel="noopener noreferrer" className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg transition-colors">
                                                        <ExternalLink size={12} /> {isPdf ? 'פתח PDF' : name}
                                                    </a>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {tab === 'finance' && (
                        <div className="flex flex-col h-full bg-slate-50">
                            {/* Actions */}
                            <div className="p-3 bg-white border-b border-slate-200 flex gap-2">
                                <button
                                    onClick={() => openFinanceModal('income')}
                                    className="flex-1 py-1.5 text-xs font-bold rounded bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                                >
                                    + הוסף הכנסה
                                </button>
                                <button
                                    onClick={() => openFinanceModal('expense')}
                                    className="flex-1 py-1.5 text-xs font-bold rounded bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors"
                                >
                                    - הוסף הוצאה
                                </button>
                            </div>

                            {/* List */}
                            <div className="flex-1 overflow-y-auto">
                                {finances.length === 0 ? (
                                    <p className="text-center text-slate-400 text-xs py-4">אין תנועות כספיות לליד זה</p>
                                ) : (
                                    <div className="flex flex-col">
                                        {/* Header Row */}
                                        <div className="flex items-center px-4 py-2 text-[10px] font-bold text-slate-400 border-b border-slate-200 uppercase bg-slate-100">
                                            <div className="w-16">תאריך</div>
                                            <div className="flex-1">תיאור</div>
                                            <div className="w-20 text-left">סכום</div>
                                            <div className="w-12"></div>
                                        </div>
                                        {/* Rows */}
                                        {finances.map((entry) => (
                                            <div key={entry.id} className="flex items-center px-4 py-2 text-xs border-b border-slate-100 hover:bg-white transition-colors bg-slate-50">
                                                <div className="w-16 text-[10px] text-slate-500">{new Date(entry.fields.Date).toLocaleDateString('he-IL', {day:'2-digit', month:'2-digit', year:'2-digit'})}</div>
                                                <div className="flex-1 flex flex-col justify-center">
                                                    <span className="font-semibold text-slate-700 truncate">{entry.fields.Description}</span>
                                                    <span className="text-[9px] text-slate-400">{entry.fields.Payment_Method}</span>
                                                </div>
                                                <div className={clsx(
                                                    "w-20 text-left font-bold font-mono tracking-tighter",
                                                    entry.fields.Type === 'income' ? "text-emerald-600" : "text-red-600"
                                                )} dir="ltr">
                                                    {entry.fields.Type === 'income' ? '+' : '-'}{entry.fields.Amount.toLocaleString()} ₪
                                                </div>
                                                <div className="w-12 flex items-center justify-end gap-2 text-slate-400">
                                                    <button onClick={() => handleEditFinance(entry)} className="hover:text-blue-500"><Pencil size={12} /></button>
                                                    <button onClick={() => handleDeleteFinance(entry.id)} className="hover:text-red-500"><Trash2 size={12} /></button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Summary Footer */}
                            <div className="p-4 bg-white border-t border-slate-200 shadow-[0_-4px_6px_-1px_rgb(0,0,0,0.05)]">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-bold text-slate-600">סה״כ נשאר בקופה:</span>
                                    <span className={clsx(
                                        "text-xl font-black font-mono tracking-tighter",
                                        totalFinance >= 0 ? "text-emerald-600" : "text-red-600"
                                    )} dir="ltr">{totalFinance.toLocaleString()} ₪</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {tab === 'info' && (
                        <div className="p-5 space-y-4">
                            <div className="space-y-3">
                                <div className="flex flex-col gap-1">
                                    <label className="text-[10px] font-bold text-slate-500 mr-1">שם הלקוח</label>
                                    <input
                                        type="text"
                                        value={editData.Name || ''}
                                        onChange={(e) => setEditData({ ...editData, Name: e.target.value })}
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="text-[10px] font-bold text-slate-500 mr-1">טלפון</label>
                                    <input
                                        type="text"
                                        value={editData.Phone || ''}
                                        onChange={(e) => setEditData({ ...editData, Phone: e.target.value })}
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                        dir="ltr"
                                    />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="text-[10px] font-bold text-slate-500 mr-1">שירות</label>
                                    <select
                                        value={editData.Service || ''}
                                        onChange={(e) => setEditData({ ...editData, Service: e.target.value as any })}
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none appearance-none"
                                    >
                                        <option value="">בחר שירות...</option>
                                        <option value="Bouzouki">נגן בוזוקי 🎸</option>
                                        <option value="Reception">קבלת פנים 🎻</option>
                                        <option value="Band">להקה 🥁</option>
                                        <option value="DJ">דיג'יי 🎧</option>
                                        <option value="Talk">לדבר עם מישהו 📞</option>
                                        <option value="Other">אחר ✨</option>
                                    </select>
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="text-[10px] font-bold text-slate-500 mr-1">תאריך אירוע</label>
                                    <input
                                        type="text"
                                        value={editData.Event_Date || ''}
                                        onChange={(e) => setEditData({ ...editData, Event_Date: e.target.value })}
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                        placeholder="למשל: 25.12.24"
                                    />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="text-[10px] font-bold text-slate-500 mr-1">מיקום</label>
                                    <input
                                        type="text"
                                        value={editData.Location || ''}
                                        onChange={(e) => setEditData({ ...editData, Location: e.target.value })}
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                        placeholder="עיר או אולם"
                                    />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="text-[10px] font-bold text-slate-500 mr-1">כמות אורחים</label>
                                    <input
                                        type="text"
                                        value={editData.Guests || ''}
                                        onChange={(e) => setEditData({ ...editData, Guests: e.target.value })}
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="text-[10px] font-bold text-slate-500 mr-1">מוביל (בעלים)</label>
                                    <input
                                        type="text"
                                        value={editData.Owner || ''}
                                        onChange={(e) => setEditData({ ...editData, Owner: e.target.value })}
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                </div>
                            </div>

                            <button
                                onClick={handleUpdateInfo}
                                disabled={savingInfo}
                                className="w-full py-2.5 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-all shadow-sm flex items-center justify-center gap-2"
                            >
                                {savingInfo ? 'שומר...' : 'שמור שינויים'}
                            </button>
                        </div>
                    )}

                    {tab === 'tasks' && (
                        <div className="flex flex-col h-full bg-slate-50">
                            {/* Actions / Form */}
                            <div className="p-4 bg-white border-b border-slate-200">
                                <form onSubmit={(e) => { e.preventDefault(); handleAddTask(); }} className="flex flex-col gap-2">
                                    <div className="flex-1 w-full bg-slate-50 border border-slate-200 rounded-lg flex items-center px-3 py-2 focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-400 transition-all">
                                        <input
                                            type="text"
                                            placeholder="הכנס משימה חדשה שקשורה לאירוע..."
                                            value={newTaskTitle}
                                            onChange={(e) => setNewTaskTitle(e.target.value)}
                                            className="flex-1 text-sm outline-none bg-transparent"
                                            required
                                        />
                                    </div>
                                    <div className="flex gap-2">
                                        <div className="w-1/2 flex items-center bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 focus-within:border-blue-400 transition-all">
                                            <input
                                                type="text"
                                                placeholder="תאריך יעד (אופציונלי)"
                                                value={newTaskDueDate}
                                                onChange={(e) => setNewTaskDueDate(e.target.value)}
                                                className="w-full bg-transparent text-xs outline-none placeholder:text-slate-400"
                                            />
                                        </div>
                                        <div className="w-1/2 flex items-center bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 focus-within:border-blue-400 transition-all">
                                            <select
                                                value={newTaskAssignee}
                                                onChange={(e) => setNewTaskAssignee(e.target.value)}
                                                className="w-full bg-transparent text-xs outline-none appearance-none"
                                            >
                                                <option value="">משויך למנהל...</option>
                                                <option value="אילן">אילן</option>
                                                <option value="קובי">קובי</option>
                                            </select>
                                        </div>
                                    </div>
                                    <button
                                        type="submit"
                                        disabled={taskSubmitting || !newTaskTitle.trim()}
                                        className="mt-1 w-full py-2 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-all shadow-sm"
                                    >
                                        {taskSubmitting ? 'מוסיף...' : 'הוסף משימה'}
                                    </button>
                                </form>
                            </div>

                            {/* List */}
                            <div className="flex-1 overflow-y-auto p-4">
                                {tasks.length === 0 ? (
                                    <p className="text-center text-slate-400 text-xs py-8">אין משימות פתוחות לאירוע זה</p>
                                ) : (
                                    <div className="flex flex-col space-y-2">
                                        {tasks.filter(t => !t.fields.Is_Completed).map((task) => (
                                            <div key={task.id} className="group bg-white border border-slate-200 rounded-lg p-3 flex items-start gap-3 shadow-sm hover:border-blue-200 transition-all">
                                                <button onClick={() => handleToggleTask(task)} className="mt-0.5 shrink-0 text-slate-300 hover:text-blue-500 transition-colors">
                                                    <div className="w-5 h-5 rounded-full border-2 border-currentColor"></div>
                                                </button>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-bold text-slate-700">{task.fields.Title}</p>
                                                    <div className="flex items-center gap-3 mt-1.5 text-[10px] text-slate-500 font-medium">
                                                        {task.fields.Assignee && <span className="bg-slate-100 px-2 py-0.5 rounded">{task.fields.Assignee}</span>}
                                                        {task.fields.Due_Date && <span>📅 {task.fields.Due_Date}</span>}
                                                    </div>
                                                </div>
                                                <button onClick={() => handleDeleteTask(task.id)} className="text-slate-300 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition-all">
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        ))}

                                        {tasks.filter(t => t.fields.Is_Completed).length > 0 && (
                                            <div className="pt-4 mt-4 border-t border-slate-200">
                                                <p className="text-[10px] font-bold text-slate-400 mb-3">משימות שהושלמו</p>
                                                {tasks.filter(t => t.fields.Is_Completed).map((task) => (
                                                    <div key={task.id} className="group bg-slate-50 border border-slate-100 rounded-lg p-3 flex items-start gap-3 mb-2">
                                                        <button onClick={() => handleToggleTask(task)} className="mt-0.5 shrink-0 text-green-500 hover:text-slate-400 transition-colors">
                                                            <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center">
                                                                <svg className="w-3 h-3 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                                                            </div>
                                                        </button>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-sm font-medium text-slate-400 line-through">{task.fields.Title}</p>
                                                        </div>
                                                        <button onClick={() => handleDeleteTask(task.id)} className="text-slate-300 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition-all">
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {financeModalOpen && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm md:rounded-r-2xl">
                        <div className="w-full max-w-sm bg-white rounded-xl shadow-xl overflow-hidden" onClick={e => e.stopPropagation()}>
                            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                                <h3 className="text-sm font-bold text-slate-800">{financeEditId ? 'עריכת תנועה' : 'הוספת תנועה'}</h3>
                                <button onClick={() => setFinanceModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                                    <X size={16} />
                                </button>
                            </div>
                            <div className="p-4 space-y-3">
                                <div className="flex items-center gap-2 mb-2">
                                    <button
                                        onClick={() => setFinanceType('income')}
                                        className={clsx(
                                            "flex-1 py-1.5 text-xs font-bold rounded-lg transition-colors border",
                                            financeType === 'income' ? "bg-emerald-100 text-emerald-800 border-emerald-200" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
                                        )}
                                    >
                                        + הכנסה
                                    </button>
                                    <button
                                        onClick={() => setFinanceType('expense')}
                                        className={clsx(
                                            "flex-1 py-1.5 text-xs font-bold rounded-lg transition-colors border",
                                            financeType === 'expense' ? "bg-red-100 text-red-800 border-red-200" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
                                        )}
                                    >
                                        - הוצאה
                                    </button>
                                </div>
                                <input
                                    type="number"
                                    placeholder="סכום (₪)"
                                    value={financeAmount}
                                    onChange={(e) => setFinanceAmount(e.target.value)}
                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                    dir="ltr"
                                />
                                <input
                                    type="text"
                                    placeholder="תיאור (למשל: מקדמה, דלק...)"
                                    value={financeDesc}
                                    onChange={(e) => setFinanceDesc(e.target.value)}
                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                                <select
                                    value={financePaymentMethod}
                                    onChange={(e) => setFinancePaymentMethod(e.target.value as any)}
                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none appearance-none"
                                >
                                    <option value="חשבון">העברה / אשראי / ביט</option>
                                    <option value="מזומן">מזומן</option>
                                </select>
                            </div>
                            <div className="p-3 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
                                <button
                                    onClick={() => setFinanceModalOpen(false)}
                                    className="px-4 py-2 text-slate-500 text-xs font-bold hover:text-slate-700 transition-colors"
                                >
                                    ביטול
                                </button>
                                <button
                                    onClick={handleSaveFinance}
                                    disabled={financeSubmitting || !financeAmount || !financeDesc}
                                    className="px-6 py-2 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-all shadow-sm"
                                >
                                    {financeSubmitting ? 'שומר...' : 'שמור'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
