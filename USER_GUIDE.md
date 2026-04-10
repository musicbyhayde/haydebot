# HaydeBot: Google Calendar & Lead Management User Guide

Welcome to the enhanced HaydeBot experience! This guide explains how to use the new Google Calendar synchronization and physical lead deletion features.

---

## 1. Google Calendar Integration 📅

The system is now fully integrated with your personal Google account. It can create events, update them live, and send invitations to musicians.

### Creating an Event
When you are ready to book a lead:
1.  Open the **Lead Detail Panel**.
2.  In the **Admin Actions** section, click **צור אירוע ביומן**.
3.  **Preview Modal**: A window will pop up showing the event details (Title, Location, Date).
4.  **Edit**: You can edit any of these fields or the description before confirming.
5.  **Invite**: Once confirmed, the bot creates the event and sends invitations to all musicians in the "Musician Team".

### Stay in Sync (Amber Button)
If you change a lead's **Name**, **Location**, or **Date**, the system checks if a calendar event already exists.
- If it detects a difference, the calendar button will turn **Amber** and say **"עדכן יומן (שינוי זוהה)"**.
- Clicking it allows you to sync the new lead info to the existing Google Calendar event instantly.

### Deleting Events
- Use the **מחק מהיומן** button to remove an event from Google without deleting the lead from HaydeBot.

---

## 2. Lead Deletion 🗑️

We have added a physical **Delete Lead** feature for cases where you need to completely remove a record from the database.

1.  Click **מחק ליד** in the Admin Actions section.
2.  **Double Confirmation**: You will be asked twice to confirm, as this action is permanent.
3.  **Sync Check**: The system will detect if the lead has a Google Calendar event and ask: *"Do you want to delete the calendar event too?"*
    - **OK**: Deletes lead + deletes Google event.
    - **Cancel**: Deletes lead only.

---

## 3. Privacy & Security 🔒

- **Musicians**: They only see what is in the event you previewed.
- **Sensitive Data**: Internal **Notes**, **Finance** records, and **Chat history** are strictly excluded from the calendar event description.

---

## 4. Technical Configuration (For Admins) ⚙️

The system uses OAuth 2.0 for permanent, "deployment-proof" connectivity. The following variables must be set in your `.env`:
- `G_CLIENT_ID`
- `G_CLIENT_SECRET`
- `G_REFRESH_TOKEN`

---

*Enjoy a smoother, more automated workflow with HaydeBot!*
