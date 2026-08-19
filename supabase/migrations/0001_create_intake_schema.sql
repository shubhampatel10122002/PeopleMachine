-- People Machine: plaintiff intake schema (Tavus AI avatar intake -> Supabase)
-- Already applied to project eeytqmshggwyrchixdal. Kept here as the source of truth.
create extension if not exists pgcrypto;

-- One row per Tavus conversation / intake session.
create table if not exists public.intakes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Tavus linkage
  tavus_conversation_id text not null unique,
  tavus_conversation_url text,
  pal_id text,
  face_id text,

  status text not null default 'in_progress'
    check (status in ('in_progress', 'completed', 'error')),

  -- consent captured on the intake page before the call starts
  consent_at timestamptz,
  consent_version text,

  started_at timestamptz not null default now(),
  ended_at timestamptz,
  transcript_ready_at timestamptz,

  -- structured variables collected by Maya's objectives
  first_name text,
  callback_phone text,
  email text,
  best_contact_time text,
  narrative_summary text,
  responsible_party text,
  incident_state text,
  incident_county text,
  incident_month_year text,

  -- raw objective output, keyed by objective_name; full transcript from Tavus
  objectives jsonb not null default '{}'::jsonb,
  transcript jsonb,

  source text not null default 'web',
  user_agent text,

  -- lightweight admin triage
  reviewed boolean not null default false,
  admin_notes text
);

-- Append-only log of every webhook Tavus sends us, kept raw for debugging.
create table if not exists public.intake_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  intake_id uuid references public.intakes(id) on delete set null,
  tavus_conversation_id text,
  event_type text,
  message_type text,
  objective_name text,
  payload jsonb not null
);

create index if not exists intakes_created_at_idx on public.intakes (created_at desc);
create index if not exists intakes_status_idx on public.intakes (status);
create index if not exists intake_events_intake_id_idx on public.intake_events (intake_id, created_at desc);
create index if not exists intake_events_conversation_idx on public.intake_events (tavus_conversation_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists intakes_set_updated_at on public.intakes;
create trigger intakes_set_updated_at
  before update on public.intakes
  for each row execute function public.set_updated_at();

-- RLS on with no policies: anon/authenticated keys can read nothing.
-- All access goes through the server using the service role key.
alter table public.intakes enable row level security;
alter table public.intake_events enable row level security;
