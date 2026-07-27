'use client';

/**
 * Standardized loading spinner for inline use.
 */
export function LoadingSpinner({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      className={`animate-spin text-slate-400 ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-label="טוען..."
      role="status"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

/**
 * Standardized full-page loading screen.
 */
export default function LoadingScreen({ message }: { message?: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-[300px] gap-4">
      <div className="relative">
        <div className="w-12 h-12 rounded-full border-4 border-slate-200 border-t-amber-500 animate-spin" />
      </div>
      <p className="text-sm font-bold text-slate-400 animate-pulse">
        {message || 'טוען...'}
      </p>
    </div>
  );
}
