-- Listserv import: sale emails link to Google Slides decks; each slide becomes
-- a listing that waits for admin review, then shows as "from the listserv"
-- until the person who posted the sale claims it.

-- The account imported listings belong to until claimed. Not a person: no
-- phone, no payments, never signs in (CAS never issues this netid).
insert into users (netid, onboarded_at) values ('listserv', now()) on conflict (netid) do nothing;

-- One row per deck we've read (a deck can be emailed again; we read it once).
create table import_sources (
  id            uuid primary key default gen_random_uuid(),
  deck_id       text not null unique,             -- Google Slides presentation id
  deck_url      text not null,
  message_id    text,                             -- InboxEngine message id (null for pasted links)
  subject       text,
  listserv      text,
  author_name   text,                             -- from the HoagieMail footer: a hint, not an identity
  author_email  text,
  sent_at       timestamptz,
  status        text not null default 'pending' check (status in ('pending', 'done', 'failed')),
  error         text,
  slides        integer,
  items_found   integer,
  created_at    timestamptz not null default now()
);

-- Each scheduled run, so the next one knows where to pick up.
create table import_runs (
  id          uuid primary key default gen_random_uuid(),
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  since       timestamptz not null,               -- emails sent after this were considered
  ok          boolean,
  summary     text
);

-- listings: imported ones are reviewed before anyone sees them
alter table listings drop constraint listings_status_check;
alter table listings add constraint listings_status_check check (status in ('review', 'active', 'sold'));
alter table listings
  add column import_source_id uuid references import_sources (id) on delete set null,
  add column import_slide     integer;
create index listings_import on listings (import_source_id);
alter table import_sources enable row level security;
alter table import_runs    enable row level security;
