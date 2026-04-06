'use client';

import { useState, useEffect } from 'react';
import { Task, Lead } from '@/types';
import { api } from '@/lib/api';
import { CheckCircle2, Circle, Calendar, User, Plus, Trash2, ListTodo, Briefcase, Star } from 'lucide-react';
import clsx from 'clsx';
import { AppUser } from '@/lib/auth';

interface TasksSectionProps {
    currentUser?: AppUser | null;
    leads?: Lead[];
}

export default function TasksSection({ currentUser, leads = [] }: TasksSectionProps) {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);
    const [newTaskTitle, setNewTaskTitle] = useState('');
    const [newTaskAssignee, setNewTaskAssignee] = useState<string>('');
    const [newTaskDueDate, setNewTaskDueDate] = useState('');
    const [newTaskLeadId, setNewTaskLeadId] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [filterStarred, setFilterStarred] = useState(false);

    useEffect(() => {
        fetchTasks();
    }, []);

    const fetchTasks = async () => {
        try {
            const data = await api.getTasks();
            setTasks(data);
        } catch (e) {
            console.error('Failed to fetch tasks:', e);
        } finally {
            setLoading(false);
        }
    };

    const handleAddTask = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTaskTitle.trim()) return;

        setIsSaving(true);
        try {
            const created = await api.createTask({
                Title: newTaskTitle.trim(),
                Assignee: newTaskAssignee || currentUser?.displayName,
                Due_Date: newTaskDueDate,
                Is_Completed: false,
                Lead_ID: newTaskLeadId || undefined
            });
            setTasks([created, ...tasks]);
            setNewTaskTitle('');
            setNewTaskDueDate('');
            setNewTaskLeadId('');
        } catch (e) {
            console.error('Failed to create task:', e);
            alert('שגיאה ביצירת המשימה');
        } finally {
            setIsSaving(false);
        }
    };

    const handleToggleComplete = async (task: Task) => {
        try {
            const updatedCompleted = !task.fields.Is_Completed;
            const updated = await api.updateTask(task.id, { Is_Completed: updatedCompleted });
            setTasks(tasks.map(t => t.id === updated.id ? updated : t));
        } catch (e) {
            console.error('Failed to update task:', e);
            alert('שגיאה בעדכון המשימה');
        }
    };

    const handleDeleteTask = async (id: string) => {
        if (!confirm('למחוק את המשימה?')) return;
        try {
            await api.deleteTask(id);
            setTasks(tasks.filter(t => t.id !== id));
        } catch (e) {
            console.error('Failed to delete task:', e);
            alert('שגיאה במחיקת המשימה');
        }
    };

    const matchesStarFilter = (t: Task) => {
        if (!filterStarred) return true;
        const stars = t.fields.Starred_By || [];
        return stars.includes(currentUser?.displayName || '') || stars.includes('כולם');
    };

    const activeTasks = tasks.filter(t => !t.fields.Is_Completed && matchesStarFilter(t));
    const completedTasks = tasks.filter(t => t.fields.Is_Completed && matchesStarFilter(t));

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mt-6 md:mt-8">
            <div className="px-4 md:px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <div className="flex items-center gap-2">
                    <ListTodo className="text-blue-600" size={20} />
                    <h2 className="font-bold text-base md:text-lg text-slate-800">משימות לביצוע</h2>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setFilterStarred(!filterStarred)}
                        className={clsx(
                            "flex items-center justify-center p-1.5 rounded-lg text-sm font-bold transition-all border",
                            filterStarred
                                ? "bg-amber-50 text-amber-600 border-amber-200"
                                : "bg-white text-slate-400 border-slate-200 hover:bg-slate-50"
                        )}
                        title="סונן לפי מועדפים שלי"
                    >
                        <Star size={16} className={clsx(filterStarred && "fill-amber-400 text-amber-500")} />
                    </button>
                    <div className="text-xs font-bold px-2.5 py-1 bg-slate-200 text-slate-600 rounded-full">
                        {activeTasks.length} פתוחות
                    </div>
                </div>
            </div>

            <div className="p-3 md:p-4 bg-slate-50 border-b border-slate-100">
                <form onSubmit={handleAddTask} className="flex flex-col md:flex-row items-center gap-2">
                    <div className="flex-1 w-full bg-white border border-slate-200 rounded flex items-center px-3 py-1.5 focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-400 transition-all">
                        <input
                            type="text"
                            placeholder="מה צריך לעשות?"
                            value={newTaskTitle}
                            onChange={(e) => setNewTaskTitle(e.target.value)}
                            className="flex-1 text-xs outline-none bg-transparent"
                            required
                        />
                    </div>
                    <div className="w-full md:w-32 flex items-center bg-white border border-slate-200 rounded px-2 py-1.5 focus-within:border-blue-400 transition-all">
                        <User size={12} className="text-slate-400 ml-2 shrink-0" />
                        <select
                            value={newTaskAssignee}
                            onChange={(e) => setNewTaskAssignee(e.target.value)}
                            className="w-full bg-transparent text-xs outline-none appearance-none"
                        >
                            <option value="">מנהל...</option>
                            <option value="אילן">אילן</option>
                            <option value="קובי">קובי</option>
                        </select>
                    </div>
                    <div className="w-full md:w-32 flex items-center bg-white border border-slate-200 rounded px-2 py-1.5 focus-within:border-blue-400 transition-all">
                        <Calendar size={12} className="text-slate-400 ml-2 shrink-0" />
                        <input
                            type="text"
                            placeholder="תאריך יעד"
                            value={newTaskDueDate}
                            onChange={(e) => setNewTaskDueDate(e.target.value)}
                            className="w-full bg-transparent text-xs outline-none placeholder:text-slate-400"
                        />
                    </div>
                    {leads && leads.length > 0 && (
                        <div className="w-full md:w-32 flex items-center bg-white border border-slate-200 rounded px-2 py-1.5 focus-within:border-blue-400 transition-all">
                            <Briefcase size={12} className="text-slate-400 ml-2 shrink-0" />
                            <select
                                value={newTaskLeadId}
                                onChange={(e) => setNewTaskLeadId(e.target.value)}
                                className="w-full bg-transparent text-xs outline-none appearance-none"
                            >
                                <option value="">שייך לאירוע...</option>
                                {leads.map(l => (
                                    <option key={l.id} value={l.id}>{l.fields.Name || l.fields.Phone}</option>
                                ))}
                            </select>
                        </div>
                    )}
                    <button
                        type="submit"
                        disabled={isSaving || !newTaskTitle.trim()}
                        className="w-full md:w-auto px-4 py-1.5 bg-blue-600 text-white text-xs font-bold rounded hover:bg-blue-700 transition-all disabled:opacity-50 shadow-sm shrink-0 flex items-center justify-center gap-1.5"
                    >
                        <Plus size={14} /> הוסף
                    </button>
                </form>
            </div>

            <div className="divide-y divide-slate-100 p-2 md:p-4">
                {loading ? (
                    <div className="p-8 text-center text-slate-500 text-sm">טוען משימות...</div>
                ) : tasks.length === 0 ? (
                    <div className="p-8 text-center text-slate-400 text-sm">אין משימות כרגע. איזה כיף! 🎉</div>
                ) : (
                    <>
                        {activeTasks.map(task => (
                            <TaskRow
                                key={task.id}
                                task={task}
                                leads={leads}
                                currentUserName={currentUser?.displayName}
                                onToggle={() => handleToggleComplete(task)}
                                onDelete={() => handleDeleteTask(task.id)}
                                onStar={(newStars) => {
                                    api.updateTask(task.id, { Starred_By: newStars });
                                    setTasks(tasks.map(t => t.id === task.id ? { ...t, fields: { ...t.fields, Starred_By: newStars } } : t));
                                }}
                            />
                        ))}
                        {completedTasks.length > 0 && (
                            <div className="mt-8 mb-2 px-2 text-xs font-bold text-slate-400 border-b border-slate-100 pb-2">משימות שהושלמו:</div>
                        )}
                        {completedTasks.map(task => (
                            <TaskRow
                                key={task.id}
                                task={task}
                                leads={leads}
                                currentUserName={currentUser?.displayName}
                                onToggle={() => handleToggleComplete(task)}
                                onDelete={() => handleDeleteTask(task.id)}
                                onStar={(newStars) => {
                                    api.updateTask(task.id, { Starred_By: newStars });
                                    setTasks(tasks.map(t => t.id === task.id ? { ...t, fields: { ...t.fields, Starred_By: newStars } } : t));
                                }}
                            />
                        ))}
                    </>
                )}
            </div>
        </div>
    );
}

