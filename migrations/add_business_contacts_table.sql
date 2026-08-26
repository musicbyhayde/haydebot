-- Add business_contacts table
CREATE TABLE IF NOT EXISTS public.business_contacts (
    id TEXT PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::TEXT, NOW()) NOT NULL,
    name TEXT,
    phone TEXT,
    role TEXT,
    company TEXT,
    summary TEXT,
    lead_id TEXT REFERENCES public.leads(id) ON DELETE SET NULL
);

-- Enable RLS
ALTER TABLE public.business_contacts ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated/anon for now
CREATE POLICY "Enable all access for all users" ON public.business_contacts FOR ALL USING (true) WITH CHECK (true);
