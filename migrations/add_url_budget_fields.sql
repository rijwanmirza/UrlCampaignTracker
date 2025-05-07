-- Migration to add URL budget tracking fields to the urls table
-- This adds:
-- - pendingBudgetUpdate column (boolean) to track URLs waiting for budget update
-- - budgetCalculated column (boolean) to track URLs that have had budget calculated

-- Check if columns exist first to avoid errors
DO $$
DECLARE
  pending_column_exists BOOLEAN;
  calculated_column_exists BOOLEAN;
BEGIN
  -- Check if pendingBudgetUpdate column exists
  SELECT EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_name = 'urls' AND column_name = 'pending_budget_update'
  ) INTO pending_column_exists;
  
  -- Check if budgetCalculated column exists
  SELECT EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_name = 'urls' AND column_name = 'budget_calculated'
  ) INTO calculated_column_exists;
  
  -- Add pendingBudgetUpdate column if it doesn't exist
  IF NOT pending_column_exists THEN
    ALTER TABLE urls ADD COLUMN pending_budget_update BOOLEAN DEFAULT false;
    RAISE NOTICE 'Added pending_budget_update column';
  ELSE
    RAISE NOTICE 'pending_budget_update column already exists';
  END IF;
  
  -- Add budgetCalculated column if it doesn't exist
  IF NOT calculated_column_exists THEN
    ALTER TABLE urls ADD COLUMN budget_calculated BOOLEAN DEFAULT false;
    RAISE NOTICE 'Added budget_calculated column';
  ELSE
    RAISE NOTICE 'budget_calculated column already exists';
  END IF;
END $$;