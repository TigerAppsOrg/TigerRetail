-- Profile: how people show up to each other. All optional; the netid stays
-- the identity and the fallback name.
alter table users
  add column display_name text check (length(display_name) between 1 and 40),
  add column class_year   smallint check (class_year between 1950 and 2040),
  add column bio          text check (length(bio) <= 160),
  add column avatar_path  text;

-- Profile photos live in Cloudflare R2 under avatars/ (public to read, written only by the server).
