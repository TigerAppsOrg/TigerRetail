-- Keep import history and deduplication while clearing completed admin rows.
alter table import_sources add column dismissed_at timestamptz;
