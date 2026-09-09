# People Machine

Plaintiffs tell their story to an AI intake specialist; the structured result
lands in Supabase and shows up in an admin dashboard.

This is step one: the public site, the two intake conversations, the database,
and the dashboard. Attorney accounts and matching come later.

## Two front doors, one row

There are two ways to give an intake, and they write the same columns.

```
/intake       ──POST /api/intake/start──▶  Tavus: create conversation (the PAL)
   │                                      │
   └─ first name + phone + email ────────▶├─ conversation_url ──▶ Daily SDK join
      (context + greeting)                │
                                          └─ webhooks ──▶ /api/tavus/webhook ──┐
                                                                               │
/intake/text  ──POST /api/intake/text/start──▶ row + first question            ├─▶ Supabase
   │                                                                           │      │
   └─ one answer ──POST /api/intake/text/turn──▶ OpenAI Responses ─────────────┘    /admin
```

The **video intake** is the Tavus avatar. The **text intake** is for someone who
does not want to be on camera: an LLM decides the next question from what they
have already said, offers clickable answers, and never asks the same thing
twice. Full detail, and the reasoning behind every choice, is in
[`docs/text-intake.md`](docs/text-intake.md).

Both write `matter_bucket`, the two fuses, the branch fields, `priority_tier`
and a `transcript` in the same shape, so /admin and the future extractor read
one row shape and never learn there are two front doors. `intakes.mode` says
which door a given row came through.

## How the video intake works

Name, phone and email are collected on the page **before** the call, not by
the agent. Typed contact details beat transcribed ones, and it means an
abandoned call still leaves a usable lead. They are passed to Tavus as
`conversational_context`, so the agent already has all three and goes straight
to the person's story.

The greeting itself belongs to PAL Maker. A `custom_greeting` is sent only when
the PAL's own greeting contains a `{first_name}` token, and then it is that same
text with the name filled in — see [`tavus/README.md`](tavus/README.md).

Email moved onto the form for a second reason. It used to be asked at the close
and answered through a Magic Canvas input card, and that card never rendered
here: the call is joined with Daily's prebuilt iframe, and Magic Canvas is drawn
by Tavus's own embed or its React components, neither of which is in the page.
The card showed in PAL Maker's preview and nowhere else. Rather than rebuild the
call UI around it, the address is typed up front with the rest of the contact
details, and the capability is detached from both PALs.

Four kinds of webhook arrive at the same endpoint:

| Payload | What we store |
| --- | --- |
| `{ conversation_id, objective_name, output_variables }` | Each variable onto its column on `intakes`, plus the raw object under `objectives` |
| `application.transcription_ready` | Full `transcript`; marks the intake `completed` |
| `application.perception_analysis` | Tavus's visual read of the caller, into `perception_analysis` |
| A guardrail fire | Only `safety_flag_and_continue` has a `callback_url`. Sets `safety_flag` and forces `priority_tier` to `p1` |

That last row is the reason the safety guardrail has a callback at all:
guardrails otherwise publish as app messages on the Daily data channel, which
never reach the server. A browser listener would lose the signal on any client
that is not watching for it.

Objective callbacks **fire repeatedly** as an objective refines its variables,
so the webhook merges rather than assigns: a later fire carrying `unknown` or
`declined` can never overwrite an answer we already hold.

Every payload is also written verbatim to `intake_events` — minus `webhook_url`,
which echoes our callback URL and therefore the shared secret.

## The text intake

`/intake/text`, for someone who does not want an avatar. `gpt-5.6-sol` through
the OpenAI **Responses API** picks the next question from what the person has
already said, offers three to seven clickable answers with a free-text way out,
and writes the same columns a call does.

The division of labour is the design: the model writes the dialogue, and the
code decides what is true. Which fields are still open, which branch the matter
took and whether the intake may close are all settled from the row, and a
question for a field that is not open is discarded in favour of one that is. So
a model that drifts costs a worse sentence, never a repeated question. When
OpenAI cannot be reached at all the intake still completes, walking the
question catalog unaided, and `intakes.text_engine` records that it did.

**Read [`docs/text-intake.md`](docs/text-intake.md) before changing any of it**,
particularly before moving the question catalog into the system prompt or
"fixing" the schema to use nullable fields.

The firm's standing decisions carry over unchanged from the call agent: no
crisis resources, never decline a matter, no callback SLA, no merits
evaluation, never read the account back. They are in the system prompt in
`src/lib/openai.ts`.

## The Tavus agent

