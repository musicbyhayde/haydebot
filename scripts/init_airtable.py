import requests
import sys
import os

import requests
import sys
import os
from dotenv import load_dotenv

# Try to load .env, otherwise .env.example
load_dotenv(".env")
load_dotenv(".env.example") # Fallback if .env missing

AIRTABLE_TOKEN = os.getenv("AIRTABLE_TOKEN")
AIRTABLE_BASE_ID = os.getenv("AIRTABLE_BASE_ID")

if not AIRTABLE_TOKEN or not AIRTABLE_BASE_ID:
    print("❌ Error: AIRTABLE_TOKEN or AIRTABLE_BASE_ID not found in .env or .env.example")
    sys.exit(1)

BASE_URL = f"https://api.airtable.com/v0/meta/bases/{AIRTABLE_BASE_ID}/tables"
HEADERS = {
    "Authorization": f"Bearer {AIRTABLE_TOKEN}",
    "Content-Type": "application/json"
}

def create_table(name: str, fields: list, description: str = ""):
    print(f"Creating table '{name}'...")
    payload = {
        "name": name,
        "description": description,
        "fields": fields
    }
    response = requests.post(BASE_URL, json=payload, headers=HEADERS)
    if response.status_code == 200:
        print(f"✅ Table '{name}' created successfully!")
        return response.json()
    else:
        print(f"❌ Failed to create table '{name}'. Status: {response.status_code}")
        print(f"Response: {response.text}")
        return None

def get_existing_tables():
    response = requests.get(BASE_URL, headers=HEADERS)
    if response.status_code == 200:
        return {t['name']: t for t in response.json().get('tables', [])}
    return {}

def create_field(table_id: str, field_def: dict):
    url = f"https://api.airtable.com/v0/meta/bases/{AIRTABLE_BASE_ID}/tables/{table_id}/fields"
    print(f"Creating field '{field_def['name']}' in table {table_id}...")
    response = requests.post(url, json=field_def, headers=HEADERS)
    if response.status_code == 200:
        print(f"✅ Field '{field_def['name']}' created successfully!")
    else:
        print(f"❌ Failed to create field '{field_def['name']}'. Status: {response.status_code}")
        print(f"Response: {response.text}")

def sync_fields(table_obj: dict, expected_fields: list):
    table_id = table_obj["id"]
    current_field_names = {f["name"] for f in table_obj.get("fields", [])}
    
    for field in expected_fields:
        if field["name"] not in current_field_names:
             create_field(table_id, field)
        else:
            pass

