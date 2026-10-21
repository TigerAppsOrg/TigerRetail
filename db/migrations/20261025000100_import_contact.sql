-- Listserv imports: an admin approves each one before it's public (that's the
-- consent to republish). Undo 20261025000000's "everything goes live".
update listings set status = 'review'
where import_source_id is not null and seller_netid = 'listserv' and status = 'active';

-- How to reach the seller, as their own post says, read once per sale.
alter table import_sources
  add column contact_phone      text,
  add column contact_email      text,
  add column pickup             text,
  add column try_on             boolean,
  add column contact_checked_at timestamptz;      -- when Claude last read the sale for these

-- An approved import shows those details to signed-in (CAS) viewers, and
-- keeps showing them after the seller claims it. Listings people post here
-- keep the old rule: contact only after an accepted offer.
alter table listings add column contact_public boolean not null default false;
update listings set contact_public = true where import_source_id is not null;
