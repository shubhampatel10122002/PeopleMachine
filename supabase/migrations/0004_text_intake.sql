-- The text intake: the same intake, typed instead of spoken.
--
-- A text intake writes the *same columns* as a call (first_name, matter_bucket,
-- the two fuses, the branch fields, priority_tier) so /admin, the completeness
-- count and the post-call extractor all read one shape and never learn there are
-- two front doors. What is added here is only what a typed conversation has and
-- a call does not.
--
-- `transcript` is reused rather than duplicated: the chat is written into it in
-- the same `{ role, content }` shape Tavus sends, so the admin transcript view
-- and anything downstream of it work unchanged.

alter table public.intakes
  -- Which front door this intake came through. Defaulting to 'voice' is what
  -- makes this migration safe on the 29 rows that predate it: every existing
  -- row was a call.
  add column if not exists mode text not null default 'voice'
    check (mode in ('voice', 'text')),

  -- Bearer token for the turn endpoint, handed to the browser once at start.
  -- The row id alone must not be enough to write to an intake: ids travel in
  -- URLs and logs, and a public POST route that takes only an id lets anyone
  -- who has seen one append answers to a stranger's intake.
  add column if not exists session_token text,

  -- The machine record of the conversation: every question asked (with the
  -- options offered and which engine produced it) and the raw answer given.
  -- `transcript` is the readable projection of this, kept in Tavus's shape.
  add column if not exists text_turns jsonb not null default '[]'::jsonb,

  -- 'openai' or 'fallback', whichever produced the *last* question. A row that
  -- says 'fallback' was walked through the scripted question list because the
  -- model call failed. The intake still completed, but nothing about it was
  -- dynamic, and that is worth being able to see from the dashboard.
  add column if not exists text_engine text;

-- A text intake has no Tavus conversation. The column stays unique, and
-- Postgres lets a unique index hold any number of nulls, so voice rows keep the
-- guarantee they had.
alter table public.intakes
  alter column tavus_conversation_id drop not null;

-- Every read of a live text intake is by (id, session_token) from the turn
-- endpoint, on the hot path of every answer.
create index if not exists intakes_session_token_idx
  on public.intakes (session_token)
  where session_token is not null;

comment on column public.intakes.mode is
  'voice = Tavus call, text = LLM chat intake. Both write the same field columns.';