function TaskRow({ task, leads, currentUserName, onToggle, onDelete, onStar }: { task: Task; leads?: Lead[]; currentUserName?: string; onToggle: () => void; onDelete: () => void; onStar: (stars: string[]) => void }) {
    const isCompleted = task.fields.Is_Completed;
    const linkedLead = task.fields.Lead_ID && leads ? leads.find(l => l.id === task.fields.Lead_ID) : null;
    const [isStarMenuOpen, setIsStarMenuOpen] = useState(false);

    return (
        <div className={clsx(
            "flex items-center px-4 py-2 border-b border-slate-50 hover:bg-slate-50 transition-colors group bg-white text-xs",
            isCompleted && "bg-slate-50"
        )}>
            <div className="w-8 shrink-0 flex justify-center">
                <button onClick={onToggle} className={clsx("flex-shrink-0 transition-colors", isCompleted ? "text-green-500 hover:text-green-600" : "text-slate-300 hover:text-blue-500")}>
                    {isCompleted ? <CheckCircle2 size={16} className="fill-green-100" /> : <Circle size={16} />}
                </button>
            </div>
            
            <div className="flex-1 min-w-0 flex items-center pr-2 gap-2">
                <span className={clsx("font-bold truncate", isCompleted ? "line-through text-slate-400 font-medium" : "text-slate-700")}>
                    {task.fields.Title}
                </span>
                {!(task.fields.Starred_By || []).includes(currentUserName || '') && (task.fields.Starred_By || []).length > 0 && (
                    <span title="מסומן למישהו אחר" className="flex items-center shrink-0">
                        <Star size={12} className="text-amber-400 fill-amber-400 opacity-50" />
                    </span>
                )}
                {linkedLead && (
                    <span className="hidden md:inline-flex items-center gap-1 text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-medium truncate max-w-[150px]">
                        <Briefcase size={10} />
                        {linkedLead.fields.Name || linkedLead.fields.Phone}
                    </span>
                )}
            </div>

            <div className="w-24 shrink-0 hidden md:flex items-center justify-center">
                {task.fields.Assignee ? (
                    <span className={clsx("px-2 py-0.5 rounded font-bold text-[10px]",
                        task.fields.Assignee === 'אילן' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'
                    )}>
                       {task.fields.Assignee}
                    </span>
                ) : <span className="text-slate-300">—</span>}
            </div>
            
            <div className="w-24 shrink-0 hidden md:flex items-center text-[10px] justify-center">
                {task.fields.Due_Date ? (
                    <span className={clsx("font-bold", isCompleted ? "text-slate-400" : "text-slate-500")}>
                        {task.fields.Due_Date}
                    </span>
                ) : <span className="text-slate-300">—</span>}
            </div>
            
            <div className="w-16 shrink-0 flex items-center justify-end gap-1 relative">
                <button 
                    onClick={() => setIsStarMenuOpen(!isStarMenuOpen)} 
                    className="text-slate-300 hover:text-amber-400 opacity-0 group-hover:opacity-100 transition-all p-1 rounded hover:bg-amber-50 focus:opacity-100" 
                    title="כוכב"
                >
                    <Star size={14} className={(task.fields.Starred_By || []).includes(currentUserName || '') ? 'text-amber-400 fill-amber-400 opacity-100' : ''} />
                </button>
                {isStarMenuOpen && (
                    <>
                        <div className="fixed inset-0 z-[60]" onClick={() => setIsStarMenuOpen(false)}></div>
                        <div className="absolute left-6 top-6 w-36 bg-white border border-slate-100 rounded-xl shadow-xl z-[70] py-1 overflow-hidden" dir="rtl">
                            {['אילן', 'קובי', 'כולם'].map(assignee => {
                                const isStarred = (task.fields.Starred_By || []).includes(assignee);
                                return (
                                    <button
                                        key={assignee}
                                        onClick={() => {
                                            const currentStars = task.fields.Starred_By || [];
                                            const newStars = isStarred 
                                                ? currentStars.filter(n => n !== assignee)
                                                : [...currentStars, assignee];
                                            onStar(newStars);
                                            setIsStarMenuOpen(false);
                                        }}
                                        className="w-full text-right px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center justify-between"
                                    >
                                        {assignee}
                                        {isStarred && <Star size={12} className="text-amber-400 fill-amber-400" />}
                                    </button>
                                );
                            })}
                        </div>
                    </>
                )}

                <button onClick={onDelete} className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all p-1 rounded hover:bg-red-50 focus:opacity-100" title="מחק">
                    <Trash2 size={14} />
                </button>
            </div>
        </div>
    );
}