def main():
    print("🚀 Starting Airtable Schema Setup...")
    
    existing_tables = get_existing_tables()
    musicians_table_obj = existing_tables.get("Musicians")
    musicians_table_id = musicians_table_obj["id"] if musicians_table_obj else None

    # 1. Create Musicians Table if not exists
    musicians_fields = [
        {"name": "Name", "type": "singleLineText"}, # Primary
        {"name": "Phone", "type": "singleLineText"},
        {"name": "Is_Favorite", "type": "checkbox", "options": {"icon": "check", "color": "greenBright"}},
        {"name": "Is_Active", "type": "checkbox", "options": {"icon": "check", "color": "greenBright"}},
        {"name": "Score", "type": "number", "options": {"precision": 0}}
    ]

    if not musicians_table_id:
        musicians_table = create_table("Musicians", musicians_fields, "Table of musicians available for events.")
        if musicians_table:
            musicians_table_id = musicians_table["id"]
        else:
            print("⚠️ Stopping due to Musicians table creation failure.")
            return
    else:
        print(f"ℹ️ Musicians table already exists ({musicians_table_id}). Checking fields...")
        sync_fields(musicians_table_obj, musicians_fields)

    # 2. Create Leads Table if not exists
    lead_fields = [
        {"name": "Phone", "type": "singleLineText"}, # Primary
        {"name": "Name", "type": "singleLineText"},
        {
            "name": "Status", 
            "type": "singleSelect", 
            "options": {
                "choices": [
                    {"name": "New"},
                    {"name": "Processing"},
                    {"name": "Distributed"},
                    {"name": "Assigned"},
                    {"name": "Manual"},
                    {"name": "Closed"},
                    {"name": "Lost"}
                ]
            }
        },
        {"name": "Service", "type": "singleLineText"},
        {"name": "Event_Date", "type": "singleLineText"},
        {"name": "Location", "type": "singleLineText"},
        {"name": "Guests", "type": "singleLineText"},
        {"name": "Bot_Mute_Until", "type": "dateTime", "options": {"timeZone": "Asia/Jerusalem", "dateFormat": {"name": "local"}, "timeFormat": {"name": "24hour"}}},
        {
            "name": "Conversation_State", 
            "type": "singleSelect", 
            "options": {
                "choices": [
                    {"name": "START"},
                    {"name": "AWAITING_SERVICE"},
                    {"name": "AWAITING_DATE"},
                    {"name": "AWAITING_LOCATION"},
                    {"name": "AWAITING_GUESTS"},
                    {"name": "COMPLETED"}
                ]
            }
        },
        {"name": "Last_Interaction", "type": "dateTime", "options": {"timeZone": "Asia/Jerusalem", "dateFormat": {"name": "local"}, "timeFormat": {"name": "24hour"}}},
        {"name": "Last_Summary", "type": "multilineText"},
        {
            "name": "Musician_Assigned",
            "type": "multipleRecordLinks",
            "options": {
                "linkedTableId": musicians_table_id
            }
        }
    ]

    leads_table_obj = existing_tables.get("Leads")
    if leads_table_obj:
        print(f"ℹ️ Leads table already exists. Checking fields...")
        sync_fields(leads_table_obj, lead_fields)
        # return removed to allow proceeding to Messages

    create_table("Leads", lead_fields, "Table of leads/events.")

    # 3. Create Messages Table if not exists
    message_fields = [
        {"name": "Lead", "type": "multipleRecordLinks", "options": {"linkedTableId": leads_table_obj["id"] if leads_table_obj else None}}, # Will link dynamically if possible, or fail if we don't have ID. 
        # Actually proper way:
        # We need the ID of 'Leads' table.
    ]
    
    # Correction: We need to fetch 'Leads' ID properly if we just created it or if it existed.
    # Refetch all just in case
    existing_tables = get_existing_tables()
    leads_table_id = existing_tables.get("Leads", {}).get("id")

    if not leads_table_id:
        print("⚠️ Leads table not found, skipping Messages table creation.")
        return

    message_fields = [
        # Primary Field: Must be text/number/date. Let's use "ID" (WhatsApp ID or Auto).
        {"name": "ID", "type": "singleLineText"}, 
        {
             "name": "Lead", 
             "type": "multipleRecordLinks", 
             "options": {"linkedTableId": leads_table_id}
        },
        {
             "name": "Musician", 
             "type": "multipleRecordLinks", 
             "options": {"linkedTableId": musicians_table_id}
        },
        {
            "name": "Direction", 
            "type": "singleSelect", 
            "options": {"choices": [{"name": "Inbound", "color": "greenBright"}, {"name": "Outbound", "color": "blueBright"}]}
        },
        {"name": "Content", "type": "multilineText"},
        {"name": "Timestamp", "type": "dateTime", "options": {"timeZone": "Asia/Jerusalem", "dateFormat": {"name": "local"}, "timeFormat": {"name": "24hour"}}},
        {"name": "Status", "type": "singleSelect", "options": {"choices": [{"name": "Sent"}, {"name": "Delivered"}, {"name": "Read"}, {"name": "Failed"}]}},
        # WhatsApp_ID is now redundancy if we use ID as primary, but let's keep it or map it.
        # Actually let's just map WhatsApp_ID to the primary 'ID' field in logic.
    ]

    messages_table_obj = existing_tables.get("Messages")
    if messages_table_obj:
        print(f"ℹ️ Messages table already exists. Checking fields...")
        sync_fields(messages_table_obj, message_fields)
        return
    
    create_table("Messages", message_fields, "Table of all chat messages.")

if __name__ == "__main__":
    main()
