-- Add bank account details columns to musicians table
ALTER TABLE musicians ADD COLUMN IF NOT EXISTS "Bank_Account_Name" TEXT;
ALTER TABLE musicians ADD COLUMN IF NOT EXISTS "Bank_Name" TEXT;
ALTER TABLE musicians ADD COLUMN IF NOT EXISTS "Bank_Branch" TEXT;
ALTER TABLE musicians ADD COLUMN IF NOT EXISTS "Bank_Account_Number" TEXT;
