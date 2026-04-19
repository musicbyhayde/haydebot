import os
from supabase import create_client

from app.core.config import get_settings
settings = get_settings()

client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
try:
    res = client.storage.from_("media").upload("test.txt", b"hello world")
    print("Success:", res)
except Exception as e:
    print("Exception:", str(e), type(e))

