-- Where a listserv sale is, when its pickup spot names a residential building
-- (matched to the official name the map pins by). Until the seller joins and
-- picks their dorm, this is what puts the sale on the map.
alter table import_sources add column building text;
