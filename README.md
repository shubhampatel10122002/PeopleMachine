# People Machine

Plaintiffs tell their story to an AI intake specialist; the structured result
lands in Supabase and shows up in an admin dashboard.

This is step one: the public site, the Tavus intake conversation, the database,
and the dashboard. Attorney accounts and matching come later.

## How it works

```
/intake  ──POST /api/intake/start──▶  Tavus: create conversation (Maya)
   │                                      │
   └─ first name + phone ────────────────▶├─ conversation_url ──▶ Daily SDK join
      (context + greeting)                │
                                          └─ webhooks ──▶ /api/tavus/webhook ──▶ Supabase
                                                              │
                                                            /admin
```

Name and phone are collected on the page **before** the call, not by Maya. Typed
contact details beat transcribed ones, and it means an abandoned call still
leaves a usable lead. They are passed to Tavus as `conversational_context` plus
a per-conversation `custom_greeting`, so Maya opens with the person's name and
goes straight to their story.

Three kinds of webhook arrive at the same endpoint:

| Payload | What we store |
| --- | --- |
| `{ conversation_id, objective_name, output_variables }` | Each variable onto its column on `intakes`, plus the raw object under `objectives` |
| `application.transcription_ready` | Full `transcript`; marks the intake `completed` |
| `application.perception_analysis` | Tavus's visual read of the caller, into `perception_analysis` |

Every payload is also written verbatim to `intake_events` — minus `webhook_url`,
which echoes our callback URL and therefore the shared secret.

## The Tavus agent

Maya — Civil Rights Intake Specialist (`p7ac55cbadb2`, face `rf4e9d9790f0`
"Anna - Professional"), objective set `o9269328bfe16`. Her three objectives
collect:

1. `gather_open_narrative` → `narrative_summary`
2. `confirm_missing_details` → `responsible_party`, `incident_state`, `incident_county`, `incident_month_year`
3. `final_confirmation` → `email`, `best_contact_time`

Every one of those names is a column on `intakes`. A caller who refuses a
question is recorded as the literal string `declined`; one who does not know is
recorded as `unknown`.

`first_name` and `callback_phone` are also columns, but they are written at
`/api/intake/start` from the form rather than by a callback. Maya's system
prompt tells her both are already on file and not to ask for either. Her magic
canvas input card is used once, for the email address.

**Changing the flow means changing two places.** If you add a variable to an
objective in Tavus, add the matching column to `intakes` and the name to
`INTAKE_FIELDS` in `src/lib/types.ts` — the webhook only maps names on that list.

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
| `TAVUS_PAL_ID` / `TAVUS_FACE_ID` | Optional; defaults to Maya and Anna - Professional |

`PUBLIC_BASE_URL` matters: without it, webhooks follow the per-deploy Vercel URL
and preview deploys start receiving production callbacks.

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
| `/intake` | Name, phone, consent, then the conversation with Maya |
| `/intake/thanks` | Post-conversation confirmation |
| `/admin` | Intake list (password-gated) |
| `/admin/[id]` | One intake: fields, narrative, transcript, video analysis, raw JSON, triage notes |
| `/api/tavus/webhook` | Everything Tavus sends back |

The admin gate is a single shared password (`ADMIN_PASSWORD`) checked in
`src/proxy.ts`, which sets an HMAC cookie. No accounts, no signup. It fails
closed: if `ADMIN_PASSWORD` is unset, the dashboard is locked, not open.
