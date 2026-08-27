# Rollback snapshot — Maya, pre-redesign

State of the live PAL `p7ac55cbadb2` captured **2026-08-27**, immediately before the civil rights
intake redesign. The redesign patches this PAL **in place** — the ID is the default baked into
`src/lib/env.ts` and set in Vercel, so there is no second PAL to fall back to. This directory is the
fallback.

| File | Contents |
| --- | --- |
| `pal.json` | `tavus_pal_get(p7ac55cbadb2, include_settings=true)`, plus the perception capability, which that call does not return |
| `objectives.json` | Objective set `o9269328bfe16` — 3 nodes, `allow_loops: false` |
| `guardrails.json` | All 10 records in `guardrail_ids` — 5 distinct concerns, each attached twice |

## The secret is not in here

Every objective `callback_url` ends with `?secret=<TAVUS_WEBHOOK_SECRET>`. The snapshot stores it as
the literal placeholder `${TAVUS_WEBHOOK_SECRET}`. Substitute the live value from Vercel →
Settings → Environment Variables before restoring, and never commit the resolved string. This mirrors
the `redact()` call in `src/app/api/tavus/webhook/route.ts`, which strips `webhook_url` from stored
payloads for the same reason.

## Restoring

Order matters — recreate the resources, then point the PAL at them.

1. **Objectives.** `tavus_objective_create` with `data` from `objectives.json` and
   `allow_loops: false`, after substituting the secret into all three `callback_url` values. This
   returns a **new** `objectives_id`; `o9269328bfe16` cannot be revived once deleted.
2. **Guardrails.** Only if they were deleted. `tavus_guardrail_create` per record. The five entries
   carrying `_duplicate_of` were duplicates of the five above them and are not worth recreating —
   restoring the five with `persona_refs` is a full restore of behaviour.
3. **PAL.** `tavus_patch_pal` on `p7ac55cbadb2`, replacing `/system_prompt`, `/greeting`,
   `/objectives_id` (the new ID from step 1), `/guardrail_ids`, `/document_ids`,
   `/layers/conversational_flow`, and `/skills/magic_canvas/config` with the values in `pal.json`.
   Remove `/layers/stt` and `/layers/llm` if the redesign added them — they did not exist before.
4. **Perception.** `tavus_pal_capability_patch(capability="perception", perception_model="raven-1")`
   with no awareness queries, which is how it was configured.

## What a restore does not undo

- Supabase columns added by migration `0003`. They are additive and nullable, so old-shape
  objective callbacks keep working against them untouched.
- Knowledge documents `d8-91071d1b6401` and `d4-5c8ea5c10a3e` if they were deleted rather than
  detached. The redesign only detaches them, so re-attaching via `document_ids` is enough.
- Intake rows already written under the new agent.
