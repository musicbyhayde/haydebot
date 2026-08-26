'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Send, FileText, Clock, Paperclip, Image, File, RefreshCw, RotateCcw, BellOff, Wrench, Trash2, Pencil, Calendar, ExternalLink, Save, Check, Bell, CheckCircle, Briefcase } from 'lucide-react';
import { api, CalendarEventPayload } from '@/lib/api';
import { Lead, Note, FinanceEntry, Task, Musician } from '@/types';
import clsx from 'clsx';
import SendMaterialsModal from './SendMaterialsModal';
import CalendarEventModal from './CalendarEventModal';
import ProposalModal from './ProposalModal';
import { toDisplayPhone, toDbPhone, formatDateForInput, formatInputDateToDisplay } from '@/lib/formatters';
import TaskActionModal from './TaskActionModal';
import { useToast } from '@/components/ui';

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
    { value: 'Referred', label: 'הופנה', color: 'bg-teal-100 text-teal-800' },
    { value: 'Cold', label: 'ליד קר', color: 'bg-sky-100 text-sky-800' },
    { value: 'Completed', label: 'הושלם', color: 'bg-slate-200 text-slate-700' },
];

const MANUAL_STATUSES = [
    { value: 'New', label: 'חדש', color: 'bg-blue-100 text-blue-800' },
    { value: 'Manual', label: 'בטיפול ידני', color: 'bg-indigo-100 text-indigo-800' },
    { value: 'Talking', label: 'בשיחה', color: 'bg-cyan-100 text-cyan-800' },
    { value: 'Quote_Sent', label: 'נשלחה הצ"מ', color: 'bg-amber-100 text-amber-800' },
    { value: 'Waiting_Payment', label: 'מחכה לתשלום', color: 'bg-orange-100 text-orange-800' },
    { value: 'Closed', label: 'נסגר', color: 'bg-green-100 text-green-800' },
    { value: 'Lost', label: 'אבוד', color: 'bg-red-100 text-red-800' },
    { value: 'Referred', label: 'הופנה', color: 'bg-teal-100 text-teal-800' },
    { value: 'Cold', label: 'ליד קר', color: 'bg-sky-100 text-sky-800' },
    { value: 'Completed', label: 'הושלם', color: 'bg-slate-200 text-slate-700' },
];

