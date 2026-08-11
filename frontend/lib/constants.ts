/**
 * Shared constants for HaydeBot frontend.
 * Single source of truth for status maps, pipeline order, colors, and service types.
 */

// ── Status Map (Hebrew labels + styling) ─────────────────────────────

export interface StatusInfo {
  label: string;
  class: string;
  borderClass?: string;
}

export const STATUS_MAP: Record<string, StatusInfo> = {
  'New': { label: 'חדש', class: 'bg-blue-50 text-blue-700', borderClass: 'border-blue-200' },
  'Processing': { label: 'בטיפול בוט', class: 'bg-yellow-50 text-yellow-700', borderClass: 'border-yellow-200' },
  'Manual': { label: 'בטיפול ידני', class: 'bg-indigo-50 text-indigo-700', borderClass: 'border-indigo-200' },
  'Talking': { label: 'בשיחה', class: 'bg-cyan-50 text-cyan-700', borderClass: 'border-cyan-200' },
  'Quote_Sent': { label: 'נשלחה הצ"מ', class: 'bg-amber-50 text-amber-700', borderClass: 'border-amber-200' },
  'Waiting_Payment': { label: 'מחכה לתשלום', class: 'bg-orange-50 text-orange-700', borderClass: 'border-orange-200' },
  'Distributed': { label: 'הופץ', class: 'bg-purple-50 text-purple-700', borderClass: 'border-purple-200' },
  'Assigned': { label: 'שובץ', class: 'bg-green-50 text-green-700', borderClass: 'border-green-200' },
  'Closed': { label: 'נסגר', class: 'bg-emerald-50 text-emerald-700', borderClass: 'border-emerald-200' },
  'Lost': { label: 'אבוד', class: 'bg-red-50 text-red-700', borderClass: 'border-red-200' },
  'Referred': { label: 'הופנה', class: 'bg-teal-50 text-teal-700', borderClass: 'border-teal-200' },
  'Completed': { label: 'הושלם', class: 'bg-slate-100 text-slate-600', borderClass: 'border-slate-300' },
  'Cold': { label: 'ליד קר', class: 'bg-sky-50 text-sky-700', borderClass: 'border-sky-200' },
};

// ── Pipeline Stage Order (for sorting) ──────────────────────────────

export const STATUS_ORDER: Record<string, number> = {
  'New': 0,
  'Processing': 1,
  'Manual': 2,
  'Talking': 3,
  'Quote_Sent': 4,
  'Distributed': 5,
  'Assigned': 6,
  'Waiting_Payment': 7,
  'Closed': 8,
  'Lost': 9,
  'Referred': 10,
  'Completed': 11,
  'Cold': 12,
};

// ── Status Lists by Service Type ────────────────────────────────────

export const BOUZOUKI_STATUS_LIST = [
  'New', 'Processing', 'Distributed', 'Assigned',
  'Closed', 'Lost', 'Referred', 'Cold', 'Completed',
];

export const MANUAL_STATUS_LIST = [
  'New', 'Manual', 'Talking', 'Quote_Sent', 'Waiting_Payment',
  'Closed', 'Lost', 'Referred', 'Cold', 'Completed',
];

// ── Status Pipeline (with colors for LeadDetailPanel) ───────────────

export interface PipelineStatus {
  value: string;
  label: string;
  color: string;
}

