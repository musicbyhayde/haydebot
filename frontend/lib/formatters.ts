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
