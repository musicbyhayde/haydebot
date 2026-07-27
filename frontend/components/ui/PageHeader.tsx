'use client';

import { Menu } from 'lucide-react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  onMenuClick?: () => void;
  actions?: React.ReactNode;
}

/**
 * Standardized page header with mobile hamburger button.
 * Used across all main views for consistent layout.
 */
export default function PageHeader({ title, subtitle, onMenuClick, actions }: PageHeaderProps) {
  return (
    <header className="mb-6 md:mb-8 flex items-center justify-between">
      <div className="flex items-center gap-3">
        {onMenuClick && (
          <button
            onClick={onMenuClick}
            className="md:hidden p-2 bg-white rounded-lg shadow-sm border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
            aria-label="פתח תפריט ניווט"
          >
            <Menu size={24} />
          </button>
        )}
        <div>
          <h1 className="text-xl md:text-3xl font-extrabold text-slate-900 mb-0.5 md:mb-1">{title}</h1>
          {subtitle && <p className="text-xs md:text-sm text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}
