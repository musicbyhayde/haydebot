# אינטגרציית לידים מ-Facebook Lead Ads (טפסים מידיים)

## רקע עדכני

הבהרת שהלידים מגיעים מ**טפסים מידיים של מטא (Lead Generation Ads)** ושב-99% מהמקרים הלקוח משאיר את מספר הטלפון שלו בטופס. הבעיה היא שהם ממלאים את הטופס, אבל לא לוחצים על הלינק בסוף כדי לעבור לווטסאפ, וכך הם מתפספסים בדשבורד.

**המטרה**: לתפוס את הליד **ברגע שהוא מגיש את הטופס בפייסבוק**, לשאוב את הפרטים שלו (שם וטלפון) מה-Graph API של מטא, ליצור אותו במערכת, ולמנוע כפילויות במקרה שהוא כן המשיך לווטסאפ. בנוסף, נוכל לשלוח לו הודעת וואטסאפ יזומה כדי להתחיל את התשאול.

---

## אסטרטגיית פעולה וזיהוי כפילויות

בניגוד למסנג׳ר, כאן יש לנו את מספר הטלפון באופן מיידי!
התהליך יעבוד כך:
1. פייסבוק שולח Webhook מסוג `leadgen` ברגע שלקוח מגיש טופס.
2. השרת שלנו מקבל `leadgen_id` ופונה ל-Graph API של מטא כדי למשוך את פרטי הטופס (שם וטלפון).
3. **בדיקת כפילויות (Deduplication)** מבוססת טלפון:
   - **אם הטלפון כבר קיים במערכת (ליד פעיל):** אין צורך ליצור ליד חדש. רק נוסיף הערה/לוג (Activity) שהלקוח הגיש טופס פייסבוק.
   - **אם הטלפון לא קיים:** ניצור ליד חדש בסטטוס `New` עם `Lead_Source = "Facebook Form"`.
4. **יצירת קשר יזום (Outbound):** מכיוון שיש לנו ליד חדש עם מספר טלפון שלא פנה אלינו, נוכל (אופציונלי, לבחירתך) לשלוח לו הודעת טמפלט בוואטסאפ כדי להתחיל את השיחה או פשוט להשאיר אותו בדשבורד לטיפול ידני של נציג.

---

## User Review Required

> [!WARNING]
> ### דרישות ב-Meta App Dashboard (נדרש ביצוע ידני)
> כדי שהאינטגרציה תעבוד, יש להגדיר את הדברים הבאים באפליקציה במטא:
> 1. **Page Access Token**: יש לייצר טוקן (עם הרשאות `leads_retrieval`, `pages_show_list`, `pages_manage_ads`).
> 2. **Webhooks Setup**: חיבור הדף העסקי ל-Webhook שלנו, הרשמה ל-field שנקרא `leadgen`.
> 3. האפליקציה במטא צריכה לעבור **App Review** להרשאת `leads_retrieval` אם זה חשבון שלא שייך לאותו Business Manager, אבל לרוב לשימוש פנימי זה לא חובה אם המשתמש הוא מנהל הדף.
>
> **שאלה 1:** האם יש לך גישת מנהל לאפליקציה במטא ולדף הפייסבוק/אינסטגרם הרלוונטי כדי לבצע את ההגדרות האלו?

> [!IMPORTANT]
> ### איך לטפל בליד פייסבוק חדש?
> כאשר נכנס ליד חדש מפייסבוק (ולא שלח הודעה בוואטסאפ לבד), מה תרצה שיקרה?
> **אופציה א':** הבוט שולח לו הודעת WhatsApp יזומה (טמפלט) שמתחילה את התשאול (למשל: "היי [שם], ראינו שהשארת פרטים בפייסבוק! איזה אירוע מתוכנן?"). *דורש אישור תבנית מול Meta WhatsApp.*
> **אופציה ב':** הליד נוצר בדשבורד בסטטוס New, אדמין מקבל התראה (SMS/Email), ונציג מטפל בו ידנית או שולח לו הודעה דרך הפאנל.
> 
> **שאלה 2:** באיזו אופציה אתה מעדיף לבחור כרגע?

---

## Open Questions

1. **מבנה הטופס:** מה השמות המדויקים של השדות בטופס הלידים שלך בפייסבוק? (לרוב זה `full_name` ו-`phone_number`, אבל כדאי לוודא שאין שדות מותאמים אישית שנרצה למשוך, כמו תאריך אירוע אם הם ממלאים שם).
2. **Page ID:** נצטרך את מזהה דף הפייסבוק לטובת ה-API.
3. **הודעה יזומה (WhatsApp Template):** אם נבחר באופציה א', נצטרך לאשר תבנית וואטסאפ (Template) ייעודית לפנייה ללידים חדשים. האם יש לך תבנית קיימת שמתאימה (למשל `customer_warming_intro` שכבר קיימת בקוד)?

---

## Proposed Changes

### 1. Database Schema

#### [MODIFY] Supabase SQL (Migrations)
הוספת שדה מקור לליד לזיהוי בדשבורד:
```sql
ALTER TABLE leads ADD COLUMN IF NOT EXISTS "Lead_Source" TEXT DEFAULT 'WhatsApp';
```
*(נאפשר ערכים כמו `"WhatsApp"`, `"Facebook Form"`, `"Manual"`).*

### 2. Backend — Models & Config

#### [MODIFY] [schemas.py](file:///Users/ilanziv/Code/HaydeBot/app/models/schemas.py)
עדכון `LeadBase` עם השדה החדש:
```python
lead_source: Optional[str] = Field("WhatsApp", alias="Lead_Source")
```

