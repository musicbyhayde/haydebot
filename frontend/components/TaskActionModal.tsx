import { AlertCircle, Check, Trash2, X, Minus } from 'lucide-react';

interface TaskActionModalProps {
    isOpen: boolean;
    taskCount: number;
    onClose: () => void;
    onAction: (action: 'complete' | 'delete' | 'ignore') => void;
}

export default function TaskActionModal({ isOpen, taskCount, onClose, onAction }: TaskActionModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm" dir="rtl">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 text-center">
                    <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4 text-amber-600">
                        <AlertCircle size={32} />
                    </div>
                    <h3 className="text-xl font-bold text-slate-800 mb-2">משימות פתוחות</h3>
                    <p className="text-slate-600 mb-6">
                        לליד זה יש <span className="font-bold">{taskCount}</span> משימות פתוחות. מה ברצונך לעשות איתן לפני המעבר לאבוד?
                    </p>
                    
                    <div className="flex flex-col gap-3">
                        <button 
                            onClick={() => onAction('delete')}
                            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-50 text-red-700 hover:bg-red-100 rounded-xl font-bold transition-colors"
                        >
                            <Trash2 size={18} />
                            מחק משימות
                        </button>
                        
                        <button 
                            onClick={() => onAction('complete')}
                            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-50 text-green-700 hover:bg-green-100 rounded-xl font-bold transition-colors"
                        >
                            <Check size={18} />
                            סמן כבוצעו
                        </button>
                        
                        <button 
                            onClick={() => onAction('ignore')}
                            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-slate-50 text-slate-700 hover:bg-slate-100 rounded-xl font-bold transition-colors"
                        >
                            <Minus size={18} />
                            השאר כמו שהן
                        </button>
                    </div>
                </div>
                <div className="px-6 py-4 bg-slate-50 border-t border-slate-100">
                    <button 
                        onClick={onClose}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 text-slate-500 hover:text-slate-700 font-bold transition-colors"
                    >
                        ביטול
                    </button>
                </div>
            </div>
        </div>
    );
}
