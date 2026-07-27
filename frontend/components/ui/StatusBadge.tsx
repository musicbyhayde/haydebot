'use client';

import clsx from 'clsx';
import { STATUS_MAP } from '@/lib/constants';

interface StatusBadgeProps {
  status: string;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Consistent status badge component.
 * Renders the Hebrew label with the correct colors for any lead status.
 */
export default function StatusBadge({ status, size = 'sm', className }: StatusBadgeProps) {
  const info = STATUS_MAP[status] || { label: status, class: 'bg-gray-50 text-gray-700', borderClass: 'border-gray-200' };

  return (
    <span
      className={clsx(
        'inline-flex items-center font-bold rounded-full border',
        info.class,
        info.borderClass,
        size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs',
        className
      )}
    >
      {info.label}
    </span>
  );
}
