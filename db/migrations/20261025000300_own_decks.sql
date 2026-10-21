-- A seller can paste their own Google Slides deck on the sell page. Its items
-- are theirs from the start (drafts until they post them), so it needs no
-- admin review and stays out of the listserv queue.
alter table import_sources add column submitted_by text references users (netid) on delete cascade;
create index import_sources_submitted_by on import_sources (submitted_by);
