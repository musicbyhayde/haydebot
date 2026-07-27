'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { X, CheckCircle2, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import clsx from 'clsx';

// ── Types ──────────────────────────────────────────────────────────

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
}

interface ToastContextType {
  toast: (message: string, type?: ToastType, duration?: number) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
  info: (message: string) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

// ── Context ────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextType | null>(null);

const dummyToastCtx: ToastContextType = {
  toast: () => {},
  success: () => {},
  error: () => {},
  warning: () => {},
  info: () => {},
  confirm: async () => true,
};

export function useToast(): ToastContextType {
  const ctx = useContext(ToastContext);
  return ctx || dummyToastCtx;
}

// ── Icons ──────────────────────────────────────────────────────────

const TOAST_ICONS: Record<ToastType, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const TOAST_STYLES: Record<ToastType, string> = {
  success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  error: 'bg-red-50 border-red-200 text-red-800',
  warning: 'bg-amber-50 border-amber-200 text-amber-800',
  info: 'bg-blue-50 border-blue-200 text-blue-800',
};

const TOAST_ICON_STYLES: Record<ToastType, string> = {
  success: 'text-emerald-500',
  error: 'text-red-500',
  warning: 'text-amber-500',
  info: 'text-blue-500',
};

const DEFAULT_DURATIONS: Record<ToastType, number> = {
  success: 3000,
  error: 5000,
  warning: 4000,
  info: 3000,
};

// ── Provider ───────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<{
    options: ConfirmOptions;
    resolve: (value: boolean) => void;
  } | null>(null);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const addToast = useCallback((message: string, type: ToastType = 'info', duration?: number) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const d = duration ?? DEFAULT_DURATIONS[type];

    setToasts(prev => [...prev, { id, type, message, duration: d }]);

    if (d > 0) {
      setTimeout(() => removeToast(id), d);
    }
  }, [removeToast]);

  const confirmFn = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setConfirmState({ options, resolve });
    });
  }, []);

  const handleConfirm = useCallback((result: boolean) => {
    confirmState?.resolve(result);
    setConfirmState(null);
  }, [confirmState]);

  const ctx: ToastContextType = {
    toast: addToast,
    success: (msg) => addToast(msg, 'success'),
    error: (msg) => addToast(msg, 'error'),
    warning: (msg) => addToast(msg, 'warning'),
    info: (msg) => addToast(msg, 'info'),
    confirm: confirmFn,
  };

  return (
    <ToastContext.Provider value={ctx}>
      {children}

      {/* Toast Container */}
      <div
        className="fixed top-4 left-1/2 -translate-x-1/2 z-[var(--z-toast,60)] flex flex-col items-center gap-2 pointer-events-none w-full max-w-md px-4"
        dir="rtl"
        aria-live="polite"
        role="status"
      >
        {toasts.map((t) => {
          const Icon = TOAST_ICONS[t.type];
          return (
            <div
              key={t.id}
              className={clsx(
                'pointer-events-auto flex items-center gap-3 w-full px-4 py-3 rounded-xl border shadow-lg',
                'animate-[toast-slide-in_var(--duration-normal,250ms)_ease-out]',
                TOAST_STYLES[t.type]
              )}
              role="alert"
            >
              <Icon size={18} className={clsx('shrink-0', TOAST_ICON_STYLES[t.type])} />
              <span className="flex-1 text-sm font-medium leading-snug">{t.message}</span>
              <button
                onClick={() => removeToast(t.id)}
                className="shrink-0 p-1 rounded-lg hover:bg-black/5 transition-colors"
                aria-label="סגור הודעה"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Confirm Dialog */}
      {confirmState && (
        <div
          className="fixed inset-0 z-[var(--z-modal-backdrop,50)] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-[modal-backdrop-in_var(--duration-fast,150ms)_ease-out]"
          dir="rtl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
          onClick={() => handleConfirm(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-[modal-slide-up_var(--duration-normal,250ms)_ease-out]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 pt-6 pb-4">
              <h3 id="confirm-title" className="text-lg font-bold text-slate-800 mb-2">
                {confirmState.options.title}
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                {confirmState.options.message}
              </p>
            </div>
            <div className="flex items-center gap-3 px-6 pb-6">
              <button
                onClick={() => handleConfirm(true)}
                className={clsx(
                  'flex-1 py-2.5 font-bold rounded-xl transition-colors text-sm',
                  confirmState.options.variant === 'danger'
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                )}
                autoFocus
              >
                {confirmState.options.confirmLabel || 'אישור'}
              </button>
              <button
                onClick={() => handleConfirm(false)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl transition-colors text-sm"
              >
                {confirmState.options.cancelLabel || 'ביטול'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}
