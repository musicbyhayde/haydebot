'use client';

import { useState, useEffect } from 'react';
import { BusinessContact } from '@/types';
import { api } from '@/lib/api';
import { AppUser } from '@/lib/auth';
import {
    Plus, Trash2, Edit, Check, X, Menu,
    Briefcase, Phone, User, Building, AlignLeft
} from 'lucide-react';
import clsx from 'clsx';
import { toDisplayPhone, toDbPhone } from '@/lib/formatters';
import { useToast } from '@/components/ui';

interface BusinessContactsPageProps {
    currentUser?: AppUser | null;
    onMenuClick?: () => void;
}

export default function BusinessContactsPage({ onMenuClick }: BusinessContactsPageProps) {
    const { error, confirm } = useToast();
    const [contacts, setContacts] = useState<BusinessContact[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddForm, setShowAddForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<Partial<BusinessContact['fields']>>({});

    // Add form
    const [form, setForm] = useState({
        Name: '',
        Phone: '',
        Role: '',
        Company: '',
        Summary: '',
    });

    useEffect(() => {
        fetchContacts();
    }, []);

    const fetchContacts = async () => {
        try {
            const data = await api.getBusinessContacts();
            setContacts(data);
        } catch (e) {
            console.error('Failed to fetch business contacts:', e);
        } finally {
            setLoading(false);
        }
    };

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.Name.trim() || !form.Phone.trim()) return;
        try {
            const created = await api.createBusinessContact(form);
            setContacts([created, ...contacts]);
            setForm({ Name: '', Phone: '', Role: '', Company: '', Summary: '' });
            setShowAddForm(false);
        } catch (e) {
            console.error('Failed to create contact:', e);
            error('שגיאה ביצירת איש קשר');
        }
    };

    const startEdit = (c: BusinessContact) => {
        setEditingId(c.id);
        setEditForm({
            Name: c.fields.Name,
            Phone: c.fields.Phone,
            Role: c.fields.Role || '',
            Company: c.fields.Company || '',
            Summary: c.fields.Summary || '',
        });
    };

    const saveEdit = async (id: string) => {
        try {
            const updated = await api.updateBusinessContact(id, editForm);
            setContacts(contacts.map(c => c.id === id ? updated : c));
            setEditingId(null);
        } catch (e) {
            console.error('Failed to update contact:', e);
            error('שגיאה בעדכון איש קשר');
        }
    };

    const handleDelete = async (id: string) => {
        const isConfirmed = await confirm({
            title: 'מחיקת איש קשר עסקי',
            message: 'למחוק את איש הקשר?',
            variant: 'danger',
            confirmLabel: 'מחק'
        });
        if (!isConfirmed) return;
        try {
            await api.deleteBusinessContact(id);
            setContacts(contacts.filter(c => c.id !== id));
        } catch (e) {
            console.error('Failed to delete contact:', e);
            error('שגיאה במחיקת איש קשר');
        }
    };

    if (loading) {
        return <div className="flex-1 flex items-center justify-center text-slate-400 font-bold">טוען אנשי קשר... 🤝</div>;
    }

    return (
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50" dir="rtl">
            {/* Header */}
            <div className="px-4 md:px-6 py-4 border-b border-slate-200 bg-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                    {onMenuClick && (
                        <button onClick={onMenuClick} className="md:hidden p-2 hover:bg-slate-100 rounded-lg">
                            <Menu size={20} />
                        </button>
                    )}
                    <div>
                        <h1 className="text-xl md:text-2xl font-extrabold text-slate-800 flex items-center gap-2">
                            <Briefcase className="text-blue-600" /> אנשי קשר עסקיים
                        </h1>
                        <p className="text-xs text-slate-500">
                            מפיקים ואנשי תרבות ({contacts.length})
                        </p>
                    </div>
                </div>
                <button
                    onClick={() => setShowAddForm(!showAddForm)}
                    className="flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 transition-all shadow-md shadow-blue-200"
                >
                    <Plus size={16} /> הוסף איש קשר
                </button>
            </div>

            {/* Add Form Modal */}
            {showAddForm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowAddForm(false)}>
                    <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                        <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h3 className="font-extrabold text-slate-800 flex items-center gap-2">
                                <Plus size={16} className="text-blue-600" /> איש קשר עסקי חדש
                            </h3>
                            <button onClick={() => setShowAddForm(false)} className="text-slate-400 hover:text-slate-600 hover:bg-slate-200 p-1.5 rounded-lg transition-colors"><X size={18} /></button>
                        </div>
                        <div className="px-5 py-4 overflow-y-auto">
                            <form id="add-contact-form" onSubmit={handleAdd} className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-500 mb-1 flex items-center gap-1"><User size={12}/> שם *</label>
                                        <input type="text" value={form.Name} onChange={(e) => setForm({ ...form, Name: e.target.value })} placeholder="למשל: דנה כהן" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white focus:ring-2 focus:ring-blue-300 outline-none" required />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-500 mb-1 flex items-center gap-1"><Phone size={12}/> טלפון *</label>
                                        <input type="tel" value={toDisplayPhone(form.Phone)} onChange={(e) => setForm({ ...form, Phone: toDbPhone(e.target.value) })} placeholder="05X-XXXXXXX" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white focus:ring-2 focus:ring-blue-300 outline-none" dir="ltr" required />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-500 mb-1 flex items-center gap-1"><Briefcase size={12}/> תפקיד</label>
                                        <input type="text" value={form.Role} onChange={(e) => setForm({ ...form, Role: e.target.value })} placeholder="למשל: מפיקת אירועים" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white focus:ring-2 focus:ring-blue-300 outline-none" />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-500 mb-1 flex items-center gap-1"><Building size={12}/> חברה/ארגון</label>
                                        <input type="text" value={form.Company} onChange={(e) => setForm({ ...form, Company: e.target.value })} placeholder="למשל: מועצה אזורית" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white focus:ring-2 focus:ring-blue-300 outline-none" />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-500 mb-1 flex items-center gap-1"><AlignLeft size={12}/> סיכום התקשרות</label>
                                    <textarea value={form.Summary} onChange={(e) => setForm({ ...form, Summary: e.target.value })} placeholder="פרטים על ההתקשרות, סוג האירועים, וכו'" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white focus:ring-2 focus:ring-blue-300 outline-none h-24 resize-none" />
                                </div>
                            </form>
                        </div>
                        <div className="px-5 py-4 border-t border-slate-100 bg-slate-50 flex gap-2 justify-end">
                            <button onClick={() => setShowAddForm(false)} className="px-4 py-2 text-slate-500 text-xs font-bold hover:text-slate-700">ביטול</button>
                            <button type="submit" form="add-contact-form" className="px-6 py-2 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition-all shadow-md">צור איש קשר</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Contacts List */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6">
                {contacts.length === 0 ? (
                    <div className="text-center py-16 text-slate-400">
                        <Briefcase size={48} className="mx-auto mb-4 text-slate-200" />
                        <p className="text-lg font-bold">אין אנשי קשר במערכת</p>
                        <p className="text-sm">לחץ על "הוסף איש קשר" להתחיל</p>
                    </div>
                ) : (
                    <div className="flex flex-col border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden">
                        <div className="flex items-center px-4 md:px-6 py-3 text-[10px] font-bold text-slate-400 border-b border-slate-100 uppercase bg-slate-50">
                            <div className="w-48 shrink-0">שם / טלפון</div>
                            <div className="w-40 shrink-0 hidden md:block">תפקיד / חברה</div>
                            <div className="flex-1">סיכום התקשרות</div>
                            <div className="w-20 shrink-0 text-center">פעולות</div>
                        </div>
                        {contacts.map(c => {
                            const isEditing = editingId === c.id;

                            return (
                                <div key={c.id} className="flex flex-col md:flex-row md:items-center border-b border-slate-100 transition-all group bg-white hover:bg-slate-50/50">
                                    {isEditing ? (
                                        <div className="flex flex-col md:flex-row w-full p-4 gap-4 bg-blue-50/30">
                                            <div className="flex flex-col gap-2 w-full md:w-48 shrink-0">
                                                <input type="text" value={editForm.Name} onChange={(e) => setEditForm({ ...editForm, Name: e.target.value })} className="w-full px-2 py-1 border border-slate-200 rounded text-xs bg-white" placeholder="שם" />
                                                <input type="tel" value={toDisplayPhone(editForm.Phone || '')} onChange={(e) => setEditForm({ ...editForm, Phone: toDbPhone(e.target.value) })} className="w-full px-2 py-1 border border-slate-200 rounded text-xs bg-white" dir="ltr" placeholder="טלפון" />
                                            </div>
                                            <div className="flex flex-col gap-2 w-full md:w-40 shrink-0">
                                                <input type="text" value={editForm.Role} onChange={(e) => setEditForm({ ...editForm, Role: e.target.value })} className="w-full px-2 py-1 border border-slate-200 rounded text-xs bg-white" placeholder="תפקיד" />
                                                <input type="text" value={editForm.Company} onChange={(e) => setEditForm({ ...editForm, Company: e.target.value })} className="w-full px-2 py-1 border border-slate-200 rounded text-xs bg-white" placeholder="חברה" />
                                            </div>
                                            <div className="flex-1 w-full">
                                                <textarea value={editForm.Summary} onChange={(e) => setEditForm({ ...editForm, Summary: e.target.value })} className="w-full px-2 py-1 border border-slate-200 rounded text-xs bg-white h-full min-h-[60px] resize-none" placeholder="סיכום" />
                                            </div>
                                            <div className="w-full md:w-20 shrink-0 flex items-center justify-end gap-1">
                                                <button onClick={() => saveEdit(c.id)} className="p-1.5 text-green-600 hover:bg-green-100 rounded"><Check size={16} /></button>
                                                <button onClick={() => setEditingId(null)} className="p-1.5 text-slate-400 hover:bg-slate-200 rounded"><X size={16} /></button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col md:flex-row w-full p-4 gap-4 items-start md:items-center">
                                            <div className="flex flex-col gap-0.5 w-full md:w-48 shrink-0">
                                                <span className="font-bold text-slate-800 text-sm">{c.fields.Name}</span>
                                                <span className="text-xs text-slate-500 font-mono" dir="ltr">{toDisplayPhone(c.fields.Phone)}</span>
                                            </div>
                                            
                                            <div className="flex flex-col gap-0.5 w-full md:w-40 shrink-0">
                                                <span className="text-xs font-bold text-slate-700">{c.fields.Role || '—'}</span>
                                                <span className="text-[11px] text-slate-400">{c.fields.Company || '—'}</span>
                                            </div>
                                            
                                            <div className="flex-1 w-full text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">
                                                {c.fields.Summary ? (
                                                    <div className="bg-slate-100/50 p-2 rounded-lg border border-slate-100">
                                                        {c.fields.Summary}
                                                    </div>
                                                ) : (
                                                    <span className="text-slate-300 italic">לא הוזן סיכום</span>
                                                )}
                                            </div>
                                            
                                            <div className="w-full md:w-20 shrink-0 flex items-center justify-end gap-1 mt-2 md:mt-0">
                                                <button onClick={() => startEdit(c)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="ערוך">
                                                    <Edit size={16} />
                                                </button>
                                                <button onClick={() => handleDelete(c.id)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors" title="מחק">
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
