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
        Bot_Mute_Until?: string;
        Last_Read_At?: string;
    };
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
    };
}

export interface Activity {
    id: string;
    fields: {
        actor: string;
        action_type: string;
        description: string;
        lead_id?: string;
        created_at: string;
    };
}
