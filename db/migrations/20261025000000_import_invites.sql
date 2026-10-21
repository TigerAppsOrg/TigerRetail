-- Listserv imports, part 3: they go live as soon as they're read (no admin
-- approval), and the person who posted the sale can be invited to join and
-- manage them.

alter table import_sources
  add column invited_at timestamptz,               -- last invite sent
  add column invited_to text;                      -- where it went (rp4348 while testing)

-- everything imported and still unclaimed goes live
update listings set status = 'active' where import_source_id is not null and status = 'review';
