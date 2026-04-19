import os
from dotenv import load_dotenv

load_dotenv('.env.local')

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

client_id = os.getenv('G_CLIENT_ID')
client_secret = os.getenv('G_CLIENT_SECRET')
refresh_token = os.getenv('G_REFRESH_TOKEN')

if client_id and client_secret and refresh_token:
    print("Found credentials, attempting to refresh token...")
    try:
        creds = Credentials(
            token=None,
            refresh_token=refresh_token,
            token_uri="https://oauth2.googleapis.com/token",
            client_id=client_id,
            client_secret=client_secret,
            scopes=['https://www.googleapis.com/auth/calendar']
        )
        creds.refresh(Request())
        print("Success! Token is valid.")
    except Exception as e:
        print(f"Failed to authenticate: {e}")
else:
    print("Missing one or more credentials.")
