export function toDisplayPhone(phone: string | undefined | null): string {
    if (!phone) return '';
    let p = phone.replace(/\D/g, '');
    if (p.startsWith('972')) {
        p = '0' + p.slice(3);
    }
    return p;
}

export function toDbPhone(phone: string | undefined | null): string {
    if (!phone) return '';
    let p = phone.replace(/\D/g, '');
    if (p.startsWith('0')) {
        p = '972' + p.slice(1);
    } else if (!p.startsWith('972')) {
        // If it starts with 5 (e.g., 544500529), add 972
        if (p.length === 9) {
            p = '972' + p;
        }
    }
    return p;
}

export function formatDateForInput(dateStr: string | undefined | null): string {
    if (!dateStr) return '';
    // If already YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
    
    // Parse DD.MM.YY or DD/MM/YYYY or DD.MM.YYYY
    const parts = dateStr.split(/[\.\-\/]/);
    if (parts.length === 3) {
        let day = parts[0];
        let month = parts[1];
        let year = parts[2];
        
        // Pad day and month
        if (day.length === 1) day = '0' + day;
        if (month.length === 1) month = '0' + month;
        
        // Handle 2-digit years
        if (year.length === 2) {
            year = '20' + year;
        }
        
        return `${year}-${month}-${day}`;
    }
    return dateStr; // fallback
}

export function formatInputDateToDisplay(dateStr: string | undefined | null): string {
    // If we want to store it nicely in DB like DD.MM.YYYY
    // Actually, saving as YYYY-MM-DD is usually better, but if user expects DD.MM.YYYY:
    if (!dateStr) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        const [y, m, d] = dateStr.split('-');
        return `${d}.${m}.${y}`;
    }
    return dateStr;
}

/**
 * Normalizes Event_Date values from various formats to a consistent DD.MM.YYYY display.
 * Handles: "DD.MM.YYYY (original text)", "YYYY-MM-DD", "DD/MM/YYYY", "DD.MM.YY",
 * "(6/5) 06.05.2025", "28.5.26", "01.01.0001", etc.
 */
export function normalizeEventDate(dateStr: string | undefined | null): string {
    if (!dateStr) return '';
    
    let cleaned = dateStr.trim();
    
    // Strip leading parenthetical like "(6/5) " or "(6/5)"
    cleaned = cleaned.replace(/^\([^)]*\)\s*/, '');
    
    // Extract the core date part (before any parenthetical annotation from AI)
    // e.g. "28.05.2026 (28.5.26)" → "28.05.2026"
    const parenIdx = cleaned.indexOf('(');
    if (parenIdx > 0) {
        cleaned = cleaned.substring(0, parenIdx).trim();
    }
    
    // Try YYYY-MM-DD format
    const isoMatch = cleaned.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (isoMatch) {
        const [, y, m, d] = isoMatch;
        return `${d.padStart(2, '0')}.${m.padStart(2, '0')}.${y}`;
    }
    
    // Try DD.MM.YYYY or DD/MM/YYYY or DD-MM-YYYY (also DD.M.YY etc.)
    const dmyMatch = cleaned.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})$/);
    if (dmyMatch) {
        let [, d, m, y] = dmyMatch;
        if (y.length === 2) y = '20' + y;
        return `${d.padStart(2, '0')}.${m.padStart(2, '0')}.${y}`;
    }
    
    // Fallback: return as-is
    return dateStr.trim();
}

/**
 * Parses any Event_Date format into a sortable YYYY-MM-DD string.
 * Returns '' for unparseable dates (sorts to end).
 */
export function parseDateToSortable(dateStr: string | undefined | null): string {
    if (!dateStr) return '';
    
    let cleaned = dateStr.trim();
    
    // Strip leading parenthetical
    cleaned = cleaned.replace(/^\([^)]*\)\s*/, '');
    
    // Extract core date (before parenthetical annotation)
    const parenIdx = cleaned.indexOf('(');
    if (parenIdx > 0) {
        cleaned = cleaned.substring(0, parenIdx).trim();
    }
    
    // Try YYYY-MM-DD
    const isoMatch = cleaned.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (isoMatch) {
        const [, y, m, d] = isoMatch;
        return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    
    // Try DD.MM.YYYY or DD/MM/YYYY or DD-MM-YYYY
    const dmyMatch = cleaned.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})$/);
    if (dmyMatch) {
        let [, d, m, y] = dmyMatch;
        if (y.length === 2) y = '20' + y;
        return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    
    return '';
}
