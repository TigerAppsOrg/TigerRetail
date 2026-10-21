-- The seller's own instructions for a sale ("priority to people who don't
-- need try-ons", "holds for 24h"), read from their post with the contact
-- details and shown with the listings.
alter table import_sources add column seller_notes text[] not null default '{}';

-- read every sale once more so existing ones get their notes too
update import_sources set contact_checked_at = null where status = 'done';
