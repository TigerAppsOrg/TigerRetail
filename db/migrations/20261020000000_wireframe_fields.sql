-- Listing + account fields from the wireframe (wireframe/index.html).
-- Existing rows are carried over: photos, contact and payments copy across
-- exactly. Old listings never recorded a condition or a size, so they get
-- condition 'like new' and size 'n/a'.

-- ---- accounts: payment methods carry a handle ("@tiger25", a Zelle number) ----
alter table users add column payments jsonb not null default '[]'
  check (jsonb_typeof(payments) = 'array');  -- [{ "id": "venmo", "handle": "@tiger25" }]
update users set payments = coalesce(
  (select jsonb_agg(jsonb_build_object('id', m, 'handle', '')) from unnest(payment_methods) as m), '[]');
alter table users drop column payment_methods;

-- ---- listings: several photos, [0] is the cover ----
alter table listings add column photo_paths text[];
update listings set photo_paths = array[photo_path];
alter table listings alter column photo_paths set not null;
alter table listings add constraint listings_photo_paths_check check (cardinality(photo_paths) between 1 and 8);
alter table listings drop column photo_path;

-- catalog follows the wireframe: jewelry is a section, bags & accessories live under clothing
alter table listings drop constraint listings_section_check;
update listings set section = 'jewelry', sub = 'necklaces' where section = 'accessories' and sub = 'jewelry';
update listings set section = 'clothing', sub = 'bags & accessories' where section = 'accessories';
alter table listings add constraint listings_section_check
  check (section in ('clothing', 'dorm', 'special occasions', 'school supplies', 'jewelry', 'everything else'));

-- apparel is women's / men's / unisex; everything else is misc
alter table listings drop constraint listings_dept_check;
update listings set dept = 'misc' where section not in ('clothing', 'special occasions');
alter table listings add constraint listings_dept_check check (dept in ('women''s', 'men''s', 'unisex', 'misc'));

alter table listings
  add column brand      text not null default '' check (length(brand) <= 60),
  add column condition  text not null default 'like new'
    check (condition in ('new with tags', 'like new', '<5 wears', 'slightly worn', 'well-loved')),
  add column occasion   text not null default 'none' check (occasion in ('none', 'lawnparties', 'formals', 'going out', 'grad')),
  add column sizing     jsonb not null default '{"system": "na"}',  -- { system: alpha|waist|shoe|one|na, alpha, waist, length, fit, shoe, scale }
  add column size       text not null default 'n/a',                -- display string, e.g. "28 × 30 · straight"
  add column size_facet text not null default 'n/a',                -- the value the size filter compares against
  add column try_on     boolean not null default false;
-- new rows must say these explicitly; the defaults above only carried old rows over
alter table listings alter column condition drop default, alter column sizing drop default,
  alter column size drop default, alter column size_facet drop default;

-- per-listing contact (step 1 of the sell flow): starts from the account, can differ per listing
alter table listings
  add column contact_email text,
  add column contact_phone text,                 -- null = "don't use my number"
  add column pickup        text not null default '' check (length(pickup) <= 500),
  add column payments      jsonb not null default '[]' check (jsonb_typeof(payments) = 'array');
update listings l set contact_email = l.seller_netid || '@princeton.edu',
                      contact_phone = u.phone,
                      pickup = coalesce(u.room_directions, ''),
                      payments = u.payments
  from users u where u.netid = l.seller_netid;
alter table listings alter column contact_email set not null;

create index listings_section on listings (section, status, created_at desc);
