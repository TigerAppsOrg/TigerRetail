-- TigerRetail walking skeleton: users, listings, offers, listing photos.
--
-- Access model: the browser never talks to Supabase. Every read and write goes
-- through Next.js server code using the secret key, after the CAS session has
-- been checked. RLS is on with no policies, so the public (anon/publishable)
-- key can read and write nothing.

create table users (
  netid           text primary key check (netid ~ '^[a-z0-9_-]+$'),
  phone           text,
  payment_methods text[] not null default '{}',
  building        text,               -- a NAME from Princeton's Buildings layer; places the map pin
  room_directions text,               -- "2nd floor, two lefts"; shown to buyers with an accepted offer
  onboarded_at    timestamptz,
  created_at      timestamptz not null default now()
);

create table listings (
  id           uuid primary key default gen_random_uuid(),
  seller_netid text not null references users (netid) on delete cascade,
  title        text not null check (length(title) between 1 and 120),
  description  text not null default '' check (length(description) <= 2000),
  price_cents  integer not null check (price_cents >= 0),
  section      text not null check (section in ('clothing', 'accessories', 'special occasions', 'dorm', 'school supplies', 'everything else')),
  sub          text not null,
  dept         text not null check (dept in ('women''s', 'men''s', 'misc')),
  photo_path   text not null,
  status       text not null default 'active' check (status in ('active', 'sold')),
  created_at   timestamptz not null default now()
);
create index listings_feed on listings (status, created_at desc);
create index listings_seller on listings (seller_netid);

create table offers (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid not null references listings (id) on delete cascade,
  buyer_netid text not null references users (netid) on delete cascade,
  amount_cents integer not null check (amount_cents >= 0),
  message     text not null default '' check (length(message) <= 500),
  status      text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at  timestamptz not null default now(),
  unique (listing_id, buyer_netid)    -- one live offer per buyer per item; making another updates it
);
create index offers_buyer on offers (buyer_netid);

alter table users    enable row level security;
alter table listings enable row level security;
alter table offers   enable row level security;

-- Listing photos live in Cloudflare R2 under listing-photos/ (public to read, written
-- only by the server); the database keeps each photo's path.
