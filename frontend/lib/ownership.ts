/**
 * Lead owner rules (improvement #4, Ilan 2026-10-05). Mirrors app/services/activity_text.py:
 * - the first assignment of a lead without an owner needs no note, in any status;
 * - a hand-over to another partner, or removing the owner, needs a hand-over note;
 * - only the partners in OWNERS are owner values (the admin user "מנהל" is not).
 */
import { OWNERS } from './constants';

export const OWNER_NOTE_PROMPT = 'אני רואה שהוספת הערה לליד הזה, להגדיר אותך כמוביל?';
export const OWNER_VIA_NOTE_PROMPT = 'note_prompt';

export function isOwnerName(name?: string | null): boolean {
    return !!name && (OWNERS as readonly string[]).includes(name);
}

export function ownerChangeNeedsNote(currentOwner?: string | null, newOwner?: string | null): boolean {
    const cur = (currentOwner || '').trim();
    return !!cur && cur !== (newOwner || '').trim();
}

/**
 * Offer "make you the owner?" after a dashboard user added a note: only when the lead has no
 * owner, had no notes at all before this one (and the notes list really loaded), and the user is
 * a partner. Bot authors ("bot:...") and non-partner users (e.g. the admin "מנהל") never get it.
 */
export function shouldOfferOwnership(opts: {
    owner?: string | null;
    notesBefore: number;
    notesLoaded: boolean;
    userName?: string | null;
}): boolean {
    const { owner, notesBefore, notesLoaded, userName } = opts;
    if ((owner || '').trim()) return false;
    if (!notesLoaded || notesBefore > 0) return false;
    if (!userName || userName.startsWith('bot:')) return false;
    return isOwnerName(userName);
}
