-- Civil rights intake redesign: the Tier 1 routing spine, the triage block, and
-- the per-branch fields the new objective set (crv-intake-v2) emits.
--
-- Every column is nullable text. Tavus output variables are always strings, so
-- the multi-valued ones (protected_basis, conduct_types) arrive comma-joined and
-- are normalised later by the post-call extractor, not here.
--
-- Branch columns are null by design on most calls: a call only ever runs one
-- branch, so `injury_type` is empty on every employment matter and vice versa.
-- See INTAKE_SPINE_FIELDS vs INTAKE_BRANCH_FIELDS in src/lib/types.ts.

alter table public.intakes
  -- Tier 1: banked in the first ~90 seconds so a dropped call still routes.
  add column if not exists subject_one_line text,
  add column if not exists matter_bucket text,
  add column if not exists matter_venue text,
  add column if not exists protected_basis text,
  add column if not exists conduct_types text,
  add column if not exists urgency text,
  add column if not exists incident_date text,
  add column if not exists opposing_party text,
  -- Asked at the close. In a harassment or assault matter this is a safety
  -- field, not a convenience one: the phone or the home may be shared.
  add column if not exists voicemail_text_safe text,

  -- The two fuses. Both are case-killers, and they are separate on purpose:
  -- GML 50-e runs 90 days against a municipal defendant whether or not the
  -- caller ever worked for one, so a city bus rear-ending someone trips
  -- municipal_defendant with government_employer false.
  add column if not exists government_employer text,
  add column if not exists municipal_defendant text,
  add column if not exists prior_filing text,

  -- Branch outputs.
  add column if not exists branch_summary text,
  add column if not exists employer_headcount_band text,
  add column if not exists incident_borough text,
  add column if not exists facility_name text,
  add column if not exists facility_type text,
  add column if not exists injury_type text,
  add column if not exists treatment_status text,
  add column if not exists insurer_identified text,
  add column if not exists liable_party_type text,

  -- Triage. This block is what stops the firm returning every call at the
  -- same speed, so it is indexed for the callback queue.
  add column if not exists priority_tier text,
  add column if not exists safety_flag text;

-- The callback queue reads these two together: p1 first, safety flags first
-- within a tier, oldest first within that.
create index if not exists intakes_priority_idx
  on public.intakes (priority_tier, created_at desc);

create index if not exists intakes_safety_flag_idx
  on public.intakes (safety_flag)
  where safety_flag is not null;

-- Superseded by incident_date, which takes whatever precision the caller gave
-- ("last spring" is an answer). Kept so the six pre-redesign rows still read.
comment on column public.intakes.incident_month_year is
  'Legacy: pre-2026-08 objective set. New calls write incident_date instead.';
