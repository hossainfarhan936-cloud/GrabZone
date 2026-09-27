-- Vendor new-order notification log.
--
-- One row per order+vendor pair. The row is the send lock: it is inserted with
-- status 'sending' before the email goes out, so two concurrent requests cannot
-- both send, and it is updated to 'sent' or 'failed' afterwards.
--
-- Apply with:
--   wrangler d1 execute grabzone-db-test --remote --file=migrations/2026-09-27-vendor-order-notifications.sql
--
-- This file is safe to re-run: every statement is CREATE ... IF NOT EXISTS.
-- It only uses columns that exist in every revision of this table, so it also
-- applies cleanly to a database that already has an older version of it.
--
-- Columns added after the first revision (claim_token, claimed_at, sent_at) are
-- applied by the Worker itself on the first order after deployment
-- (see ensureNotificationStore in vendor-order-notify.mjs, which runs the
-- ALTERs and then VERIFIES the result before any email is allowed out). This
-- project has no migration runner, so that idempotent, verified runtime step is
-- what upgrades an existing table.
--
-- status values: sending | sent | failed | skipped

CREATE TABLE IF NOT EXISTS vendor_order_notifications(
  notification_key     TEXT PRIMARY KEY,          -- "<order id>|<vendor id>"
  order_id             TEXT NOT NULL,
  vendor_id            TEXT NOT NULL,
  vendor_order_id      TEXT,
  recipient            TEXT,
  status               TEXT NOT NULL,             -- sending | sent | failed | skipped
  attempts             INTEGER NOT NULL DEFAULT 0,
  provider             TEXT,                      -- resend | gmail
  provider_status      INTEGER,
  provider_message_id  TEXT,
  error                TEXT,
  claim_token          TEXT,                      -- owner of the in-flight claim
  claimed_at           TEXT,                      -- lease start, ISO string
  sent_at              TEXT,
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL
);

-- Index columns limited to those present in every revision of the table.
CREATE INDEX IF NOT EXISTS idx_vendor_order_notifications_order
  ON vendor_order_notifications(order_id, vendor_id);

-- The lease index over (status, claimed_at) is created by the Worker after the
-- columns above are added, because claimed_at does not exist in older revisions.
