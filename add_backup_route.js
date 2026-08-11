const fs = require('fs');
const path = '/Users/ilanziv/Code/HaydeBot/app/api/routes.py';
let content = fs.readFileSync(path, 'utf8');

const backupCode = `
# ─── Admin Backup ─────────────────────────────────────

import requests
import json
from fastapi.responses import JSONResponse

@protected_router.get("/backup/full")
async def get_full_database_backup():
    """Admin endpoint to backup Supabase schema and all data."""
    if not settings.SUPABASE_URL or not settings.SUPABASE_KEY:
        raise HTTPException(status_code=500, detail="Supabase credentials missing")
        
    try:
        # 1. Fetch OpenAPI Schema
        schema_url = f"{settings.SUPABASE_URL}/rest/v1/?apikey={settings.SUPABASE_KEY}"
        schema_resp = requests.get(schema_url)
        schema_resp.raise_for_status()
        schema_data = schema_resp.json()
        
        definitions = schema_data.get("definitions", {})
        table_names = list(definitions.keys())
        
        # 2. Fetch Data for each table (with pagination to get ALL records)
        data = {}
        for table in table_names:
            table_records = []
            offset = 0
            limit = 1000
            
            while True:
                # Query the table via REST directly to easily pass limits and offsets
                # We could use the python client, but raw REST gives us explicit control
                headers = {
                    "apikey": settings.SUPABASE_KEY,
                    "Authorization": f"Bearer {settings.SUPABASE_KEY}",
                    "Range": f"{offset}-{offset + limit - 1}"
                }
                table_url = f"{settings.SUPABASE_URL}/rest/v1/{table}?select=*"
                resp = requests.get(table_url, headers=headers)
                
                if resp.status_code != 200:
                    print(f"Failed to fetch {table}: {resp.text}")
                    break
                    
                chunk = resp.json()
                table_records.extend(chunk)
                
                if len(chunk) < limit:
                    break
                    
                offset += limit
                
            data[table] = table_records
            
        backup = {
            "schema": schema_data,
            "data": data,
            "timestamp": datetime.now().isoformat()
        }
        
        # Return as downloadable JSON file
        headers = {
            "Content-Disposition": f"attachment; filename=haydebot_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        }
        return JSONResponse(content=backup, headers=headers)
        
    except Exception as e:
        print(f"Backup Error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Backup failed: {str(e)}")
`;

content += backupCode;
fs.writeFileSync(path, content, 'utf8');
