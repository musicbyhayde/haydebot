import os
from dotenv import load_dotenv
from pyairtable import Api

load_dotenv()

token = os.getenv("AIRTABLE_TOKEN")
base_id = os.getenv("AIRTABLE_BASE_ID")
api = Api(token)
table = api.table(base_id, "Leads")
records = table.all()
for r in records:
    print(f"ID: {r['id']}, Phone: {r['fields'].get('Phone')}, Status: {r['fields'].get('Status')}, State: {r['fields'].get('Conversation_State')}, Location: {r['fields'].get('Location')}, Guests: {r['fields'].get('Guests')}")
