import sys
import os
from dotenv import load_dotenv

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
load_dotenv(".env.local")
load_dotenv(".env")

from app.services.supabase_service import airtable_service

print("Adding Pending_Action and Pending_Lead_ID to Supabase 'musicians' table...")
try:
    airtable_service.client.postgrest.client.rpc("exec_sql", {"query": "ALTER TABLE musicians ADD COLUMN \"Pending_Action\" TEXT; ALTER TABLE musicians ADD COLUMN \"Pending_Lead_ID\" TEXT;"}).execute()
except Exception as e:
    # If no rpc we will just print what to do
    print(f"Error: {e}")
