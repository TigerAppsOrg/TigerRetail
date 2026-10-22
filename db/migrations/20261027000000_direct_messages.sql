-- Direct conversations share the existing participant checks and message storage.
-- Existing item conversations retain their listing foreign key and uniqueness.
alter table conversations alter column listing_id drop not null;
alter table conversations add constraint direct_conversation_order
  check (listing_id is not null or buyer_netid collate "C" < seller_netid collate "C");
create unique index conversations_direct_pair on conversations (buyer_netid, seller_netid)
  where listing_id is null;
