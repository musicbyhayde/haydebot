# 🚀 HaydeBot: The "Dummy-Proof" Setup Guide

Follow this guide step-by-step. Do not skip anything!

---

## 🛑 3 CRITICAL RULES (Read these first!)
1.  **THE PATH**: Whenever Meta asks for a "Callback URL", it **MUST** end with `/api/v1/webhook`. 
    *   ❌ Wrong: `https://abcd.ngrok-free.app`
    *   ✅ Right: `https://abcd.ngrok-free.app/api/v1/webhook`
2.  **THE TOKEN**: Use only the "Permanent Token" (System User). The "Temporary Token" in the dashboard dies after 24 hours.
3.  **THE FOLDER**: Your dashboard (Frontend) is in the `frontend` folder. You must `cd frontend` before running it.

---

## Step 1: Prepare Airtable (The Brain)
1.  **Get your Token**: [Click here](https://airtable.com/create/tokens) -> Create Token.
    *   **Scopes**: Add `data.records:read`, `data.records:write`, `schema.bases:read`.
    *   **Access**: Select your HaydeBot base.
2.  **Get your Base ID**: Open your [Airtable Base](https://airtable.com/). Look at the URL; copy the part that starts with `app...`.
3.  **Setup the Tables**: Open your terminal in the main folder and run:
    ```bash
    python3 scripts/init_airtable.py
    ```
    *Check your Airtable; you should see "Leads", "Musicians", and "Messages" tables.*

---

## Step 2: Setup Meta & WhatsApp (The Phone)
1.  **App Setup**: Go to [Meta Apps](https://developers.facebook.com/apps) -> Create a "Business" app.
2.  **Add WhatsApp**: Click "Set Up" on the WhatsApp card.
3.  **Verify Number**: Go to [API Setup](https://developers.facebook.com/apps/YOUR_APP_ID/whatsapp-business/api-setup/).
    *   Add your real number. 
    *   **PRO TIP**: Choose **"Voice Call"** to get the code. SMS rarely works for virtual numbers.
4.  **Create Permanent Token**: 
    *   Go to [System Users](https://business.facebook.com/settings/system-users).
    *   Add "HaydeBot" as Admin.
    *   Click **Add Assets** -> Select your App -> Enable **Full Control**.
    *   Click **Generate Token** -> Select `whatsapp_business_messaging`. Copy this!

---

## Step 3: Connect your Local Environment
1.  **The `.env` file**: Open the file named `.env` in VS Code.
2.  **Fill it**: Paste your keys from Step 1 and 2.
3.  **Verify Token**: Create a random password for yourself (e.g. `my_secret_bot_123`) and put it in `WHATSAPP_VERIFY_TOKEN`.
4.  **Test connection**: Run `uvicorn app.main:app --reload`. If it says "Application startup complete", you are good!

---

## Step 4: Live Local Testing (The "Ngrok" Part)
*Use this to test the bot without paying for hosting yet.*
1.  **In Terminal 1**: Run `uvicorn app.main:app --reload`
2.  **In Terminal 2**: Run `ngrok http 8000`
3.  **The URL**: Copy the `https://...` link ngrok gives you.
4.  **Tell Meta**: Go to [WhatsApp Configuration](https://developers.facebook.com/apps/YOUR_APP_ID/whatsapp-business/configuration/).
    *   **Callback URL**: Paste your ngrok link + `/api/v1/webhook`
    *   **Verify Token**: Paste the random password you made in Step 3.
5.  **SUBSCRIBE**: Under "Webhook Fields", click Manage -> Check **messages**. (If you forget this, the bot won't reply!)

---

## Step 5: The Dashboard (Inbox)
1.  Open a new terminal.
2.  Type: `cd frontend`
3.  Type: `npm run dev`
4.  Open `http://localhost:3000` in your browser.
    *You can now see your leads and reply to them from your computer!*

---

## 🛠 Troubleshooting (If things go wrong)
*   **"Address already in use"**: Your server is stuck. Run: `lsof -ti:8000 | xargs kill -9` then try again.
*   **"Verify Token failed"**: Check if your server is running and that your URL ends in `/api/v1/webhook`.
*   **Bot doesn't reply**: Did you hit "Manage" and check the "messages" box in the Meta Webhook settings?
