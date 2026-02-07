import os
from dotenv import load_dotenv
from pyairtable import Api

load_dotenv()

token = os.getenv("AIRTABLE_TOKEN")
base_id = os.getenv("AIRTABLE_BASE_ID")
api = Api(token)
table = api.table(base_id, "Messages")
records = table.all()
print(f"Grand total of messages: {len(records)}")
for r in records[:5]:
    print(r['fields'])