export const BOUZOUKI_PIPELINE: PipelineStatus[] = [
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

export const MANUAL_PIPELINE: PipelineStatus[] = [
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

// ── Owner Colors ────────────────────────────────────────────────────

export const OWNER_COLORS: Record<string, string> = {
  'אילן': 'bg-blue-100 text-blue-700',
  'קובי': 'bg-purple-100 text-purple-700',
};

// ── Commission Status ───────────────────────────────────────────────

export const COMMISSION_STATUS_ORDER: Record<string, number> = {
  'ממתין לאישור': 0,
  'ממתין': 0,
  'ממתין לגבייה': 1,
  'נגבה': 2,
  'בוטל': 3,
};

export function getCommissionBadge(status: string | undefined): { label: string; class: string } {
  const s = (!status || status === 'ממתין') ? 'ממתין לאישור' : status;
  switch (s) {
    case 'ממתין לאישור':
      return { label: 'ממתין לאישור', class: 'bg-amber-50 text-amber-700 border-amber-200' };
    case 'ממתין לגבייה':
      return { label: 'ממתין לגבייה', class: 'bg-blue-50 text-blue-700 border-blue-200' };
    case 'נגבה':
      return { label: 'נגבה', class: 'bg-green-50 text-green-700 border-green-200' };
    case 'בוטל':
      return { label: 'בוטל', class: 'bg-red-50 text-red-700 border-red-200' };
    default:
      return { label: s, class: 'bg-slate-50 text-slate-600 border-slate-200' };
  }
}

export function getEffectiveCommissionStatus(status: string | undefined): string {
  return (!status || status === 'ממתין') ? 'ממתין לאישור' : status;
}

// ── Service Options ─────────────────────────────────────────────────

export const SERVICE_OPTIONS = [
  { value: 'Bouzouki', label: 'בוזוקי' },
  { value: 'Band', label: 'הרכב' },
  { value: 'DJ', label: 'DJ' },
  { value: 'Reception', label: 'קבלת פנים' },
  { value: 'Talk', label: 'הרצאה' },
  { value: 'Other', label: 'אחר' },
];

// ── Lead Status Options (for AddLeadModal) ──────────────────────────

export const ADD_LEAD_STATUS_OPTIONS = [
  { value: 'New', label: 'חדש' },
  { value: 'Manual', label: 'בטיפול ידני' },
  { value: 'Processing', label: 'בטיפול בוט' },
  { value: 'Talking', label: 'בשיחה' },
  { value: 'Quote_Sent', label: 'נשלחה הצ"מ' },
  { value: 'Waiting_Payment', label: 'מחכה לתשלום' },
];

// ── Owner List ──────────────────────────────────────────────────────

export const OWNERS = ['אילן', 'קובי'] as const;
export type OwnerName = typeof OWNERS[number];

// ── Star Assignees ──────────────────────────────────────────────────

export const STAR_ASSIGNEES = ['אילן', 'קובי', 'כולם'] as const;

// ── Payment Statuses ────────────────────────────────────────────────

export const PAYMENT_STATUSES = ['שולם', 'לא שולם', 'חלקי'];

// ── View Types ──────────────────────────────────────────────────────

export type ViewType = 'home' | 'inbox' | 'dashboard' | 'musicians' | 'finance' | 'tasks' | 'history' | 'analytics' | 'videos';

// ── Navigation Items ────────────────────────────────────────────────

export interface NavItem {
  key: ViewType;
  label: string;
  emoji?: string;
  iconName: string;
  activeClass: string;
  showInBottomNav?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { key: 'home', label: 'דשבורד', iconName: 'LayoutDashboard', activeClass: 'bg-slate-900 text-white shadow-lg shadow-slate-200', showInBottomNav: true },
  { key: 'dashboard', label: 'לידים', emoji: '📋', iconName: 'Users', activeClass: 'bg-slate-900 text-white shadow-lg shadow-slate-200', showInBottomNav: true },
  { key: 'musicians', label: 'נגנים', iconName: 'Music', activeClass: 'bg-purple-600 text-white shadow-lg shadow-purple-100', showInBottomNav: false },
  { key: 'videos', label: 'סרטונים', iconName: 'Film', activeClass: 'bg-indigo-600 text-white shadow-lg shadow-indigo-100', showInBottomNav: false },
  { key: 'finance', label: 'כספים', emoji: '💰', iconName: 'DollarSign', activeClass: 'bg-amber-500 text-white shadow-lg shadow-amber-100', showInBottomNav: true },
  { key: 'tasks', label: 'משימות', emoji: '📋', iconName: 'ListTodo', activeClass: 'bg-emerald-500 text-white shadow-lg shadow-emerald-100', showInBottomNav: true },
  { key: 'history', label: 'היסטוריה', emoji: '⏱️', iconName: 'Clock', activeClass: 'bg-indigo-500 text-white shadow-lg shadow-indigo-100', showInBottomNav: false },
];

// ── File Upload ─────────────────────────────────────────────────────

export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
export const ALLOWED_FILE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
