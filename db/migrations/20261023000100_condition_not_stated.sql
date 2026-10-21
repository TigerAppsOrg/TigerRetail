-- Slides often don't say an item's condition. Imported listings say so
-- honestly instead of guessing; sellers creating listings still pick one.
alter table listings drop constraint listings_condition_check;
alter table listings add constraint listings_condition_check
  check (condition in ('new with tags', 'like new', '<5 wears', 'slightly worn', 'well-loved', 'not stated'));
