# People Machine

Plaintiffs tell their story to an AI intake specialist; the structured result
lands in Supabase and shows up in an admin dashboard.

This is step one: the public site, the Tavus intake conversation, the database,
and the dashboard. Attorney accounts and matching come later.

## How it works

```
/intake  ──POST /api/intake/start──▶  Tavus: create conversation (Ethan)
   │                                      │
   └─ first name + phone + email ────────▶├─ conversation_url ──▶ Daily SDK join
      (context + greeting)                │
                                          └─ webhooks ──▶ /api/tavus/webhook ──▶ Supabase
                                                              │
                                                            /admin
```

Name, phone and email are collected on the page **before** the call, not by
Ethan. Typed contact details beat transcribed ones, and it means an abandoned
call still leaves a usable lead. They are passed to Tavus as
`conversational_context` plus a per-conversation `custom_greeting`, so Ethan
opens with the person's name and goes straight to their story.

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

## The Tavus agent

Ethan. Production serves PAL `p7ac55cbadb2` with face `rf4703150052` ("Charlie")
and objective set `ofc70727fb48e`, all three set via `TAVUS_PAL_ID` /
`TAVUS_FACE_ID` in Vercel. A second PAL, `p93c8a932419`, is the fallback baked
into `src/lib/env.ts` and carries the same prompt and objective tree. **Full
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

**Changing the flow means changing two places.** If you add a variable to an
objective in Tavus, add the matching column to `intakes` and the name to
`INTAKE_SPINE_FIELDS` or `INTAKE_BRANCH_FIELDS` in `src/lib/types.ts` — the
webhook only maps names on that list. The split matters: spine fields are asked
on every call and an empty one is signal, while branch fields are null on nearly
every row by design and must never count toward completeness.

`first_name`, `callback_phone` and `email` are written at `/api/intake/start`
from the form rather than by a callback. Ethan's prompt tells him all three are
already on file and not to ask for any of them, and `email` is no longer an
output variable on `wrap_up`, so no callback can overwrite the typed address.

### Post-call extraction is not built

The agent captures a coarse routing tuple live; fine-grained classification,
dates as `{raw, iso, precision}`, and per-field provenance are meant to come
from a post-call extractor running over the merged bundle. That bundle is
already durable — `transcript`, `perception_analysis`, `objectives`, and
`intake_events` — so nothing is being lost in the meantime, it just is not
structured yet.

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
(already applied).

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
| `TAVUS_PAL_ID` / `TAVUS_FACE_ID` | Set in production to `p7ac55cbadb2` / `rf4703150052` (Charlie); omitting them falls back to `p93c8a932419` / the same Charlie |

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

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Public landing page |
| `/intake` | Name, phone, email, consent, then the conversation with Ethan |
| `/intake/thanks` | Post-conversation confirmation |
| `/admin` | Intake list (password-gated) |
| `/admin/[id]` | One intake: fields, narrative, transcript, video analysis, raw JSON, triage notes |
| `/api/tavus/webhook` | Everything Tavus sends back |

The admin gate is a single shared password (`ADMIN_PASSWORD`) checked in
`src/proxy.ts`, which sets an HMAC cookie. No accounts, no signup. It fails
closed: if `ADMIN_PASSWORD` is unset, the dashboard is locked, not open.