#### [MODIFY] [config.py](file:///Users/ilanziv/Code/HaydeBot/app/core/config.py)
הוספת משתני סביבה לפייסבוק:
```python
FACEBOOK_PAGE_ACCESS_TOKEN: Optional[str] = None
```

### 3. Backend — Facebook API Service

#### [NEW] [app/services/facebook.py](file:///Users/ilanziv/Code/HaydeBot/app/services/facebook.py)
שירות ייעודי לתקשורת עם Facebook Graph API לשליפת פרטי הליד.
```python
import requests
from app.core.config import get_settings

class FacebookService:
    def __init__(self):
        self.token = get_settings().FACEBOOK_PAGE_ACCESS_TOKEN
        self.api_url = "https://graph.facebook.com/v20.0"

    def get_lead_details(self, leadgen_id: str) -> dict:
        """Fetch lead data from Facebook using leadgen_id"""
        url = f"{self.api_url}/{leadgen_id}"
        params = {"access_token": self.token}
        response = requests.get(url, params=params)
        response.raise_for_status()
        
        # Parse field_data array into a simple key-value dict
        data = response.json()
        lead_info = {}
        for field in data.get("field_data", []):
            lead_info[field["name"]] = field["values"][0] if field["values"] else ""
            
        return lead_info
```

### 4. Backend — Webhook Handler

#### [MODIFY] [routes.py](file:///Users/ilanziv/Code/HaydeBot/app/api/routes.py)
ניתוב ה-webhook payload:
```python
@public_router.post("/webhook")
async def receive_webhook(request: Request, background_tasks: BackgroundTasks):
    body = await request.json()
    obj_type = body.get("object")
    
    if obj_type == "whatsapp_business_account":
        background_tasks.add_task(bot_logic.process_webhook, body)
    elif obj_type == "page":
        # Meta Lead Ads Webhook
        background_tasks.add_task(bot_logic.process_facebook_leadgen, body)
        
    return {"status": "received"}
```

### 5. Backend — Business Logic & Deduplication

#### [MODIFY] [logic.py](file:///Users/ilanziv/Code/HaydeBot/app/services/logic.py)
הוספת הלוגיקה לעיבוד הליד מפייסבוק:

```python
async def process_facebook_leadgen(self, body: dict):
    for entry in body.get("entry", []):
        for change in entry.get("changes", []):
            if change.get("field") == "leadgen":
                leadgen_id = change.get("value", {}).get("leadgen_id")
                if leadgen_id:
                    await self.handle_new_facebook_lead(leadgen_id)

async def handle_new_facebook_lead(self, leadgen_id: str):
    # 1. משיכת נתונים מפייסבוק
    lead_data = facebook_service.get_lead_details(leadgen_id)
    raw_phone = lead_data.get("phone_number", "")
    name = lead_data.get("full_name", "ליד פייסבוק")
    
    if not raw_phone:
        print("Leadgen without phone number, ignoring.")
        return
        
    phone = self._normalize_phone(raw_phone)
    
    # 2. זיהוי כפילויות (Deduplication)
    existing_lead = airtable_service.get_active_lead_by_phone(phone)
    
    if existing_lead:
        # הלקוח כבר קיים (אולי פנה לבד בוואטסאפ או שהוא מאירוע קודם פעיל)
        airtable_service.create_activity(ActivityCreate(
            actor="מערכת",
            action_type="הגשת טופס",
            description="הלקוח הגיש גם טופס לידים בפייסבוק/אינסטגרם.",
            lead_id=existing_lead["id"]
        ))
        return
        
    # 3. יצירת ליד חדש
    new_lead_data = LeadCreate(
        phone=phone,
        name=name,
        lead_source="Facebook Form",
        status=LeadStatus.NEW,
        conversation_state=ConversationState.START,
        last_interaction=datetime.now()
    )
    new_lead = airtable_service.create_lead(new_lead_data)
    
    # 4. נוטיפיקציה ו/או פעולה אקטיבית
    await self.notify_admins_new_arrival(phone, name, source="Facebook Form")
    
    # (תלוי בתשובה לשאלה 2 ב-User Review) 
    # ניתן כאן לשגר טמפלט ווטסאפ באופן אוטומטי.
```

### 6. Frontend — UI Updates

#### [MODIFY] [LeadsDashboard.tsx](file:///Users/ilanziv/Code/HaydeBot/frontend/components/LeadsDashboard.tsx)
- הוספת אינדיקציה חזותית ליד הליד המראה מאיפה הוא הגיע (אייקון פייסבוק כחול מול וואטסאפ ירוק).

#### [MODIFY] [LeadDetailPanel.tsx](file:///Users/ilanziv/Code/HaydeBot/frontend/components/LeadDetailPanel.tsx)
- תצוגה של מקור הליד באזור פרטי הלקוח העליון.

---

## Verification Plan

1. **Unit Tests (Backend):** 
   - יצירת mock ל-Facebook API ושליחת Webhook פנימי לניסוי יצירת הליד.
   - בדיקת זיהוי הטלפון (Deduplication) — וידוא שאם מזינים טלפון בפורמטים שונים שמתאימים לליד קיים (למשל `+972541234567` מול `0541234567`), המערכת תזהה ולא תיצור כפילות.
2. **Facebook Setup & Testing:**
   - שימוש ב-[Lead Ads Testing Tool](https://developers.facebook.com/tools/lead-ads-testing) של מטא כדי לשלוח טופס פיקטיבי ישירות לשרת.
   - וידוא שהליד מופיע בדשבורד עם Source של Facebook.
   - אם מוגדרת שליחת הודעה אוטומטית, וידוא קבלת התבנית לטלפון הפיקטיבי/האישי.
