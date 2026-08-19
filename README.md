# People Machine

Plaintiffs tell their story to an AI intake specialist; the structured result
lands in Supabase and shows up in an admin dashboard.

This is step one: the public site, the Tavus intake conversation, the database,
and the dashboard. Attorney accounts and matching come later.

## How it works

```
/intake  ──POST /api/intake/start──▶  Tavus: create conversation (Maya)
                                          │
                                          ├─ conversation_url ──▶ iframe on /intake
                                          │
                                          └─ webhooks ──▶ /api/tavus/webhook ──▶ Supabase
                                                              │
                                                            /admin
```

Two kinds of webhook arrive at the same endpoint:

| Source | Payload | What we store |
| --- | --- | --- |
| Objective callback (per objective, configured in Tavus) | `{ conversation_id, objective_name, output_variables }` | Each variable onto its column on `intakes`, plus the raw object under `objectives` |
| Conversation callback (`callback_url` set at create time) | `{ conversation_id, event_type, properties }` | `application.transcription_ready` → full `transcript`, marks the intake `completed` |

Every payload is also written verbatim to `intake_events`, so anything we did
not anticipate is still recoverable from the dashboard.

## The Tavus agent

Maya — Civil Rights Intake Specialist (`p7ac55cbadb2`, face `ra3a03647d46`),
objective set `o9269328bfe16`. Her four objectives collect:

1. `greet_and_capture_contact` → `first_name`, `callback_phone`
2. `gather_open_narrative` → `narrative_summary`
3. `confirm_missing_details` → `responsible_party`, `incident_state`, `incident_county`, `incident_month_year`
4. `final_confirmation` → `email`, `best_contact_time`

Every one of those names is a column on `intakes`. A caller who refuses a
question is recorded as the literal string `declined`; one who does not know is
recorded as `unknown`.

## Database

Two tables in Supabase project `eeytqmshggwyrchixdal`, schema in
`supabase/migrations/0001_create_intake_schema.sql` (already applied).

RLS is enabled on both with **no policies**, so the anon key can read nothing.
All access goes through the server with the service role key.

## Environment variables

Copy `.env.example` to `.env.local` for local work, and set the same keys in
Vercel → Settings → Environment Variables.

| Variable | Where it comes from |
| --- | --- |
| `TAVUS_API_KEY` | Tavus dashboard |
| `TAVUS_WEBHOOK_SECRET` | You generate it: `openssl rand -hex 32` |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://eeytqmshggwyrchixdal.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API Keys → `service_role` |
| `PUBLIC_BASE_URL` | Your production origin, e.g. `https://peoplemachine.vercel.app` |
| `ADMIN_PASSWORD` | You pick it — this is the only thing guarding the dashboard |
| `TAVUS_PAL_ID` / `TAVUS_FACE_ID` | Optional; defaults to Maya |

`PUBLIC_BASE_URL` matters: without it, webhooks follow the per-deploy Vercel URL
and preview deploys start receiving production callbacks.

## Deploying

1. Import the repo in Vercel. Framework preset is Next.js; no build settings to change.
2. Add the environment variables above.
3. Deploy, then set `PUBLIC_BASE_URL` to the real domain and redeploy.
4. **Point Maya's objectives at the webhook.** Each of the four objectives needs
   its `callback_url` set to:

   ```
   https://<your-domain>/api/tavus/webhook?secret=<TAVUS_WEBHOOK_SECRET>
   ```

   Without this the conversation still works and the transcript still arrives,
   but the structured fields stay empty.

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
| `/intake` | Consent, then the conversation with Maya |
| `/intake/thanks` | Post-conversation confirmation |
| `/admin` | Intake list (password-gated) |
| `/admin/[id]` | One intake: fields, narrative, transcript, raw JSON, triage notes |
| `/api/tavus/webhook` | Everything Tavus sends back |

The admin gate is a single shared password (`ADMIN_PASSWORD`) checked in
`src/proxy.ts`, which sets an HMAC cookie. No accounts, no signup. It fails
closed: if `ADMIN_PASSWORD` is unset, the dashboard is locked, not open.
