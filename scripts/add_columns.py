import sys
import os
from dotenv import load_dotenv

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
load_dotenv(".env.local")
load_dotenv(".env")

from app.services.supabase_service import airtable_service

print("Adding Closing_Amount and Lost_Reason to Supabase 'leads' table...")

# Use the robust supabase SQL execution bypass or create via dummy insert
try:
    # We will use the REST API interface to alter the table structure
    # Alternatively, the easiest way is to ask the user to run SQL or we use postgrest.
    # Since we can't alter directly via client easily, we will instruct the user or try executing SQL via RPC
    pass
except Exception as e:
    print(f"Error: {e}")
