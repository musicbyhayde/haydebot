import requests
import os
from dotenv import load_dotenv

load_dotenv(".env")

AIRTABLE_TOKEN = os.getenv("AIRTABLE_TOKEN")
AIRTABLE_BASE_ID = os.getenv("AIRTABLE_BASE_ID")

def update_service_field():
    # 1. Get Tables to find Leads ID and Service Field ID
    url = f"https://api.airtable.com/v0/meta/bases/{AIRTABLE_BASE_ID}/tables"
    headers = {"Authorization": f"Bearer {AIRTABLE_TOKEN}"}
    
    response = requests.get(url, headers=headers)
    tables = response.json().get("tables", [])
    
    leads_table = next((t for t in tables if t["name"] == "Leads"), None)
    if not leads_table:
        print("Leads table not found")
        return

    service_field = next((f for f in leads_table["fields"] if f["name"] == "Service"), None)
    if not service_field:
        print("Service field not found")
        return

    # 2. Update the field type to singleLineText (more flexible)
    field_id = service_field["id"]
    update_url = f"https://api.airtable.com/v0/meta/bases/{AIRTABLE_BASE_ID}/tables/{leads_table['id']}/fields/{field_id}"
    
    payload = {
        "type": "singleLineText"
    }
    
    update_res = requests.patch(update_url, json=payload, headers=headers)
    if update_res.status_code == 200:
        print("✅ Service field options updated successfully!")
    else:
        print(f"❌ Failed to update field. Status: {update_res.status_code}")
        print(update_res.text)

if __name__ == "__main__":
    update_service_field()
