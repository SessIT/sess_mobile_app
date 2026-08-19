-- Extra bill attachments for an expense claim. bill_path remains the first
-- attachment, so existing rows and older clients are unaffected.
ALTER TABLE "expense_requests"
  ADD COLUMN "extra_bills" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