export default function LeadDetailPanel({ lead, currentUserName, isAdmin = false, onClose, onStatusChange }: LeadDetailPanelProps) {
    const { error, success, confirm: confirmToast } = useToast();
    const [tab, setTab] = useState<'updates' | 'tasks' | 'team' | 'info' | 'finance'>('updates');
    const [notes, setNotes] = useState<Note[]>([]);
    const [noteText, setNoteText] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [attachedFile, setAttachedFile] = useState<{ file: File; previewUrl?: string } | null>(null);
    const [fileError, setFileError] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [closingAmount, setClosingAmount] = useState('');
    const [referredTo, setReferredTo] = useState('');
    const [commissionAmount, setCommissionAmount] = useState('');
    const [commissionIncludesVat, setCommissionIncludesVat] = useState(false);
    const [editData, setEditData] = useState<Partial<Lead['fields']>>({});
    const [savingInfo, setSavingInfo] = useState(false);

    // Tasks Tab State
    const [tasks, setTasks] = useState<Task[]>([]);
    const [newTaskTitle, setNewTaskTitle] = useState('');
    const [newTaskAssignee, setNewTaskAssignee] = useState<string>('');
    const [newTaskDueDate, setNewTaskDueDate] = useState('');
    const [taskSubmitting, setTaskSubmitting] = useState(false);
    const [taskPrompt, setTaskPrompt] = useState<{
        leadId: string;
        newStatus: string;
        taskCount: number;
    } | null>(null);

    // Follow-up Actions State
    const [actionNote, setActionNote] = useState<{ noteId: string, action: 'done' | 'postpone' } | null>(null);
    const [newSummary, setNewSummary] = useState('');
    const [postponeDate, setPostponeDate] = useState('');
    const [actionSubmitting, setActionSubmitting] = useState<string | null>(null);

    // Finance Tab State
    const [finances, setFinances] = useState<FinanceEntry[]>([]);
    const [financeType, setFinanceType] = useState<'income' | 'expense'>('income');
    const [financeAmount, setFinanceAmount] = useState('');
    const [financeDesc, setFinanceDesc] = useState('');
    const [financePaymentMethod, setFinancePaymentMethod] = useState<'חשבון' | 'מזומן'>('חשבון');
    const [financeSubmitting, setFinanceSubmitting] = useState(false);
    const [financeModalOpen, setFinanceModalOpen] = useState(false);
    const [financeEditId, setFinanceEditId] = useState<string | null>(null);
    const [financeOwner, setFinanceOwner] = useState('');

    // Intro/Materials Modal State
    const [isIntroModalOpen, setIsIntroModalOpen] = useState(false);
    
    // Proposal Modal State
    const [isProposalModalOpen, setIsProposalModalOpen] = useState(false);

    // Note Editing State
    const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
    const [editingNoteText, setEditingNoteText] = useState('');
    const [updatingNote, setUpdatingNote] = useState(false);

    // Follow-Up State
    const [followUpDate, setFollowUpDate] = useState('');
    const [showFollowUpNudge, setShowFollowUpNudge] = useState(false);
    const [nudgeFollowUpDate, setNudgeFollowUpDate] = useState('');
    
    // Calendar State
    const [isCalendarModalOpen, setIsCalendarModalOpen] = useState(false);
    const [isCalendarUpdate, setIsCalendarUpdate] = useState(false);
    const [calendarDirty, setCalendarDirty] = useState(false);
    const [existingCalendarData, setExistingCalendarData] = useState<{ summary: string; location: string; description: string; date: string; attendees: string[] } | null>(null);
    
    // Team State
    const [availableTeamMusicians, setAvailableTeamMusicians] = useState<Musician[]>([]);
    const [loadingTeam, setLoadingTeam] = useState(false);
    const [savingTeam, setSavingTeam] = useState(false);
    const [syncingCalendar, setSyncingCalendar] = useState(false);
    const [teamVersion, setTeamVersion] = useState(0);
    
    // Business Contact Creation
    const [creatingBusinessContact, setCreatingBusinessContact] = useState(false);

    useEffect(() => {
        setClosingAmount(lead.fields.Closing_Amount?.toString() || '');
        setReferredTo(lead.fields.Referred_To || '');
        setCommissionAmount(lead.fields.Commission_Amount?.toString() || '');
        setCommissionIncludesVat(!!lead.fields.Commission_Includes_VAT);
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
        // Check if calendar details are different from saved lead
        if (lead.fields.Google_Event_ID) {
            const isDirty = 
                lead.fields.Name !== editData.Name || 
                lead.fields.Location !== editData.Location || 
                lead.fields.Event_Date !== editData.Event_Date;
            setCalendarDirty(isDirty);
        } else {
            setCalendarDirty(false);
        }
    }, [editData, lead.fields.Google_Event_ID, lead.fields.Name, lead.fields.Location, lead.fields.Event_Date]);

    useEffect(() => {
        fetchNotes();
        fetchFinances();
        fetchTasks();
        fetchAvailableTeamMusicians();
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

    const fetchAvailableTeamMusicians = async () => {
        setLoadingTeam(true);
        try {
            const data = await api.getMusicians();
            // Filter to include both POOL and REFERRER musicians
            setAvailableTeamMusicians(data.filter(m => (m.fields.Type === 'POOL' || m.fields.Type === 'REFERRER') && m.fields.Is_Active !== false));
        } catch (e) {
            console.error(e);
        } finally {
            setLoadingTeam(false);
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

    const submitNote = async (fuDate?: string) => {
        setSubmitting(true);
        try {
            let file_url: string | undefined;
            let file_name: string | undefined;

            // Upload file if attached
            if (attachedFile) {
                try {
                    const uploadData = await api.uploadFile(attachedFile.file);
                    file_url = uploadData.url;
                    file_name = uploadData.filename;
                } catch (err) {
                    console.error('File upload err:', err);
                    error('שגיאה בהעלאת הקובץ. אנא נסה שנית.');
                    setSubmitting(false);
                    return;
                }
            }

            const follow_up_date = fuDate || followUpDate || undefined;

            await api.createNote(lead.id, {
                content: noteText || `📎 ${attachedFile?.file.name || 'קובץ'}`,
                author: currentUserName,
                file_url,
                file_name,
                follow_up_date,
                follow_up_completed: follow_up_date ? false : undefined,
            });
            setNoteText('');
            setFollowUpDate('');
            removeFile();
            fetchNotes();
        } catch (e) {
            console.error(e);
        } finally {
            setSubmitting(false);
        }
    };

    const handleAddNote = async () => {
        if (!noteText.trim() && !attachedFile) return;
        
        // If no follow-up date set, show nudge modal
        if (!followUpDate) {
            setNudgeFollowUpDate('');
            setShowFollowUpNudge(true);
            return;
        }
        
        await submitNote();
    };

    const handleUpdateNote = async (noteId: string) => {
        if (!editingNoteText.trim()) return;
        setUpdatingNote(true);
        try {
            await api.updateNote(noteId, { content: editingNoteText });
            setEditingNoteId(null);
            setEditingNoteText('');
            fetchNotes();
        } catch (e) {
            console.error(e);
            error('שגיאה בעדכון ההערה');
        } finally {
            setUpdatingNote(false);
        }
    };

    const handleDeleteNote = async (noteId: string) => {
        const isConfirmed = await confirmToast({
            title: 'מחיקת עדכון',
            message: 'האם אתה בטוח שברצונך למחוק עדכון זה?',
            variant: 'danger',
            confirmLabel: 'מחק'
        });
        if (!isConfirmed) return;
        try {
            await api.deleteNote(noteId);
            setNotes(notes.filter(n => n.id !== noteId));
        } catch (e) {
            console.error(e);
            error('שגיאה במחיקת ההערה');
        }
    };

    const handleMarkFollowUpDone = async (noteId: string) => {
        if (!newSummary.trim()) {
            error('אנא הזן סיכום קצר');
            return;
        }
        setActionSubmitting(noteId);
        try {
            await api.updateNote(noteId, { follow_up_completed: true });
            await api.createNote(lead.id, {
                content: newSummary,
                author: currentUserName || 'מערכת (פולו-אפ)',
            });
            success('הפולו-אפ טופל בהצלחה');
            setActionNote(null);
            setNewSummary('');
            fetchNotes();
        } catch (err) {
            console.error(err);
            error('שגיאה בעדכון');
        } finally {
            setActionSubmitting(null);
        }
    };

    const handlePostponeFollowUp = async (noteId: string) => {
        if (!postponeDate) {
            error('אנא בחר תאריך חדש');
            return;
        }
        setActionSubmitting(noteId);
        try {
            await api.updateNote(noteId, { follow_up_date: postponeDate });
            success('הפולו-אפ נדחה בהצלחה');
            setActionNote(null);
            setPostponeDate('');
            fetchNotes();
        } catch (err) {
            console.error(err);
            error('שגיאה בדחיית הפולו-אפ');
        } finally {
            setActionSubmitting(null);
        }
    };

    const handleStatusChange = async (newStatus: string) => {
        const updateData: Partial<Lead['fields']> = { Status: newStatus };
        if (newStatus === 'Closed' && closingAmount) {
            updateData.Closing_Amount = parseFloat(closingAmount);
        }

        // When setting to Lost, check for linked incomplete tasks and prompt user
        if (newStatus === 'Lost') {
            const linkedIncompleteTasks = tasks.filter(t => !t.fields.Is_Completed);
            if (linkedIncompleteTasks.length > 0) {
                setTaskPrompt({ leadId: lead.id, newStatus, taskCount: linkedIncompleteTasks.length });
                return;
            }
        }

        await executeStatusChange(newStatus, updateData);
    };

    const executeStatusChange = async (newStatus: string, updateData: Partial<Lead['fields']>) => {
        await api.updateLead(lead.id, updateData);
        onStatusChange(lead.id, newStatus);
    };

    const handleTaskAction = async (action: 'complete' | 'delete' | 'ignore') => {
        if (!taskPrompt) return;
        const { newStatus } = taskPrompt;
        setTaskPrompt(null);
        
        try {
            if (action === 'complete') {
                await api.handleLeadTasks(lead.id, 'complete');
                setTasks(tasks.map(t => ({ ...t, fields: { ...t.fields, Is_Completed: true } })));
            } else if (action === 'delete') {
                await api.handleLeadTasks(lead.id, 'delete');
                setTasks(tasks.filter(t => t.fields.Is_Completed));
            }
            
            const updateData: Partial<Lead['fields']> = { Status: newStatus };
            if (newStatus === 'Closed' && closingAmount) {
                updateData.Closing_Amount = parseFloat(closingAmount);
            }
            await executeStatusChange(newStatus, updateData);
        } catch (e) {
            console.error(e);
            error('שגיאה בעדכון המשימות או הסטטוס');
        }
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
            error('שגיאה ביצירת המשימה');
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
        const isConfirmed = await confirmToast({
            title: 'מחיקת משימה',
            message: 'למחוק את המשימה?',
            variant: 'danger',
            confirmLabel: 'מחק'
        });
        if (!isConfirmed) return;
        try {
            await api.deleteTask(id);
            setTasks(tasks.filter(t => t.id !== id));
        } catch (e) {
            console.error(e);
            error('שגיאה במחיקת המשימה');
        }
    };

    const handleSaveFinance = async () => {
        if (!financeAmount || !financeDesc || !financeOwner) return;
        setFinanceSubmitting(true);
        try {
            if (financeEditId) {
                await api.updateFinanceEntry(financeEditId, {
                    Owner: financeOwner,
                    Type: financeType,
                    Description: financeDesc,
                    Amount: parseFloat(financeAmount),
                    Payment_Method: financePaymentMethod,
                });
            } else {
                await api.createFinanceEntry({
                    Owner: financeOwner,
                    Type: financeType,
                    Date: new Date().toISOString().split('T')[0],
                    Description: financeDesc,
                    Event_Name: financeDesc,
                    Amount: parseFloat(financeAmount),
                    Payment_Status: 'שולם',
                    Payment_Method: financePaymentMethod,
                    Lead_ID: lead.id
                });
            }
            setFinanceAmount('');
            setFinanceDesc('');
            setFinanceOwner('');
            setFinanceEditId(null);
            setFinanceModalOpen(false);
            fetchFinances(); // Refresh the list
        } catch (e) {
            console.error(e);
            error('שגיאה בשמירת התנועה');
        } finally {
            setFinanceSubmitting(false);
        }
    };

    const handleCalendarConfirm = async (payload: CalendarEventPayload) => {
        try {
            if (isCalendarUpdate) {
                await api.updateCalendarEvent(lead.id, payload);
                success('האירוע עודכן בהצלחה ביומן');
            } else {
                const res = await api.createCalendarEvent(lead.id, payload);
                if (res && res.event_id) {
                    // Update local state for immediate UI reflect
                    Object.assign(lead.fields, { Google_Event_ID: res.event_id });
                    success('האירוע נוצר בהצלחה ביומן');
                }
            }
            onStatusChange(lead.id, lead.fields.Status);
            setIsCalendarModalOpen(false);
        } catch (e) {
            console.error(e);
            error(e instanceof Error ? e.message : 'שגיאה בסנכרון היומן');
        }
    };

    const handleSyncMusicians = async () => {
        if (!lead.fields.Google_Event_ID) return;
        setSyncingCalendar(true);
        try {
            await api.updateCalendarEvent(lead.id, {});
            // After updating the calendar, immediately sync RSVP statuses
            try {
                const rsvpResult = await api.syncLeadRsvps(lead.id);
                console.log('RSVP sync result:', JSON.stringify(rsvpResult, null, 2));
                if (rsvpResult.rsvps && Object.keys(rsvpResult.rsvps).length > 0) {
                    Object.assign(lead.fields, { Musician_RSVPs: rsvpResult.rsvps });
                }
            } catch (rsvpErr) {
                console.warn('RSVP sync failed:', rsvpErr);
            }
            success('הנגנים סונכרנו בהצלחה ליומן');
        } catch (e) {
            console.error(e);
            error('שגיאה בסנכרון הנגנים ליומן');
        } finally {
            setSyncingCalendar(false);
        }
    };

    const handleDeleteCalendarEvent = async () => {
        const isConfirmed = await confirmToast({
            title: 'מחיקת אירוע ביומן',
            message: 'האם אתה בטוח שברצונך למחוק את האירוע מהיומן?',
            variant: 'danger',
            confirmLabel: 'מחק מהיומן'
        });
        if (!isConfirmed) return;
        try {
            await api.deleteCalendarEvent(lead.id);
            // Update local state for immediate UI reflect
            Object.assign(lead.fields, { Google_Event_ID: undefined });
            success('האירוע נמחק מהיומן');
            onStatusChange(lead.id, lead.fields.Status);
        } catch (e) {
            console.error(e);
            error('שגיאה במחיקת האירוע מהיומן');
        }
    };

    const handleDeleteLead = async () => {
        const isConfirmed = await confirmToast({
            title: 'מחיקת ליד',
            message: 'האם אתה בטוח שברצונך למחוק ליד זה מהמערכת?',
            variant: 'danger',
            confirmLabel: 'המשך'
        });
        if (!isConfirmed) return;
        
        const isDoubleConfirmed = await confirmToast({
            title: 'אזהרה',
            message: 'שים לב: מחיקת הליד היא פעולה סופית ולא ניתן יהיה לשחזר את המידע. האם אתה בטוח לחלוטין?',
            variant: 'danger',
            confirmLabel: 'מחק לתמיד'
        });
        if (!isDoubleConfirmed) return;

        const hasCalendar = !!lead.fields.Google_Event_ID;
        let deleteCalendar = false;

        if (hasCalendar) {
            deleteCalendar = await confirmToast({
                title: 'אירוע מקושר ביומן',
                message: 'ליד זה מקושר לאירוע ביומן. האם למחוק גם את האירוע מהיומן של גוגל?',
                variant: 'danger',
                confirmLabel: 'מחק גם מהיומן',
                cancelLabel: 'מחק ליד בלבד'
            });
        }

        try {
            await api.deleteLead(lead.id, deleteCalendar);
            success('הליד נמחק בהצלחה');
            onClose();
            onStatusChange('', ''); // Reload the whole list
        } catch (e) {
            console.error(e);
            error('שגיאה במחיקת הליד');
        }
    };

    const handleDeleteFinance = async (id: string) => {
        const isConfirmed = await confirmToast({
            title: 'מחיקת תנועה',
            message: 'למחוק תנועה זו?',
            variant: 'danger',
            confirmLabel: 'מחק'
        });
        if (!isConfirmed) return;
        try {
            await api.deleteFinanceEntry(id);
            fetchFinances();
        } catch (e) {
            console.error(e);
            error('שגיאה במחיקת התנועה');
        }
    };
    
    const openFinanceModal = (type: 'income' | 'expense') => {
        setFinanceType(type);
        setFinanceAmount('');
        setFinanceDesc('');
        setFinanceOwner(currentUserName);
        setFinanceEditId(null);
        setFinancePaymentMethod('חשבון');
        setFinanceModalOpen(true);
    };

    const handleEditFinance = (entry: FinanceEntry) => {
        setFinanceType(entry.fields.Type);
        setFinanceAmount(entry.fields.Amount.toString());
        setFinanceDesc(entry.fields.Description);
        setFinanceOwner(entry.fields.Owner || currentUserName);
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
            success('הפרטים עודכנו בהצלחה');
        } catch (e) {
            console.error(e);
            error('עדכון הפרטים נכשל');
        } finally {
            setSavingInfo(false);
        }
    };

    const handleCreateBusinessContact = async () => {
        setCreatingBusinessContact(true);
        try {
            await api.createBusinessContactFromLead(lead.id);
            success('איש קשר עסקי נוצר בהצלחה מתוך הליד!');
        } catch (e) {
            console.error('Failed to create business contact:', e);
            error('שגיאה ביצירת איש קשר עסקי מהליד');
        } finally {
            setCreatingBusinessContact(false);
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
        { key: 'team' as const, label: 'צוות', count: lead.fields.Musician_Team?.length || 0 },
        { key: 'info' as const, label: 'פרטים' },
    ];

    return (
        <div className="fixed inset-0 z-50 flex items-stretch md:items-center justify-end bg-black/30 backdrop-blur-sm" dir="rtl" onClick={onClose}>
            <TaskActionModal
                isOpen={taskPrompt !== null}
                taskCount={taskPrompt?.taskCount || 0}
                onClose={() => setTaskPrompt(null)}
                onAction={handleTaskAction}
            />

            {/* Follow-Up Nudge Modal */}
            {showFollowUpNudge && (
                <div
                    className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-[modal-backdrop-in_150ms_ease-out]"
                    onClick={() => setShowFollowUpNudge(false)}
                >
                    <div
                        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-[modal-slide-up_250ms_ease-out]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="px-6 pt-6 pb-3">
                            <h3 className="text-lg font-bold text-slate-800 mb-2 flex items-center gap-2">
                                <span className="text-2xl">⏰</span> מתי נזכיר לך?
                            </h3>
                            <p className="text-sm text-slate-600 leading-relaxed">
                                ממליצים מאוד להגדיר תאריך מעקב — ככה המערכת תשלח לך תזכורת אוטומטית בוואטסאפ ביום שתבחר, ולא תשכח לחזור ללקוח הזה!
                            </p>
                        </div>
                        <div className="px-6 pb-4">
                            <input
                                type="date"
                                value={nudgeFollowUpDate}
                                onChange={(e) => setNudgeFollowUpDate(e.target.value)}
                                min={new Date().toISOString().split('T')[0]}
                                className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-blue-400 outline-none transition-all"
                                autoFocus
                            />
                        </div>
                        <div className="flex items-center gap-3 px-6 pb-6">
                            <button
                                onClick={async () => {
                                    if (nudgeFollowUpDate) {
                                        setShowFollowUpNudge(false);
                                        await submitNote(nudgeFollowUpDate);
                                    }
                                }}
                                disabled={!nudgeFollowUpDate || submitting}
                                className="flex-1 py-2.5 font-bold rounded-xl transition-colors text-sm bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40"
                            >
                                {submitting ? '...שולח' : 'הוסף תאריך ושלח ✅'}
                            </button>
                            <button
                                onClick={async () => {
                                    setShowFollowUpNudge(false);
                                    await submitNote('');
                                }}
                                disabled={submitting}
                                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl transition-colors text-sm disabled:opacity-40"
                            >
                                שלח בלי תאריך
                            </button>
                        </div>
                    </div>
                </div>
            )}
            <div className="w-full md:w-[560px] h-full md:h-[90vh] bg-white md:rounded-r-2xl shadow-2xl flex flex-col relative" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                    <div>
                        <div className="flex items-center gap-2.5 flex-wrap">
                            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                {lead.fields.Name || lead.fields.Phone}
                                <button 
                                    onClick={() => setIsIntroModalOpen(true)}
                                    className="p-1 px-2 bg-green-50 text-green-700 text-[10px] font-bold rounded-lg border border-green-100 hover:bg-green-100 transition-all flex items-center gap-1.5"
                                    title="שלח חומרים בווטסאפ"
                                >
                                    <Send size={12} />
                                    שלח חומרים
                                </button>
                                <button 
                                    onClick={() => setIsProposalModalOpen(true)}
                                    className="p-1 px-2 bg-indigo-50 text-indigo-700 text-[10px] font-bold rounded-lg border border-indigo-100 hover:bg-indigo-100 transition-all flex items-center gap-1.5"
                                    title="הפקת הצעת מחיר אינטראקטיבית"
                                >
                                    <FileText size={12} />
                                    הצעת מחיר
                                </button>
                                <button 
                                    onClick={handleCreateBusinessContact}
                                    disabled={creatingBusinessContact}
                                    className="p-1 px-2 bg-blue-50 text-blue-700 text-[10px] font-bold rounded-lg border border-blue-100 hover:bg-blue-100 transition-all flex items-center gap-1.5 disabled:opacity-50"
                                    title="צור איש קשר עסקי מתוך ליד"
                                >
                                    <Briefcase size={12} />
                                    {creatingBusinessContact ? 'מייצר...' : 'שמור איש קשר'}
                                </button>
                            </h2>
                            {lead.fields.Event_Date && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 border border-blue-100 text-blue-700 text-sm font-bold rounded-lg">
                                    <Calendar size={14} className="text-blue-500" />
                                    {lead.fields.Event_Date}
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">{toDisplayPhone(lead.fields.Phone)} · {lead.fields.Service || '—'}</p>
                    </div>
                    <div className="flex items-center gap-2 relative">
                        <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg">
                            <X size={20} className="text-slate-500" />
                        </button>
                    </div>
                </div>

                {/* Scrollable Body */}
                <div className="flex-1 overflow-y-auto flex flex-col relative">
                
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
                                    onClick={async () => {
                                        const isConfirmed = await confirmToast({
                                            title: 'החזרה להפצה',
                                            message: 'להחזיר את הליד להפצה לכל הנגנים?',
                                            confirmLabel: 'החזר להפצה'
                                        });
                                        if (isConfirmed) {
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
                                onClick={async () => {
                                    const isConfirmed = await confirmToast({
                                        title: 'איפוס סטטוס ליד',
                                        message: 'לאפס את הליד לסטטוס "חדש"? זה ינקה את שיוך הנגן.',
                                        confirmLabel: 'איפוס'
                                    });
                                    if (isConfirmed) {
                                        api.updateLead(lead.id, { Status: 'New', Musician_Assigned: [] });
                                        onStatusChange(lead.id, 'New');
                                    }
                                }}
                                className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-50 text-blue-700 text-[11px] font-bold rounded-lg hover:bg-blue-100 transition-all"
                            >
                                <RotateCcw size={12} /> החזר לחדש
                            </button>
                            <button
                                onClick={async () => {
                                    const isConfirmed = await confirmToast({
                                        title: 'השתקת בוט',
                                        message: 'להשתיק את הבוט ל-24 שעות עבור ליד זה?',
                                        confirmLabel: 'השתק'
                                    });
                                    if (isConfirmed) {
                                        const muteUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
                                        api.updateLead(lead.id, { Bot_Mute_Until: muteUntil });
                                        success('הבוט הושתק ל-24 שעות עבור ליד זה.');
                                    }
                                }}
                                className="flex items-center gap-1 px-2.5 py-1.5 bg-amber-50 text-amber-700 text-[11px] font-bold rounded-lg hover:bg-amber-100 transition-all"
                            >
                                <BellOff size={12} /> השתק בוט 24ש׳
                            </button>
                            <button
                                onClick={async () => {
                                    const isUpdate = !!lead.fields.Google_Event_ID;
                                    setIsCalendarUpdate(isUpdate);
                                    if (isUpdate) {
                                        try {
                                            const eventData = await api.getCalendarEvent(lead.id);
                                            setExistingCalendarData(eventData);
                                        } catch (err) {
                                            console.warn('Could not fetch event data, using defaults:', err);
                                            setExistingCalendarData(null);
                                        }
                                    } else {
                                        setExistingCalendarData(null);
                                    }
                                    setIsCalendarModalOpen(true);
                                }}
                                className={clsx(
                                    "flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold rounded-lg transition-all border",
                                    lead.fields.Google_Event_ID 
                                        ? (calendarDirty ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-green-50 text-green-700 border-green-100")
                                        : "bg-purple-50 text-purple-700 hover:bg-purple-100 border-purple-100"
                                )}
                            >
                                <Calendar size={12} /> 
                                {lead.fields.Google_Event_ID 
                                    ? (calendarDirty ? 'עדכן יומן (שינוי זוהה)' : 'פתח אירוע ביומן') 
                                    : 'צור אירוע ביומן'}
                            </button>

                            {lead.fields.Google_Event_ID && (
                                <button
                                    onClick={handleDeleteCalendarEvent}
                                    className="flex items-center gap-1 px-2.5 py-1.5 bg-red-50 text-red-700 text-[11px] font-bold rounded-lg hover:bg-red-100 transition-all border border-red-100"
                                    title="מחק רק את האירוע ביומן"
                                >
                                    <Trash2 size={12} /> מחק מהיומן
                                </button>
                            )}

                            <div className="flex-1" />
                            
                            <button
                                onClick={handleDeleteLead}
                                className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 text-slate-500 text-[11px] font-bold rounded-lg hover:bg-red-600 hover:text-white transition-all ml-auto"
                            >
                                <Trash2 size={12} /> מחק ליד
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
                                    error('שגיאה בשמירת הסכום');
                                }
                            }}
                            className="text-[11px] font-bold bg-green-100 text-green-700 px-3 py-1.5 rounded-lg hover:bg-green-200 transition-colors shadow-sm"
                        >
                            שמור סכום
                        </button>
                    )}
                </div>

                {/* Referral Data (Only visible if status is Referred) */}
                {lead.fields.Status === 'Referred' && (
                    <div className="px-5 py-2.5 border-b border-slate-100 flex items-center justify-between gap-2 bg-teal-50/30">
                        <div className="flex items-center gap-4 flex-wrap">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-teal-700">הופנה ל:</span>
                                <input
                                    type="text"
                                    value={referredTo}
                                    onChange={(e) => setReferredTo(e.target.value)}
                                    className="px-2 py-1.5 border border-teal-200 rounded-lg text-sm w-40 focus:ring-2 focus:ring-teal-500 outline-none bg-white"
                                    placeholder="שם חברה/להקה..."
                                />
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-teal-700">עמלה:</span>
                                <div className="relative">
                                    <input
                                        type="number"
                                        value={commissionAmount}
                                        onChange={(e) => setCommissionAmount(e.target.value)}
                                        className="pl-6 pr-2 py-1.5 border border-teal-200 rounded-lg text-sm w-24 focus:ring-2 focus:ring-teal-500 outline-none bg-white"
                                        placeholder="0"
                                        dir="ltr"
                                    />
                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-teal-500">₪</span>
                                </div>
                                <label className="flex items-center gap-1.5 cursor-pointer mr-2">
                                    <input
                                        type="checkbox"
                                        checked={commissionIncludesVat}
                                        onChange={(e) => setCommissionIncludesVat(e.target.checked)}
                                        className="w-3.5 h-3.5 rounded border-teal-300 text-teal-600 focus:ring-teal-500"
                                    />
                                    <span className="text-xs text-teal-700">כולל מע"מ</span>
                                </label>
                            </div>
                        </div>
                        {(referredTo !== (lead.fields.Referred_To || '') || 
                          commissionAmount !== (lead.fields.Commission_Amount?.toString() || '') ||
                          commissionIncludesVat !== !!lead.fields.Commission_Includes_VAT) && (
                            <button
                                onClick={async () => {
                                    try {
                                        const updateData: any = { 
                                            Referred_To: referredTo,
                                            Commission_Includes_VAT: commissionIncludesVat 
                                        };
                                        if (commissionAmount) updateData.Commission_Amount = parseFloat(commissionAmount);
                                        await api.updateLead(lead.id, updateData);
                                        Object.assign(lead.fields, updateData);
                                        // Trick to re-evaluate conditions
                                        setReferredTo(updateData.Referred_To || '');
                                        setCommissionAmount(updateData.Commission_Amount?.toString() || '');
                                        setCommissionIncludesVat(!!updateData.Commission_Includes_VAT);
                                    } catch (e) {
                                        console.error(e);
                                        error('שגיאה בשמירת נתוני ההפניה');
                                    }
                                }}
                                className="text-[11px] font-bold bg-teal-600 text-white px-3 py-1.5 rounded-lg hover:bg-teal-700 transition-colors shadow-sm whitespace-nowrap"
                            >
                                שמור פרטים
                            </button>
                        )}
                    </div>
                )}

                {/* Tabs */}
                <div className="flex border-b border-slate-200 sticky top-0 z-20 bg-white/95 backdrop-blur-sm shadow-sm overflow-x-auto no-scrollbar shrink-0">
                    {tabs.map(t => (
                        <button
                            key={t.key}
                            onClick={() => setTab(t.key)}
                            className={clsx(
                                "flex-1 min-w-[80px] py-3 text-sm font-bold transition-all border-b-2 whitespace-nowrap",
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
                <div className="flex flex-col">
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
                                    <div className="flex items-center gap-1">
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
                                        {(() => {
                                            const openFollowUp = notes.find(n => n.fields.Follow_Up_Date && !n.fields.Follow_Up_Completed);
                                            
                                            if (openFollowUp) {
                                                return (
                                                    <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 px-2 py-1.5 rounded-lg text-[10px] font-bold text-orange-700">
                                                        <span>⚠️ יש פולו-אפ פתוח</span>
                                                        <div className="flex gap-1.5 mr-1">
                                                            <button 
                                                                onClick={(e) => {
                                                                    e.preventDefault();
                                                                    setActionNote({ noteId: openFollowUp.id, action: 'done' });
                                                                    setTimeout(() => document.getElementById(`note-${openFollowUp.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
                                                                }}
                                                                className="bg-green-600 hover:bg-green-700 text-white px-2 py-0.5 rounded transition-colors"
                                                            >
                                                                סגור
                                                            </button>
                                                            <button 
                                                                onClick={(e) => {
                                                                    e.preventDefault();
                                                                    setActionNote({ noteId: openFollowUp.id, action: 'postpone' });
                                                                    setTimeout(() => document.getElementById(`note-${openFollowUp.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
                                                                }}
                                                                className="bg-white hover:bg-slate-50 border border-orange-200 text-slate-700 px-2 py-0.5 rounded transition-colors"
                                                            >
                                                                דחה
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            }

                                            return (
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        onClick={() => {
                                                            const dateInput = document.getElementById('follow-up-date-input') as HTMLInputElement;
                                                            if (dateInput) {
                                                                dateInput.showPicker?.();
                                                                dateInput.focus();
                                                            }
                                                        }}
                                                        className={clsx(
                                                            "p-1.5 rounded-lg transition-colors",
                                                            followUpDate 
                                                                ? "text-blue-500 bg-blue-50 hover:bg-blue-100" 
                                                                : "text-slate-400 hover:text-blue-500 hover:bg-slate-100"
                                                        )}
                                                        title={followUpDate ? `תזכורת: ${followUpDate}` : "הוסף תאריך פולו-אפ"}
                                                    >
                                                        <Bell size={16} />
                                                    </button>
                                                    <input
                                                        id="follow-up-date-input"
                                                        type="date"
                                                        value={followUpDate}
                                                        onChange={(e) => setFollowUpDate(e.target.value)}
                                                        min={new Date().toISOString().split('T')[0]}
                                                        className={clsx(
                                                            "text-[10px] font-medium border rounded-lg px-1.5 py-1 focus:ring-1 focus:ring-blue-400 outline-none transition-all w-[105px]",
                                                            followUpDate 
                                                                ? "border-blue-200 bg-blue-50 text-blue-700" 
                                                                : "border-slate-200 text-slate-400"
                                                        )}
                                                    />
                                                    {followUpDate && (
                                                        <button 
                                                            onClick={() => setFollowUpDate('')} 
                                                            className="text-slate-300 hover:text-red-400 transition-colors"
                                                        >
                                                            <X size={12} />
                                                        </button>
                                                    )}
                                                </div>
                                            );
                                        })()}
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
                                    <div key={note.id} id={`note-${note.id}`} className="group bg-white border border-slate-100 rounded-xl p-4 shadow-sm relative hover:border-slate-200 transition-all">
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                                <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-blue-400 to-blue-600 flex items-center justify-center text-white text-[10px] font-bold">
                                                    {note.fields.Author?.substring(0, 1)}
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-bold text-slate-700">{note.fields.Author}</span>
                                                    <span className="text-[9px] text-slate-400 flex items-center gap-1">
                                                        <Clock size={8} /> {formatDate(note.fields.Created_At)}
                                                    </span>
                                                    {note.fields.Follow_Up_Date && (() => {
                                                        const fuParts = note.fields.Follow_Up_Date.split('-');
                                                        const fuDisplay = fuParts.length === 3 ? `${fuParts[2]}.${fuParts[1]}` : note.fields.Follow_Up_Date;
                                                        const isPast = new Date(note.fields.Follow_Up_Date) < new Date(new Date().toDateString());
                                                        return (
                                                            <span className={clsx(
                                                                "inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full mt-1",
                                                                note.fields.Follow_Up_Completed 
                                                                    ? "bg-green-50 text-green-600 border border-green-100"
                                                                    : isPast 
                                                                        ? "bg-red-50 text-red-500 border border-red-100" 
                                                                        : "bg-blue-50 text-blue-600 border border-blue-100"
                                                            )}>
                                                                {note.fields.Follow_Up_Completed ? '✅' : (isPast ? '⏰' : '🔔')} 
                                                                {note.fields.Follow_Up_Completed ? ' ' : ' '}
                                                                {fuDisplay}
                                                                {!note.fields.Follow_Up_Completed && isPast ? ' (פג)' : ''}
                                                                {note.fields.Follow_Up_Completed ? ' (טופל)' : ''}
                                                            </span>
                                                        );
                                                    })()}
                                                </div>
                                            </div>
                                            
                                            {/* Action Buttons (Visible on hover) */}
                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button 
                                                    onClick={() => {
                                                        setEditingNoteId(note.id);
                                                        setEditingNoteText(note.fields.Content);
                                                    }}
                                                    className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-all"
                                                    title="ערוך"
                                                >
                                                    <Pencil size={12} />
                                                </button>
                                                <button 
                                                    onClick={() => handleDeleteNote(note.id)}
                                                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                                    title="מחק"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                        </div>

                                        {editingNoteId === note.id ? (
                                            <div className="mt-2 space-y-2">
                                                <textarea 
                                                    value={editingNoteText}
                                                    onChange={(e) => setEditingNoteText(e.target.value)}
                                                    className="w-full text-sm p-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none h-20"
                                                    autoFocus
                                                />
                                                <div className="flex justify-end gap-2">
                                                    <button 
                                                        onClick={() => setEditingNoteId(null)}
                                                        className="px-3 py-1 text-[11px] font-bold text-slate-500 hover:bg-slate-100 rounded-lg transition-all"
                                                    >
                                                        ביטול
                                                    </button>
                                                    <button 
                                                        onClick={() => handleUpdateNote(note.id)}
                                                        disabled={updatingNote || !editingNoteText.trim()}
                                                        className="px-3 py-1 text-[11px] font-bold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-all flex items-center gap-1.5"
                                                    >
                                                        {updatingNote ? <RefreshCw size={10} className="animate-spin" /> : <Save size={10} />}
                                                        שמור
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <>
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
                                            </>
                                        )}

                                        {/* Pending Follow Up Actions */}
                                        {note.fields.Follow_Up_Date && !note.fields.Follow_Up_Completed && (
                                            <div className="mt-4 pt-3 border-t border-slate-100">
                                                {actionNote?.noteId !== note.id && (
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => setActionNote({ noteId: note.id, action: 'done' })}
                                                            className="flex-1 bg-green-600 hover:bg-green-700 text-white text-xs py-2 rounded-lg font-bold transition-colors flex items-center justify-center gap-1"
                                                        >
                                                            <CheckCircle size={14} /> טופל
                                                        </button>
                                                        <button
                                                            onClick={() => setActionNote({ noteId: note.id, action: 'postpone' })}
                                                            className="flex-1 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs py-2 rounded-lg font-bold transition-colors flex items-center justify-center gap-1"
                                                        >
                                                            <Calendar size={14} /> דחה פולו-אפ
                                                        </button>
                                                    </div>
                                                )}
                                                
                                                {actionNote?.noteId === note.id && actionNote.action === 'done' && (
                                                    <div className="bg-white p-3 rounded-lg border border-green-200 animate-in slide-in-from-top-2">
                                                        <label className="block text-xs font-bold text-slate-700 mb-1">סיכום טיפול / שיחה:</label>
                                                        <textarea 
                                                            className="w-full border border-slate-200 rounded-lg p-2 text-xs focus:ring-2 focus:ring-green-500 outline-none mb-2 resize-none"
                                                            rows={3}
                                                            value={newSummary}
                                                            onChange={e => setNewSummary(e.target.value)}
                                                            placeholder="מה קרה בפולו-אפ?"
                                                        />
                                                        <div className="flex gap-2">
                                                            <button 
                                                                onClick={() => handleMarkFollowUpDone(note.id)}
                                                                disabled={actionSubmitting === note.id}
                                                                className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex-1"
                                                            >
                                                                {actionSubmitting === note.id ? 'שומר...' : 'שמור סיכום וסגור'}
                                                            </button>
                                                            <button 
                                                                onClick={() => { setActionNote(null); setNewSummary(''); }}
                                                                className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
                                                            >
                                                                ביטול
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}

                                                {actionNote?.noteId === note.id && actionNote.action === 'postpone' && (
                                                    <div className="bg-white p-3 rounded-lg border border-blue-200 animate-in slide-in-from-top-2">
                                                        <label className="block text-xs font-bold text-slate-700 mb-1">תאריך פולו-אפ חדש:</label>
                                                        <input 
                                                            type="date"
                                                            className="w-full border border-slate-200 rounded-lg p-2 text-xs focus:ring-2 focus:ring-blue-500 outline-none mb-2"
                                                            value={postponeDate}
                                                            min={new Date().toISOString().split('T')[0]}
                                                            onChange={e => setPostponeDate(e.target.value)}
                                                        />
                                                        <div className="flex gap-2">
                                                            <button 
                                                                onClick={() => handlePostponeFollowUp(note.id)}
                                                                disabled={actionSubmitting === note.id}
                                                                className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex-1"
                                                            >
                                                                {actionSubmitting === note.id ? 'שומר...' : 'שמור תאריך'}
                                                            </button>
                                                            <button 
                                                                onClick={() => { setActionNote(null); setPostponeDate(''); }}
                                                                className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
                                                            >
                                                                ביטול
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {tab === 'finance' && (
                        <div className="flex flex-col bg-slate-50">
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
                            <div>
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
                                                    <div className="flex items-center gap-1.5 overflow-hidden">
                                                        <span className="text-[9px] text-slate-400 whitespace-nowrap">{entry.fields.Payment_Method}</span>
                                                        <span className="text-[9px] text-slate-300">•</span>
                                                        <span className={`text-[9px] font-bold ${entry.fields.Owner === 'אילן' ? 'text-blue-600' : 'text-purple-600'}`}>{entry.fields.Owner}</span>
                                                    </div>
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
                            <div className="p-4 bg-white border-t border-slate-200 shadow-[0_-4px_6px_-1px_rgb(0,0,0,0.05)] sticky bottom-0 z-10 mt-auto">
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
                                        type="tel"
                                        value={toDisplayPhone(editData.Phone)}
                                        onChange={(e) => setEditData({ ...editData, Phone: toDbPhone(e.target.value) })}
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                        dir="ltr"
                                    />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="text-[10px] font-bold text-slate-500 mr-1">שירות</label>
                                    <select
                                        value={editData.Service || ''}
                                        onChange={(e) => setEditData({ ...editData, Service: e.target.value })}
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none appearance-none"
                                    >
                                        <option value="">בחר שירות...</option>
                                        <option value="Bouzouki">נגן בוזוקי 🎸</option>
                                        <option value="Reception">קבלת פנים 🎻</option>
                                        <option value="Band">להקה 🥁</option>
                                        <option value="DJ">דיג&apos;יי 🎧</option>
                                        <option value="Talk">לדבר עם מישהו 📞</option>
                                        <option value="Other">אחר ✨</option>
                                    </select>
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="text-[10px] font-bold text-slate-500 mr-1">תאריך אירוע</label>
                                    <input
                                        type="date"
                                        value={formatDateForInput(editData.Event_Date)}
                                        onChange={(e) => setEditData({ ...editData, Event_Date: formatInputDateToDisplay(e.target.value) })}
                                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                        dir="ltr"
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

                    {tab === 'team' && (
                        <div className="flex flex-col bg-slate-50">
                            {/* Selector Header */}
                            <div className="p-4 bg-white border-b border-slate-200">
                                <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-wider">הוסף נגן לצוות (ממאגר הנגנים וההפניות)</label>
                                <div className="flex gap-2">
                                    <div className="flex-1 relative">
                                        <select 
                                            className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-purple-500 appearance-none transition-all"
                                            onChange={async (e) => {
                                                const mId = e.target.value;
                                                if (!mId) return;
                                                
                                                const currentTeam = lead.fields.Musician_Team || [];
                                                if (currentTeam.includes(mId)) return;
                                                
                                                setSavingTeam(true);
                                                try {
                                                    const newTeam = [...currentTeam, mId];
                                                    await api.updateLead(lead.id, { Musician_Team: newTeam });
                                                    // Update locally
                                                    Object.assign(lead.fields, { Musician_Team: newTeam });
                                                    setTeamVersion(v => v + 1);
                                                    
                                                    e.target.value = ''; // Reset select
                                                } catch (err) {
                                                    console.error(err);
                                                    error('שגיאה בעדכון הצוות');
                                                } finally {
                                                    setSavingTeam(false);
                                                }
                                            }}
                                            disabled={savingTeam}
                                        >
                                            <option value="">בחר נגן להוספה...</option>
                                            {availableTeamMusicians
                                                .filter(m => !(lead.fields.Musician_Team || []).includes(m.id))
                                                .map(m => (
                                                    <option key={m.id} value={m.id}>{m.fields.Name} ({m.fields.Phone})</option>
                                                ))
                                            }
                                        </select>
                                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                                            <RefreshCw size={14} className={savingTeam ? 'animate-spin' : ''} />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Assigned Team List */}
                            <div className="p-4">
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                                        <Wrench size={14} className="text-purple-600" /> צוות משובץ לאירוע
                                    </h3>
                                    <span className="text-[10px] font-bold text-slate-400">
                                        {(lead.fields.Musician_Team || []).length} נגנים
                                    </span>
                                </div>

                                {loadingTeam ? (
                                    <div className="text-center py-8">
                                        <RefreshCw size={18} className="text-slate-300 animate-spin mx-auto mb-2" />
                                        <p className="text-xs text-slate-400">טוען...</p>
                                    </div>
                                ) : (lead.fields.Musician_Team || []).length === 0 ? (
                                    <div className="text-center py-8 text-slate-300">
                                        <p className="text-xs">לא שובץ צוות לאירוע זה</p>
                                    </div>
                                ) : (
                                    <div className="border border-slate-200 rounded-lg overflow-hidden">
                                        {(lead.fields.Musician_Team || []).map((mId, idx) => {
                                            const m = availableTeamMusicians.find(pm => pm.id === mId) || { fields: { Name: 'טוען...', Phone: '' } };
                                            const rsvps = lead.fields.Musician_RSVPs || {};
                                            const status = rsvps[mId];
                                            return (
                                                <div key={mId} className={`flex items-center justify-between px-3 py-2.5 hover:bg-slate-50 transition-colors ${idx > 0 ? 'border-t border-slate-100' : ''}`}>
                                                    {/* Right side: Name + Phone */}
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <span className="text-sm font-bold text-slate-800 truncate">{m.fields.Name}</span>
                                                        <span className="text-[10px] text-slate-400 font-mono whitespace-nowrap">{m.fields.Phone}</span>
                                                    </div>

                                                    {/* Left side: RSVP + Delete */}
                                                    <div className="flex items-center gap-3 shrink-0">
                                                        {status === 'accepted' && (
                                                            <span className="text-green-600 flex items-center gap-1 text-xs font-bold"><Check size={14} strokeWidth={3}/></span>
                                                        )}
                                                        {status === 'declined' && (
                                                            <span className="text-red-500 flex items-center gap-1 text-xs font-bold"><X size={14} strokeWidth={3}/></span>
                                                        )}
                                                        {status === 'tentative' && (
                                                            <span className="text-yellow-500 flex items-center gap-1 text-xs font-bold">~</span>
                                                        )}
                                                        {status === 'needsAction' && (
                                                            <span className="text-slate-300"><Clock size={13}/></span>
                                                        )}
                                                        {!status && lead.fields.Google_Event_ID && (
                                                            <span className="text-slate-200"><Clock size={13}/></span>
                                                        )}
                                                        <button
                                                            onClick={async () => {
                                                                const isConfirmed = await confirmToast({
                                                                    title: 'הסרת נגן',
                                                                    message: `להסיר את ${m.fields.Name} מהצוות?`,
                                                                    variant: 'danger',
                                                                    confirmLabel: 'הסר'
                                                                });
                                                                if (!isConfirmed) return;
                                                                setSavingTeam(true);
                                                                try {
                                                                    const newTeam = (lead.fields.Musician_Team || []).filter(id => id !== mId);
                                                                    await api.updateLead(lead.id, { Musician_Team: newTeam });
                                                                    Object.assign(lead.fields, { Musician_Team: newTeam });
                                                                    setTeamVersion(v => v + 1);
                                                                } catch (err) {
                                                                    console.error(err);
                                                                    error('שגיאה בעדכון הצוות');
                                                                } finally {
                                                                    setSavingTeam(false);
                                                                }
                                                            }}
                                                            disabled={savingTeam}
                                                            className="text-slate-300 hover:text-red-500 transition-colors"
                                                        >
                                                            <Trash2 size={13} />
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                            
                            {/* Calendar Sync Action */}
                            {lead.fields.Google_Event_ID && (
                                <div className="p-4 mt-auto border-t border-slate-200 bg-white space-y-2">
                                    <div className="flex gap-2">
                                        <button
                                            onClick={handleSyncMusicians}
                                            disabled={syncingCalendar}
                                            className="flex-1 py-2.5 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                                        >
                                            {syncingCalendar ? <RefreshCw className="animate-spin" size={13} /> : <Calendar size={13} />}
                                            עדכן נגנים ביומן
                                        </button>
                                        <button
                                            onClick={async () => {
                                                setSyncingCalendar(true);
                                                try {
                                                    const result = await api.syncLeadRsvps(lead.id);
                                                    console.log('RSVP refresh result:', result);
                                                    if (result.rsvps && Object.keys(result.rsvps).length > 0) {
                                                        Object.assign(lead.fields, { Musician_RSVPs: result.rsvps });
                                                    }
                                                } catch (err) {
                                                    console.error('RSVP refresh error:', err);
                                                } finally {
                                                    setSyncingCalendar(false);
                                                }
                                            }}
                                            disabled={syncingCalendar}
                                            className="py-2.5 px-3 border border-slate-200 text-slate-500 text-xs font-bold rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-all flex items-center gap-1"
                                            title="רענן סטטוס אישורים"
                                        >
                                            <RefreshCw size={13} className={syncingCalendar ? 'animate-spin' : ''} />
                                        </button>
                                    </div>
                                    <p className="text-[10px] text-slate-400 text-center font-medium">
                                        שלח זימונים או רענן סטטוס אישורי נגנים
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {tab === 'tasks' && (
                        <div className="flex flex-col bg-slate-50">
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
                                                type="date"
                                                value={formatDateForInput(newTaskDueDate)}
                                                onChange={(e) => setNewTaskDueDate(formatInputDateToDisplay(e.target.value))}
                                                className="w-full bg-transparent text-xs outline-none placeholder:text-slate-400"
                                                dir="ltr"
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
                            <div className="p-4">
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
                                    onChange={(e) => setFinancePaymentMethod(e.target.value as 'חשבון' | 'מזומן')}
                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none appearance-none"
                                >
                                    <option value="חשבון">העברה / אשראי / ביט</option>
                                    <option value="מזומן">מזומן</option>
                                </select>
                                <div className="pt-1">
                                    <label className="block text-[10px] font-bold text-slate-500 mb-1.5">שיוך לשותף (לאיזה יומן?)</label>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setFinanceOwner('אילן')}
                                            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all border ${
                                                financeOwner === 'אילן'
                                                    ? 'bg-blue-100 text-blue-700 border-blue-400 ring-2 ring-blue-200'
                                                    : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                                            }`}
                                        >
                                            אילן
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setFinanceOwner('קובי')}
                                            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all border ${
                                                financeOwner === 'קובי'
                                                    ? 'bg-purple-100 text-purple-700 border-purple-400 ring-2 ring-purple-200'
                                                    : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                                            }`}
                                        >
                                            קובי
                                        </button>
                                    </div>
                                </div>
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
                                    disabled={financeSubmitting || !financeAmount || !financeDesc || !financeOwner}
                                    className="px-6 py-2 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-all shadow-sm"
                                >
                                    {financeSubmitting ? 'שומר...' : 'שמור'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Intro/Materials Modal */}
                <SendMaterialsModal 
                    isOpen={isIntroModalOpen}
                    onClose={() => setIsIntroModalOpen(false)}
                    leadId={lead.id}
                    initialName={lead.fields.Name || ''}
                />
                
                {/* Proposal Modal */}
                <ProposalModal 
                    isOpen={isProposalModalOpen}
                    onClose={() => setIsProposalModalOpen(false)}
                    leadId={lead.id}
                    initialData={{
                        name: lead.fields.Name || lead.fields.Phone,
                        service: lead.fields.Service || '',
                        date: lead.fields.Event_Date || '',
                        location: lead.fields.Location || '',
                        amount: lead.fields.Closing_Amount || 0,
                        quote_data: (lead.fields as any).Quote_Data
                    }}
                    onSave={(quoteData) => {
                        Object.assign(lead.fields, { Quote_Data: quoteData });
                    }}
                />

                <CalendarEventModal 
                    isOpen={isCalendarModalOpen}
                    onClose={() => setIsCalendarModalOpen(false)}
                    onConfirm={handleCalendarConfirm}
                    leadName={lead.fields.Name || lead.fields.Phone}
                    initialLocation={lead.fields.Location || ''}
                    initialDate={lead.fields.Event_Date || ''}
                    teamEmails={(availableTeamMusicians.filter(m => (lead.fields.Musician_Team || []).includes(m.id)).map(m => m.fields.Email)).filter((e): e is string => !!e)}
                    isUpdate={isCalendarUpdate}
                    existingEventData={existingCalendarData}
                />

            </div>
        </div>
    );
}
