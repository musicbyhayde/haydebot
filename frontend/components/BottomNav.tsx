'use client';

import { LayoutDashboard, Users, DollarSign, ListTodo, MessageCircle } from 'lucide-react';
import clsx from 'clsx';
import type { ViewType } from '@/lib/constants';

interface BottomNavProps {
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
  unreadCount?: number;
}

interface BottomNavItem {
  key: ViewType;
  label: string;
  icon: typeof LayoutDashboard;
  activeColor: string;
}

const BOTTOM_NAV_ITEMS: BottomNavItem[] = [
  { key: 'home', label: 'דשבורד', icon: LayoutDashboard, activeColor: 'text-slate-900' },
  { key: 'dashboard', label: 'לידים', icon: Users, activeColor: 'text-blue-600' },
  { key: 'inbox', label: 'צ\'אט', icon: MessageCircle, activeColor: 'text-green-600' },
  { key: 'finance', label: 'כספים', icon: DollarSign, activeColor: 'text-amber-600' },
  { key: 'tasks', label: 'משימות', icon: ListTodo, activeColor: 'text-emerald-600' },
];

/**
 * Fixed bottom navigation bar for mobile.
 * Shows the 5 most important views with a single tap.
 * Only visible on screens smaller than md breakpoint.
 */
export default function BottomNav({ currentView, onViewChange, unreadCount = 0 }: BottomNavProps) {
  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-lg border-t border-slate-200 safe-area-bottom"
      role="navigation"
      aria-label="ניווט ראשי"
    >
      <div className="flex items-center justify-around h-16 px-2">
        {BOTTOM_NAV_ITEMS.map((item) => {
          const isActive = currentView === item.key;
          const Icon = item.icon;
          const showBadge = item.key === 'inbox' && unreadCount > 0;

          return (
            <button
              key={item.key}
              onClick={() => onViewChange(item.key)}
              className={clsx(
                'flex flex-col items-center justify-center gap-0.5 w-16 h-full relative transition-all duration-200',
                isActive ? item.activeColor : 'text-slate-400'
              )}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
            >
              {/* Active indicator */}
              {isActive && (
                <div className="absolute top-0 inset-x-3 h-0.5 rounded-full bg-current" />
              )}

              <div className="relative">
                <Icon size={22} strokeWidth={isActive ? 2.5 : 1.8} />
                {showBadge && (
                  <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 flex items-center justify-center px-1 bg-red-500 text-white text-[9px] font-bold rounded-full leading-none">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </div>
              <span className={clsx(
                'text-[10px] leading-tight',
                isActive ? 'font-bold' : 'font-medium'
              )}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
