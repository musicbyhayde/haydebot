# 🚀 HaydeBot — מדריך דיפלוי מלא

מדריך שלב-אחר-שלב להעלאת המערכת לייצור.

---

## 📋 דרישות מוקדמות

| שירות | כתובת | מה צריך |
|--------|--------|---------|
| **Supabase** | supabase.com | פרויקט + URL + Service Key |
| **DigitalOcean** | digitalocean.com | אימות אמצעי תשלום (App Platform $5/mo) |
| **Vercel** | vercel.com | חשבון חינמי/Pro |
| **Meta Developers** | developers.facebook.com | אפליקציית WhatsApp Business |
| **GitHub** | github.com | ריפו של HaydeBot |

---

## 1️⃣ הגדרת Supabase

### יצירת טבלאות

צור את הטבלאות הבאות ב-SQL Editor:

```sql
-- Leads
CREATE TABLE leads (
    id TEXT PRIMARY KEY,
    "Phone" TEXT NOT NULL,
    "Name" TEXT,
    "Status" TEXT DEFAULT 'New',
    "Conversation_State" TEXT DEFAULT 'START',
    "Service" TEXT,
    "Event_Date" TEXT,
    "Location" TEXT,
    "Guests" TEXT,
    "Owner" TEXT,
    "Last_Interaction" TIMESTAMPTZ,
    "Last_Summary" TEXT,
    "Closing_Amount" NUMERIC,
    "Lost_Reason" TEXT,
    "Bot_Mute_Until" TIMESTAMPTZ,
    "Musician_Assigned" TEXT[],
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Messages
CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    "Lead" TEXT[],
    "Musician" TEXT[],
    "Direction" TEXT NOT NULL,
    "Content" TEXT NOT NULL,
    "Media_URL" TEXT,
    "Media_Type" TEXT,
    "Timestamp" TIMESTAMPTZ NOT NULL,
    "Status" TEXT DEFAULT 'Sent',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Musicians
CREATE TABLE musicians (
    id TEXT PRIMARY KEY,
    "Name" TEXT NOT NULL,
    "Phone" TEXT NOT NULL,
    "Is_Active" BOOLEAN DEFAULT true,
    "Score" INTEGER DEFAULT 5,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Notes
CREATE TABLE notes (
    id TEXT PRIMARY KEY,
    "Lead_ID" TEXT NOT NULL,
    "Author" TEXT NOT NULL,
    "Content" TEXT NOT NULL,
    "File_URL" TEXT,
    "File_Name" TEXT,
    "Created_At" TIMESTAMPTZ DEFAULT now()
);

-- Finance
CREATE TABLE finance (
    id TEXT PRIMARY KEY,
    "Owner" TEXT NOT NULL,
    "Type" TEXT NOT NULL,
    "Date" TEXT NOT NULL,
    "Description" TEXT NOT NULL,
    "Event_Name" TEXT,
    "Musician" TEXT,
    "Amount" NUMERIC NOT NULL,
    "Payment_Status" TEXT DEFAULT 'לא שולם',
    "Lead_ID" TEXT,
    "Created_At" TIMESTAMPTZ DEFAULT now()
);
```

### יצירת Storage Bucket

1. לכו ל-**Storage** בסרגל הצדדי של Supabase
2. צרו bucket בשם **`media`**
3. הגדירו אותו כ-**Public**
4. ב-Policies, הוסיפו policy שמאפשר `INSERT` ו-`SELECT` לכל (עבור uploads ציבוריים)

### שמירת Credentials

ב-**Settings → API** ב-Supabase, שמרו:
- `SUPABASE_URL` — ה-Project URL
- `SUPABASE_KEY` — ה-`service_role` key (**לא** anon key)

---

## 2️⃣ דיפלוי Backend (DigitalOcean App Platform)

### חיבור הריפו

