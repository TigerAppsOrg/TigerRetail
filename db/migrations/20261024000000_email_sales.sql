-- Listserv import, part 2: sales written in the email itself (no slides).
-- An import source is now a deck or an email; existing rows are decks.
alter table import_sources
  add column kind      text not null default 'deck' check (kind in ('deck', 'email')),
  add column email_url text,                      -- the email on TigerInbox (Princeton sign-in)
  alter column deck_id  drop not null,
  alter column deck_url drop not null;

-- a deck has its link; an email has its InboxEngine id, and is read once
alter table import_sources add constraint import_sources_key check (
  (kind = 'deck' and deck_id is not null and deck_url is not null) or (kind = 'email' and message_id is not null)
);
create unique index import_sources_email on import_sources (message_id) where kind = 'email';
