# Environment Variables Guide

This guide explains where to find every value needed for your `.env` file.

---

## 1. WhatsApp (Meta Developers)

### **WHATSAPP_PHONE_NUMBER_ID**
1.  Go to the [Meta Developers Dashboard](https://developers.facebook.com/).
2.  Select your App.
3.  In the left sidebar, go to **WhatsApp > API Setup**.
4.  Under "Step 1: Select phone numbers", look for the **Phone number ID**. It is a 15-16 digit number.

### **WHATSAPP_TOKEN (Permanent Token)**
*Don't use the "Temporary Access Token" on the API Setup page; it expires in 24 hours.*
1.  Go to [Business Settings](https://business.facebook.com/settings).
2.  Go to **Users > System Users**.
3.  Click **Add**, name it "HaydeBot", and choose **Admin** role.
4.  Click **Add Assets**:
    -   Select **Apps** -> Your App Name -> Toggle on **Full Control**.
5.  Click **Generate New Token**:
    -   Select your App.
    -   Set Expiration to **Permanent** (or "Never").
    -   Check these permissions: `whatsapp_business_messaging` and `whatsapp_business_management`.
6.  Copy the generated token immediately.

### **WHATSAPP_VERIFY_TOKEN**
-   **You create this yourself.**
-   It can be any string (e.g., `hayde_verify_123`).
-   You will need to enter this exact string later in the Meta Dashboard when you configure the **Webhook**.

---

## 2. Airtable

### **AIRTABLE_TOKEN (Personal Access Token)**
1.  Go to your [Airtable Account Settings](https://airtable.com/account).
2.  Click on **Create new token**.
3.  Name it "HaydeBot Token".
4.  Add these **Scopes**:
    -   `data.records:read`
    -   `data.records:write`
    -   `schema.bases:read`
5.  Add **Access**: Select the specific base for HaydeBot (or "All current and future bases").
6.  Copy the token (starts with `pat...`).

### **AIRTABLE_BASE_ID**
1.  Open your Airtable base in the browser.
2.  Look at the URL. It looks like: `https://airtable.com/appXXXXXXXXXXXXXX/tbl...`
3.  The ID starting with **`app...`** is your Base ID.

---

## 3. Google Gemini (AI)

### **GOOGLE_API_KEY**
1.  Go to [Google AI Studio](https://aistudio.google.com/).
2.  Click on **Get API key** in the left sidebar.
3.  Click **Create API key in new project**.
4.  Copy the key (starts with `AIza...`).

---

## Summary Checklist
| Variable | Source | Example |
| :--- | :--- | :--- |
| `WHATSAPP_TOKEN` | Meta Business Settings | `EAAG...` |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta API Setup | `1013868231801880` |
| `WHATSAPP_VERIFY_TOKEN` | Your Choice | `my_secret_code` |
| `AIRTABLE_TOKEN` | Airtable Account | `pat.XXXXXXXX` |
| `AIRTABLE_BASE_ID` | Airtable URL | `appXXXXXXXX` |
| `GOOGLE_API_KEY` | Google AI Studio | `AIzaSy...` |
