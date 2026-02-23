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
        Is_Favorite?: boolean;
        Is_Active?: boolean;
        Score?: number;
    };
}
