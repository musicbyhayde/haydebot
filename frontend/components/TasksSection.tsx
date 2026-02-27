'use client';

import { useState, useEffect } from 'react';
import { Task } from '@/types';
import { api } from '@/lib/api';
import { CheckCircle2, Circle, Calendar, User, Plus, Trash2, ListTodo } from 'lucide-react';
import clsx from 'clsx';
import { AppUser } from '@/lib/auth';

interface TasksSectionProps {
    currentUser?: AppUser | null;
}

export default function TasksSection({ currentUser }: TasksSectionProps) {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);
    const [newTaskTitle, setNewTaskTitle] = useState('');
    const [newTaskAssignee, setNewTaskAssignee] = useState<string>('');
    const [newTaskDueDate, setNewTaskDueDate] = useState('');
    const [isSaving, setIsSaving] = useState(false);

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
                Is_Completed: false
            });
            setTasks([created, ...tasks]);
            setNewTaskTitle('');
            setNewTaskDueDate('');
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

    const activeTasks = tasks.filter(t => !t.fields.Is_Completed);
    const completedTasks = tasks.filter(t => t.fields.Is_Completed);

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mt-6 md:mt-8">
            <div className="px-4 md:px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-2">
                    <ListTodo className="text-blue-600" size={20} />
                    <h2 className="font-bold text-base md:text-lg text-slate-800">משימות לביצוע</h2>
                </div>
                <div className="text-xs font-bold px-2.5 py-1 bg-slate-200 text-slate-600 rounded-full">
                    {activeTasks.length} פתוחות
                </div>
            </div>

            <div className="p-4 md:p-6 bg-slate-50 border-b border-slate-100">
                <form onSubmit={handleAddTask} className="flex flex-col md:flex-row gap-3">
                    <div className="flex-1">
                        <input
                            type="text"
                            placeholder="מה צריך לעשות?"
                            value={newTaskTitle}
                            onChange={(e) => setNewTaskTitle(e.target.value)}
                            className="w-full px-4 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            required
                        />
                    </div>
                    <div className="w-full md:w-40 flex items-center bg-white border border-slate-200 rounded-xl px-3 outline-none focus-within:ring-2 focus-within:ring-blue-500">
                        <User size={14} className="text-slate-400 ml-2 shrink-0" />
                        <select
                            value={newTaskAssignee}
                            onChange={(e) => setNewTaskAssignee(e.target.value)}
                            className="w-full py-2 bg-transparent text-sm outline-none appearance-none"
                        >
                            <option value="">בחר אחריות...</option>
                            <option value="אילן">אילן</option>
                            <option value="קובי">קובי</option>
                        </select>
                    </div>
                    <div className="w-full md:w-44 flex items-center bg-white border border-slate-200 rounded-xl px-3 outline-none focus-within:ring-2 focus-within:ring-blue-500">
                        <Calendar size={14} className="text-slate-400 ml-2 shrink-0" />
                        <input
                            type="text"
                            placeholder="תאריך יעד"
                            value={newTaskDueDate}
                            onChange={(e) => setNewTaskDueDate(e.target.value)}
                            className="w-full py-2 bg-transparent text-sm outline-none placeholder:text-slate-400"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={isSaving || !newTaskTitle.trim()}
                        className="flex items-center justify-center gap-2 px-6 py-2 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 transition-all disabled:opacity-50 shadow-md shadow-blue-200 shrink-0"
                    >
                        <Plus size={16} /> הוסף משימה
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
                                onToggle={() => handleToggleComplete(task)}
                                onDelete={() => handleDeleteTask(task.id)}
                            />
                        ))}
                        {completedTasks.length > 0 && (
                            <div className="mt-8 mb-2 px-2 text-xs font-bold text-slate-400 border-b border-slate-100 pb-2">משימות שהושלמו:</div>
                        )}
                        {completedTasks.map(task => (
                            <TaskRow
                                key={task.id}
                                task={task}
                                onToggle={() => handleToggleComplete(task)}
                                onDelete={() => handleDeleteTask(task.id)}
                            />
                        ))}
                    </>
                )}
            </div>
        </div>
    );
}

function TaskRow({ task, onToggle, onDelete }: { task: Task; onToggle: () => void; onDelete: () => void }) {
    const isCompleted = task.fields.Is_Completed;
    return (
        <div className={clsx(
            "flex flex-wrap md:flex-nowrap items-center gap-3 p-3 rounded-xl transition-all group",
            isCompleted ? "opacity-60 bg-slate-50" : "hover:bg-slate-50"
        )}>
            <button
                onClick={onToggle}
                className={clsx(
                    "flex-shrink-0 transition-colors",
                    isCompleted ? "text-green-500 hover:text-green-600" : "text-slate-300 hover:text-blue-500"
                )}
            >
                {isCompleted ? <CheckCircle2 size={22} className="fill-green-100" /> : <Circle size={22} />}
            </button>
            <div className="flex-1 min-w-0">
                <span className={clsx("text-sm font-semibold truncate block", isCompleted ? "line-through text-slate-500" : "text-slate-800")}>
                    {task.fields.Title}
                </span>
            </div>

            <div className="flex items-center gap-3 text-xs w-full md:w-auto mt-2 md:mt-0 pl-1">
                {task.fields.Assignee && (
                    <span className={clsx("px-2.5 py-1 rounded-md font-bold flex items-center gap-1.5",
                        task.fields.Assignee === 'אילן' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                    )}>
                        <User size={12} /> {task.fields.Assignee}
                    </span>
                )}
                {task.fields.Due_Date && (
                    <span className={clsx("flex items-center gap-1.5 font-medium", isCompleted ? "text-slate-400" : "text-orange-600")}>
                        <Calendar size={12} /> {task.fields.Due_Date}
                    </span>
                )}
                <button
                    onClick={onDelete}
                    className="mr-auto text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all p-1.5 rounded-md hover:bg-red-50 shrink-0"
                    title="מחק משימה"
                >
                    <Trash2 size={16} />
                </button>
            </div>
        </div>
    );
}