Kelly. Production serves PAL `p7ac55cbadb2`, set via `TAVUS_PAL_ID` in Vercel.
**Nothing about the agent's identity is configured in this repo** — the name it
gives, its greeting, its face and its system prompt are all read off the PAL at
call time, so editing them in PAL Maker needs no deploy. The one exception is
`AGENT_NAME` in `src/lib/agent.ts`, which is the name in static site copy and has
to be changed alongside a rename. A second PAL, `p93c8a932419`, is the fallback
baked into `src/lib/env.ts`; it has **not** been renamed and still carries the
old face. **Full
detail, and the reasoning behind every choice, is in
[`tavus/README.md`](tavus/README.md)** — read that before touching a prompt, and
note that a prompt change has to be made on both PALs.

The short version. He opens with one question ("tell me what happened, take
your time"), classifies silently from the narrative rather than asking the
caller to name their category, banks a routable lead in the first ~90 seconds,
then runs one of seven branches and closes. He never declines a matter, never
mentions 911 or any crisis resource, and never quotes a callback timeframe.

```
open_narrative → tier1_capture ⇢ one of {employment, institutional_access,
  police_conduct, custody_confinement, sexual_violence, injury, general_matter}
  → wrap_up
```

Twelve matter buckets are recorded as data (`matter_bucket`); only seven are
branch targets, because a twelve-way plain-English routing decision is where
misrouting happens.

**Changing the flow means changing three places.** If you add a variable to an
objective in Tavus, add the matching column to `intakes` and the name to
`INTAKE_SPINE_FIELDS` or `INTAKE_BRANCH_FIELDS` in `src/lib/types.ts` — the
webhook only maps names on that list. The split matters: spine fields are asked
on every call and an empty one is signal, while branch fields are null on nearly
every row by design and must never count toward completeness. The third place is
`QUESTION_PLAN` in `src/lib/intake-plan.ts`, or the text intake will keep
collecting the old set and the two front doors will quietly diverge.

`first_name`, `callback_phone` and `email` are written at `/api/intake/start`
from the form rather than by a callback. The PAL's prompt says all three are
already on file and not to ask for any of them, and `email` is no longer an
output variable on `wrap_up`, so no callback can overwrite the typed address.

### Post-call extraction is not built

The agent captures a coarse routing tuple live; fine-grained classification,
dates as `{raw, iso, precision}`, and per-field provenance are meant to come
from a post-call extractor running over the merged bundle. That bundle is
already durable — `transcript`, `perception_analysis`, `objectives`, and
`intake_events` — so nothing is being lost in the meantime, it just is not
structured yet.

A typed intake lands in the same place, with `text_turns` alongside the
transcript: which question was asked, which options were offered, and what was
chosen. That is strictly more provenance than a call leaves, and the extractor
should read it rather than re-parsing the transcript.

Two facts that make this safe, both measured rather than assumed:
`application.transcription_ready` arrived **1–5 seconds after call end on every
call**, including a 36-second one with four turns; and perception **never**
reaches the transcript, arriving only as the end-of-call
`perception_analysis.analysis` blob. Extraction must read the bundle, not the
transcript alone, or it silently drops the safety signal.

## Why the call is not a plain iframe

`/intake` joins the room through the Daily SDK (`frame.join({ url, userName })`)
rather than pointing an iframe at `conversation_url`. Pointing an iframe at the
room shows Daily's own pre-join screen, which asks the caller for a name we
already collected on the form — visible on iOS in particular.

Two consequences worth keeping:

- The join must stay **synchronous inside the click**. iOS Safari only grants
  camera and mic on a real user gesture, so `@daily-co/daily-js` is preloaded
  while the conversation is being created and the join button then calls
  `join()` with no `await` in front of it.
- That is why starting a call is two taps: one to create the conversation, one
  to join. It was always two taps — the second used to be Daily's own screen.

## Database

Supabase project `eeytqmshggwyrchixdal`, schema in `supabase/migrations/`
(already applied, `0004` included).

`0004` is what lets one table hold both kinds of intake: `mode`, the text
intake's `session_token` / `text_turns` / `text_engine`, and
`tavus_conversation_id` made nullable because a typed intake has no
conversation behind it. Everything else is additive, and `mode` defaults to
`voice`, so existing rows are untouched.

RLS is enabled on both tables with **no policies**, so the anon key can read
nothing. All access goes through the server with the service role key.

## Environment variables

Copy `.env.example` to `.env.local` for local work, and set the same keys in
Vercel → Settings → Environment Variables.

| Variable | Where it comes from |
| --- | --- |
| `TAVUS_API_KEY` | Tavus dashboard |
| `TAVUS_WEBHOOK_SECRET` | You generate it: `openssl rand -hex 32` |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://eeytqmshggwyrchixdal.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API Keys → `service_role` |
| `PUBLIC_BASE_URL` | Your production origin, e.g. `https://people-machine.vercel.app` |
| `ADMIN_PASSWORD` | You pick it — this is the only thing guarding the dashboard |
| `TAVUS_PAL_ID` | Set in production to `p7ac55cbadb2`; omitting it falls back to `p93c8a932419` |
| `OPENAI_API_KEY` | OpenAI dashboard. Drives the text intake and nothing else. **Not committed**: unlike `TAVUS_API_KEY`, GitHub push protection rejects OpenAI key patterns outright, so set it in Vercel and paste it into your local `.env` |
| `OPENAI_PROJECT_ID` | Optional. Scopes usage to one project, e.g. `proj_g9xNxYSKiVZEikeFmoCgfNbc` |
| `OPENAI_MODEL` | Optional override. Defaults to `gpt-5.6-sol` |

There is deliberately **no `TAVUS_FACE_ID`**. The face is set on the PAL in PAL
Maker and nowhere else — see [`tavus/README.md`](tavus/README.md). If the Vercel
project still has that variable set, it does nothing; delete it.

### `PUBLIC_BASE_URL` is the one that bites

It is the origin Tavus posts conversation-level callbacks to
(`system.replica_joined`, `system.shutdown`,
`application.transcription_ready`, `application.perception_analysis`). If Tavus
cannot reach it, **all of them are lost silently** — no retry, no error — and
the intake sits at `in_progress` with no transcript.

Objective callbacks survive that, because their URLs are stored on the
objective set in Tavus rather than built from this value. **An intake carrying
objective data but no transcript is the signature of a wrong
`PUBLIC_BASE_URL`**, and the origin is logged on every conversation create so
it can be checked against the Vercel logs.

Two things make it easy to get wrong. It falls back to
`VERCEL_PROJECT_PRODUCTION_URL`, which is the project's production *domain* —
attaching a custom domain in Vercel changes that even while the domain still
resolves to a registrar parking page. And env values are baked per deployment,
so a change made today breaks whichever deploy happens next, not the one
running when it was made. Set it explicitly, and only to an origin that
resolves to this app.

Nothing is unrecoverable when it does go wrong: see "Reconciling from Tavus".

## Reconciling from Tavus

The webhook is a push, and a push sent to an unreachable origin is gone — Tavus
does not replay it. Tavus does keep the transcript and the perception analysis
on the conversation itself, so `src/lib/reconcile.ts` reads them back
(`GET /v2/conversations/{id}?verbose=true`) and writes what the webhook never
delivered.

It runs automatically on the admin pages for rows that look stuck — still
`in_progress`, no transcript, and either already ended or started more than two
minutes ago. The dashboard list repairs at most five per load; opening an
intake repairs that one. Existing values are never overwritten, so a late
webhook and a reconcile cannot fight.

This means a lost-callback outage costs nothing permanently: fix the origin,
open the dashboard, and the affected intakes fill themselves in.

## Tavus objective callbacks

Each objective in Tavus has its own `callback_url`, and it must be set to:

```
https://<your-domain>/api/tavus/webhook?secret=<TAVUS_WEBHOOK_SECRET>
```

This is already configured for `people-machine.vercel.app`. **Re-do it if you
change domain or rotate the secret** — otherwise the conversation still works
and the transcript still arrives, but every structured field stays empty.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in the blanks
npm run dev
```

Tavus webhooks cannot reach `localhost`. To exercise the full loop locally,
expose the port (`ngrok http 3000`), set `PUBLIC_BASE_URL` to the tunnel URL,
and point the objective callbacks at it.

The text intake needs no tunnel: it is request/response, so `/intake/text`
works against `localhost` as soon as `OPENAI_API_KEY` and the Supabase keys are
set. Without OpenAI credit it still runs, walking the scripted question list
instead of adapting; /admin marks those rows `text (scripted)`.

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Public landing page |
| `/intake` | Name, phone, email, consent, then the video conversation with the agent |
| `/intake/text` | The same, in writing: one LLM-chosen question at a time, mostly clickable |
| `/intake/thanks` | Post-conversation confirmation |
| `/admin` | Intake list (password-gated) |
| `/admin/[id]` | One intake: fields, narrative, transcript, video analysis, raw JSON, triage notes |
| `/api/tavus/webhook` | Everything Tavus sends back |
| `/api/intake/text/start` | Opens a typed intake and returns the first question |
| `/api/intake/text/turn` | One answer in, the next question out |

The admin gate is a single shared password (`ADMIN_PASSWORD`) checked in
`src/proxy.ts`, which sets an HMAC cookie. No accounts, no signup. It fails
closed: if `ADMIN_PASSWORD` is unset, the dashboard is locked, not open.