1. היכנסו ל-[digitalocean.com](https://cloud.digitalocean.com/apps) -> **Apps** -> **Create App**.
2. בחרו פריסה מ-**GitHub** וחברו את הריפו של HaydeBot.
3. במסך ההגדרות, בחרו את התיקייה הראשית (Root).
4. הגדרות (Settings):

| שדה | ערך |
|------|------|
| **Resource Type** | Web Service |
| **Size / Plan** | Basic - $5.00/mo (512MB RAM) |
| **Run Command** | `uvicorn app.main:app --host 0.0.0.0 --port 8080` |
| **HTTP Port** | 8080 (שנו את הפורט בפקודת הריצה ל-8080) |

### משתני סביבה (Environment Variables)

הגדירו ב-DigitalOcean (במסך Environment Variables בעת יצירת ה-App):

```
WHATSAPP_TOKEN=<your-token>
WHATSAPP_PHONE_NUMBER_ID=<your-phone-id>
WHATSAPP_VERIFY_TOKEN=<random-string-you-choose>
SUPABASE_URL=<your-supabase-url>
SUPABASE_KEY=<your-service-role-key>
GOOGLE_API_KEY=<your-gemini-api-key>

# Admin config
NOTIFICATION_NUMBERS=972544500529

# Error tracking via Email
SMTP_USER=musicbyhayde@gmail.com
SMTP_PASSWORD=<your-gmail-app-password>
NOTIFICATION_EMAIL=musicbyhayde+haydeBot@gmail.com
```

> [!IMPORTANT]
> ⚠️ **אל תוסיפו משתנים שלא מוגדרים ב-config.py!** ה-Settings מוגדר עם `extra = "forbid"` ויזרוק שגיאה.

### בדיקת דיפלוי

לאחר שה-build עובר, תקבלו דומיין מ-DigitalOcean (למשל `haydebot-api-abcde.ondigitalocean.app`).
כנסו אליו ובדקו:
```
https://haydebot-api-<random-id>.ondigitalocean.app/
→ {"message": "HaydeBot is running", "status": "ok"}
```

---

## 3️⃣ דיפלוי Frontend (Vercel)

### חיבור הריפו

1. היכנסו ל-[vercel.com](https://vercel.com) → **Add New → Project**
2. בחרו את ה-GitHub repo
3. הגדרות:

| שדה | ערך |
|------|------|
| **Root Directory** | `frontend` |
| **Framework Preset** | Next.js |
| **Build Command** | `next build` |
| **Output Directory** | `.next` |

### משתני סביבה

הגדירו ב-Vercel Dashboard → Settings → Environment Variables:

```
NEXT_PUBLIC_API_URL=https://haydebot-api-<random-id>.ondigitalocean.app/api/v1
NEXT_PUBLIC_SUPABASE_URL=<your-supabase-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
```

> [!NOTE]
> ה-`NEXT_PUBLIC_SUPABASE_ANON_KEY` כאן הוא ה-**anon key** ולא ה-service_role (זה לצד הלקוח).

### הגדרת דומיין

1. ב-Vercel → Settings → Domains
2. הוסיפו את הדומיין שלכם או השתמשו ב-subdomain של Vercel
3. עדכנו DNS ב-Registrar

---

## 4️⃣ חיבור WhatsApp Webhook

### ב-Meta Developers Console

1. כנסו ל-[developers.facebook.com](https://developers.facebook.com)
2. בחרו את האפליקציה → **WhatsApp → Configuration**
3. ב-**Webhook URL** הזינו:
   ```
   https://haydebot-api-<random-id>.ondigitalocean.app/api/v1/webhook
   ```
4. ב-**Verify Token** הזינו את אותו `WHATSAPP_VERIFY_TOKEN` שהגדרתם ב-DigitalOcean
5. לחצו **Verify and Save**
6. ב-**Webhook Fields**, סמנו ✅ על `messages`

> [!CAUTION]
> אחרי שמפעילים את ה-webhook, כל הודעה נכנסת תגיע ל-bot! וודאו שהכל עובד לפני שמפרסמים את המספר.

---

## 5️⃣ CORS — הגדרת Production

ב-`app/main.py`, עדכנו את ה-CORS origins לדומיין האמיתי:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://your-domain.vercel.app",
        "https://your-custom-domain.com",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

## 6️⃣ פיתוח מקומי (Ngrok)

לבדיקת webhook מקומי:

```bash
# טרמינל 1 — Backend
cd /Users/ilanziv/Code/HaydeBot
uvicorn app.main:app --reload --port 8000

# טרמינל 2 — Frontend
cd frontend && npm run dev

# טרמינל 3 — Ngrok tunnel
ngrok http 8000
```

העתיקו את ה-URL שקיבלתם (למשל `https://abc123.ngrok.io`) ועדכנו אותו כ-webhook URL אצל Meta.

---

## ✅ צ'קליסט Go-Live

- [ ] Supabase טבלאות נוצרו ובאקט `media` קיים
- [ ] Backend רץ ב-DigitalOcean App Platform ומחזיר `{"status": "ok"}`
- [ ] Frontend רץ ב-Vercel ומציג את הדאשבורד
- [ ] משתני סביבה מוגדרים נכון (backend + frontend)
- [ ] CORS מעודכן לדומיין אמיתי (לא `*`)
- [ ] Webhook מאומת ומקבל הודעות
- [ ] `messages` webhook field מסומן ב-Meta Console
- [ ] מספר WhatsApp מחובר ומאומת
- [ ] הוספת משתמשים ב-Supabase Auth (אילן + קובי)
- [ ] בדיקה: שליחת הודעה → ליד חדש נוצר → הודעה מוצגת בדאשבורד

---

## 🔄 עדכונים עתידיים

לאחר push לריפו:
- **DigitalOcean** — יזהה את ה-commit ויבנה מחדש אוטומטית (auto-deploy)
- **Vercel** — יעשה build מחדש אוטומטית (auto-deploy)

לבדיקה לפני push:
```bash
# Backend tests
cd /Users/ilanziv/Code/HaydeBot && python3 -m pytest tests/ -v

# Frontend tests
cd frontend && npx jest --verbose

# Frontend build
cd frontend && npx next build
```
