import { createContext, useContext } from 'react';

/**
 * Read-only ("viewer") mode for the dashboard.
 * The backend is the real gate (deny-by-default for role "viewer"); this module only
 * keeps the UI honest: write controls hidden, non-GET requests blocked client-side.
 */
export const READ_ONLY_MESSAGE = 'משתמש צפייה בלבד: הפעולה לא זמינה';
export const READ_ONLY_BANNER = '👁️ צפייה בלבד — אין אפשרות לשנות נתונים';

/** Screens a viewer never sees (the backend also refuses their data). */
export const VIEWER_HIDDEN_VIEWS: readonly string[] = [
    'finance', 'musicians', 'videos', 'business-contacts', 'analytics', 'users',
];

let readOnlyMode = false;

/** Set once the current user's role is known (page.tsx). Used by lib/api.ts. */
export function setReadOnlyMode(value: boolean): void {
    readOnlyMode = value;
}

export function isReadOnlyMode(): boolean {
    return readOnlyMode;
}

export const ReadOnlyContext = createContext<boolean>(false);

/** true when the logged-in user is a read-only viewer. */
export function useReadOnly(): boolean {
    return useContext(ReadOnlyContext);
}

export function isViewHiddenForViewer(view: string): boolean {
    return VIEWER_HIDDEN_VIEWS.includes(view);
}
