-- Messaging: one conversation per buyer per listing.
-- Same access model as everything else: RLS on, no policies; only the
-- Next.js server (secret key) reads and writes, after checking the session.

create table conversations (
  id                uuid primary key default gen_random_uuid(),
  listing_id        uuid not null references listings (id) on delete cascade,
  buyer_netid       text not null references users (netid) on delete cascade,
  seller_netid      text not null references users (netid) on delete cascade,  -- copied from the listing, so the inbox is one query
  created_at        timestamptz not null default now(),
  last_message_at   timestamptz,
  last_sender_netid text,
  buyer_read_at     timestamptz,
  seller_read_at    timestamptz,
  unique (listing_id, buyer_netid),
  check (buyer_netid <> seller_netid)
);
create index conversations_buyer on conversations (buyer_netid, last_message_at desc);
create index conversations_seller on conversations (seller_netid, last_message_at desc);

create table messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations (id) on delete cascade,
  sender_netid    text not null references users (netid) on delete cascade,
  body            text not null check (length(body) between 1 and 2000),
  created_at      timestamptz not null default now()
);
create index messages_thread on messages (conversation_id, created_at);

alter table conversations enable row level security;
alter table messages      enable row level security;
