-- Create the gmail_campaign_assignments table
CREATE TABLE IF NOT EXISTS "gmail_campaign_assignments" (
  "id" SERIAL PRIMARY KEY,
  "campaign_id" INTEGER NOT NULL REFERENCES "campaigns"("id"),
  "min_click_quantity" INTEGER NOT NULL DEFAULT 1,
  "max_click_quantity" INTEGER NOT NULL DEFAULT 1000000000,
  "priority" INTEGER NOT NULL DEFAULT 1,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Create an index for faster lookups by campaign_id
CREATE INDEX IF NOT EXISTS "gmail_campaign_assignments_campaign_id_idx" ON "gmail_campaign_assignments"("campaign_id");

-- Create an index for quantity range lookups
CREATE INDEX IF NOT EXISTS "gmail_campaign_assignments_quantity_range_idx" ON "gmail_campaign_assignments"("min_click_quantity", "max_click_quantity");