export interface Lead {
    id: string;
    createdTime: string;
    fields: {
        Phone: string;
        Name?: string;
        Status: string;
        Conversation_State?: string;
        Service?: string;
        Event_Date?: string;
        Location?: string;
        Guests?: string;
        Last_Summary?: string;
        Owner?: string;
        Closing_Amount?: number;
        Lost_Reason?: string;
        Musician_Assigned?: string[];
        Musician_Team?: string[];
        Bot_Mute_Until?: string;
        Last_Read_At?: string;
        Last_Interaction?: string;
        Starred_By?: string[];
        Google_Event_ID?: string;
        Quote_Data?: any;
        Musician_RSVPs?: any;
        Referred_To?: string;
        Commission_Amount?: number;
        Commission_Status?: 'ממתין לאישור' | 'ממתין לגבייה' | 'נגבה' | 'בוטל';
        Commission_Includes_VAT?: boolean;
        // Source / attribution (improvement #2)
        Lead_Source?: LeadSource | null;
        Source_Detail?: string | null;
        Campaign_ID?: string | null;
        Campaign_Name?: string | null;
        Adset_ID?: string | null;
        Adset_Name?: string | null;
        Ad_ID?: string | null;
        Ad_Name?: string | null;
        Form_ID?: string | null;
        Form_Name?: string | null;
        UTM_Source?: string | null;
        UTM_Medium?: string | null;
        UTM_Campaign?: string | null;
        UTM_Content?: string | null;
        CTWA_CLID?: string | null;
        Meta_Lead_ID?: string | null;
        Source_Referral?: LeadSourceReferral | null;
        Form_Answers?: LeadFormAnswers | null;
        Source_Detected_At?: string | null;
    };
}

export type LeadSource =
    | 'meta_form' | 'ctwa' | 'whatsapp_direct' | 'website'
    | 'referral' | 'repeat' | 'phone' | 'other';

export interface LeadSourceReferral {
    source_type?: string;
    source_id?: string;
    source_url?: string;
    headline?: string;
    body?: string;
    ctwa_clid?: string;
    [key: string]: unknown;
}

export interface LeadFormAnswers {
    language?: string | null;
    full_name?: string;
    phone?: string;
    event_type?: string;
    note?: string;
    answers?: Record<string, string>;
    phone_matches_whatsapp?: boolean;
}

export interface Message {
    id: string;
    createdTime: string;
    fields: {
        ID?: string;
        Direction: 'Inbound' | 'Outbound';
        Content: string;
        Media_Type?: string;
        Media_URL?: string;
        Timestamp: string;
        Status: string;
    };
}

export interface Musician {
    id: string;
    fields: {
        Name: string;
        Phone: string;
        Is_Active?: boolean;
        Score?: number;
        Type?: 'REFERRER' | 'POOL';
        Email?: string;
        Bank_Account_Name?: string;
        Bank_Name?: string;
        Bank_Branch?: string;
        Bank_Account_Number?: string;
    };
}


export interface Note {
    id: string;
    fields: {
        Lead_ID: string;
        Author: string;
        Content: string;
        File_URL?: string;
        File_Name?: string;
        Follow_Up_Date?: string;
        Follow_Up_Completed?: boolean;
        Created_At: string;
    };
}

export interface FinanceEntry {
    id: string;
    fields: {
        Owner: string;
        Type: 'income' | 'expense';
        Date: string;
        Description: string;
        Event_Name?: string;
        Musician?: string;
        Amount: number;
        Payment_Status: string;
        Payment_Method?: 'חשבון' | 'מזומן';
        Lead_ID?: string;
        Created_At?: string;
    };
}

export interface Task {
    id: string;
    fields: {
        Title: string;
        Assignee?: string;
        Due_Date?: string;
        Is_Completed: boolean;
        Lead_ID?: string;
        Created_At?: string;
        Starred_By?: string[];
        Pinned_By?: string[];
    };
}

export interface Activity {
    id: string;
    fields: {
        actor: string;
        action_type: string;
        description: string;
        created_at: string;
        lead_id?: string;
    };
}

export interface Video {
    id: string;
    fields: {
        Label: string;
        URL: string;
        Thumbnail?: string;
        Category?: string;
        Is_Active?: boolean;
        Created_At?: string;
    };
}

export interface MusicianStats {
    received: number;
    closed: number;
    lost: number;
    revenue: number;
    commission: number;
}

export interface Analytics {
    funnel: { total: number; completedBot: number; assigned: number; closed: number; lost: number };
    monthly: Record<string, { new: number; closed: number; lost: number; revenue: number }>;
    services: Record<string, { count: number; closed: number; revenue: number }>;
    musicianPerformance: Array<{ name: string; received: number; closed: number; lost: number; revenue: number }>;
    revenue: { total: number; commission: number };
    lostReasons: Record<string, number>;
    conversionRate: number;
}

export interface FinanceSummaryItem {
    income: number;
    expenses: number;
    balance: number;
    cash_balance: number;
    bank_balance: number;
}

export interface BusinessContact {
    id: string;
    fields: {
        Name: string;
        Phone: string;
        Role?: string;
        Company?: string;
        Summary?: string;
        Lead_ID?: string;
        Created_At?: string;
    };
}
