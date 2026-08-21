-- Tavus sends application.perception_analysis (its visual read of the caller).
-- Surfaced in the admin dashboard, so give it a column of its own.
alter table public.intakes
  add column if not exists perception_analysis jsonb;
