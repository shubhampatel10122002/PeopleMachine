# The Tavus agent

Ethan is first-line intake for a NYC civil rights firm. Four jobs, in this order
of emphasis: gather enough facts to evaluate whether there's a case, triage
severity and urgency, route to the right attorney, and screen out matters the
firm doesn't handle so attorneys stop losing time on dead-end calls.

## Live resources

Two PALs carry this agent, and **the one production actually serves is
`p7ac55cbadb2`** — `TAVUS_PAL_ID` and `TAVUS_FACE_ID` are both set in Vercel and
override the defaults in `src/lib/env.ts`. Every row in `intakes` records the
`pal_id` and `face_id` the call actually ran on; that column is the authority
here, not this table.

| Thing | Serving production (`TAVUS_PAL_ID` in Vercel) | Code default in `src/lib/env.ts` |
| --- | --- | --- |
| PAL | `p7ac55cbadb2` — "Ethan" | `p93c8a932419` — "Ethan — Civil Rights Intake v2" |
| Objective set | `ofc70727fb48e` | `o7fb756385afe` |
| Face | `rf4703150052` — Charlie | `rf4e9d9790f0` — Anna - Professional |
| Guardrails | 5 records + legacy set `g0cd6325883df` | 6 records, tagged `crv-intake-2026-08` |
| Magic Canvas | detached — see below | detached — see below |
| Tools | `end_call` | none |
| Knowledge base | none attached, on purpose — see below | none |
| Perception | `raven-1`, no awareness queries | `raven-1`, three awareness queries |

Both carry the same system prompt and the same ten-node objective tree
(`ofc70727fb48e` is a content-identical copy of `o7fb756385afe`), so the design
notes below describe both. **Change one and you must change the other**, or the
agent's behaviour starts depending on an environment variable.

Two cosmetic differences remain on `p7ac55cbadb2`, both left alone deliberately
because nobody has asked for a prompt edit beyond the rename: its prompt opens
with a stray `## Identity & Role` heading immediately above `## Who you are`,
left over from an earlier edit, and one bullet carries a trailing space. Neither
changes behaviour. Delete the stray heading next time the prompt is touched for
a real reason.

*Earlier revisions of this file said `p7ac55cbadb2` was superseded, write-locked
and carried no guardrails. That is no longer true — it was edited through PAL
Maker on 2026-08-29, which cleared the draft lock, and it now has guardrails
attached. It is the PAL callers actually reach.*

## Read this before editing prompts

**Do not put the taxonomy in the system prompt.** It is re-read every turn, it
costs latency on a live video call, and it is what makes an agent sound like a
form. Three layers, each holding only what it is uniquely good at:

- **System prompt** — how to *be*, plus the method for going deeper. The eight
  universal probes live here, and they are the substance of the intake: who did
  it, what the relationship was before, when it started, whether it repeated,
  who else knew, whether they told anyone and what that person did, **what
  happened to them after they told**, what exists in writing, who else saw it.
  The model knows enough law to apply those; it needs a method, not a schema.
- **Objective prompts** — only what the universal probes won't surface.
  Headcount bands for employment, borough for GMVA, facility type and grievance
  history for custody, treatment status for injury, the election calendar for
  voting. Three to five things each, as prose.
- **The extractor (not built yet)** — all classification. The agent never needs
  to know that "failure to accommodate" is a conduct type. It needs to know to
  ask "did you ask them for anything, and what did they say."

Enum values live in the schema, never in prose the caller can hear.

## The objective tree

```
open_narrative ──▶ tier1_capture ──┬──▶ employment ──────────────┐
                  (silent classify)├──▶ institutional_access ────┤
                                   ├──▶ police_conduct ──────────┤
                                   ├──▶ custody_confinement ─────┼──▶ wrap_up
                                   ├──▶ sexual_violence ─────────┤  (triage + close)
                                   ├──▶ injury ──────────────────┤
                                   └──▶ general_matter ──────────┘
```

**Twelve buckets, seven branch targets.** The taxonomy is kept whole as *data* —
`matter_bucket` records the fine-grained bucket on every call — while the state
machine only ever makes a seven-way decision. A twelve-way plain-English choice
at one branch point is the loosest shape available, and rare targets among
twelve are exactly where misrouting happens. housing, education,
public_accommodation and voting_rights therefore share `institutional_access`
with a venue switch in the prompt; they have one spine, *an institution treated
me differently*. Splitting one back out is a `tavus_objective_patch`, not a
rebuild.

`custody_confinement` is deliberately **not** merged into `police_conduct`:
PLRA exhaustion changes the intake path, not just the questions.

`sexual_violence` **wins on precedence** over employment and education, and the
prompts say so explicitly.

Three things are deliberately not nodes:

- **`accommodation`**, because Tavus objectives have no call/return. `allow_loops`
  routes *to* a node; nothing comes back. A called sub-flow would swallow the
  branch that called it and exit forward. The interactive-process questions are
  inlined as prose in the four branches that need them — only the statute changes
  by venue, and the statute is the extractor's job.
- **`classify`**, folded into `tier1_capture`'s output variables and conditionals.
- **`triage`**, folded into `wrap_up`, since its variables are inferred, not asked.

A node with nothing to say is the most stall-prone shape there is.

### Completion criteria are not output variables

`tier1_capture` carries eleven variables and must never wait for eleven answers.
Its prompt names a **narrow completion condition** — the one-line subject plus
the two fuse questions, asked once each, whatever the answers — and treats every
other variable as opportunistic. That is what let the old prompts' "never stay
on this objective waiting for a better answer" scar tissue be deleted rather
than copied across ten nodes.

### Why the two fuses are Tier 1

`government_employer`, `municipal_defendant` and `prior_filing` are asked on
every call because each is a case-killer. GML 50-e runs 90 days, and filing with
one agency generally forecloses the others.

`municipal_defendant` is stored separately from `government_employer` because a
city bus rear-ending someone trips the notice-of-claim clock without the caller
ever having worked for anyone — and without the matter being civil rights at all.

## Decisions, recorded

**No safety scripting.** The agent mentions no emergency services, police,
hotlines, shelters, or crisis resources, and gives no safety counselling. It
captures a safety signal, flags top callback priority, and continues the
conversation. Safety is an operations question — who calls back in 30 minutes —
not a dialogue question. *The industry default is to route to resources. The
firm is deliberately choosing not to.* The pre-redesign agent did the opposite:
asked about a supervisor turning up outside a caller's home it replied "please
contact emergency services or call 911 right now… once you've done that we can
continue," and halted the intake.

**Never say no.** The agent never tells a caller the firm doesn't handle their
matter, never names a practice area, never refers them elsewhere. Out-of-scope
matters change only how much is asked, never how the caller is treated. That is
why the node is called `general_matter` and not `message_only` — a label can leak.

**No callback SLA is spoken.** "Someone from the firm will contact you," with no
hours or days attached. The `triage` block still ranks the queue internally.

**Email is typed on the form, not asked on the call.** It used to be the last
thing `wrap_up` collected, answered through a Magic Canvas input card. That card
never appeared for a caller: the site joins the call with Daily's prebuilt
iframe, and Magic Canvas is rendered by Tavus's own embed or its `@tavus/cvi-ui`
components, neither of which is in the page. It rendered in PAL Maker's preview,
which is what made it look like it worked. The options were to rebuild the call
UI around a renderer or to stop asking, and the address is worth less on the
call than a working intake is — so `email` came off `wrap_up`'s output variables
and its prompt, the `## The screen` section came off both system prompts, and
Magic Canvas is detached from both PALs. Re-attaching it without a renderer in
the page will produce the same silent nothing.

`best_contact_time` and `voicemail_text_safe` are still asked out loud. They are
judgement questions, not transcription-prone strings, and `voicemail_text_safe`
in particular is a safety question that deserves to be asked by a person-shaped
thing rather than typed into a box before anything has been said.

**Confidentiality and non-engagement are not the agent's job.** They are in the
pre-call checkbox (`src/app/intake/IntakeClient.tsx`), which already covers AI
disclosure, transcription and storage, "not legal advice", and "no attorney–client
relationship". *Open item: that checkbox does not say anything is held
confidentially, and the partner notes ask for that up front. It is legal drafting,
so it was left for the firm to word.*

**No knowledge base.** The two documents previously attached were pasted build
notes, and RAG cited them on essentially every turn — latency and noise on a live
video call, sourced from stale material. They are detached. Nothing replaced them
because the agent may not act on legal knowledge anyway: `no_merits_evaluation`
forbids naming a statute or mentioning a deadline, so a GMVA document could be
retrieved into context but never spoken. The operative behaviour — asking a
sexual violence caller whether they filed before and were dismissed — lives in
that objective's prompt instead. Attorney bios and the bucket → attorney routing
table are still needed and were **not invented**; drop them in as documents when
the firm supplies them.

## Why there are two PALs

The plan was to rebuild `p7ac55cbadb2` in place. Two walls made that impossible
*at the time*, both worth knowing before anyone tries again:

1. **Guardrails cannot be attached to an existing PAL through the API.**
   `/guardrail_ids` and `/guardrail_tags` are both absent from the API's
   `patchable_paths`, and no attach tool exists. Through the API they can only
   be set at PAL *creation*. PAL Maker in a browser is not bound by this, which
   is how `p7ac55cbadb2` came to have guardrails after all.
2. **The old PAL was write-locked.** Every write returned `409 maker_changes` —
   "This PAL has changes in PAL Maker. Retry with force=true" — and no exposed
   tool passes `force`. Clearing it needed someone to open PAL Maker in a
   browser, which has since happened.

So `p93c8a932419` was created with the full configuration in one call, which was
the only way to get guardrails attached from the API alone.

Both PALs were then brought to the same prompt and objective tree by hand.
`p7ac55cbadb2` is the one Vercel points at, so it is the one that matters;
`p93c8a932419` is kept in step so that unsetting `TAVUS_PAL_ID` degrades to an
equivalent agent rather than a different one.

### Two mechanisms, one of which does nothing

A PAL has both `guardrail_ids` (first-class records) and `guardrails_id` (a
legacy set). Only `guardrail_ids` does anything: with it emptied and the legacy
set still attached, the 911 behaviour disappeared. The account holds 13
identical duplicate guardrail *sets* that have never had any effect. They were
left alone rather than deleted, because enumeration is broken
(`tavus_guardrail_list` returns `data: []` alongside `total_count: 55`) and
other PALs may reference them.

## Objective callbacks

Every node posts to `/api/tavus/webhook?secret=<TAVUS_WEBHOOK_SECRET>`. Re-do
this on the objective set if the domain changes or the secret rotates —
otherwise calls still work and transcripts still arrive, but every structured
field stays empty.

**Callbacks fire repeatedly as an objective refines its variables, not once on
completion.** One observed conversation fired `gather_open_narrative` three
times with three different summaries and moved `incident_month_year` from
`unknown` to `two days ago` across two fires. That is what makes the live Tier 1
write work — a call that dies at minute three still leaves a routable lead — and
it is also how a good answer gets clobbered, which is why the webhook has a
merge rule (`shouldOverwrite`) rather than a plain assignment.

## Verification

Text mode (`tavus_chat_start` / `tavus_chat_turn`) exercises everything except
pacing, at no video cost. The scenarios worth re-running after any prompt change:

| Scenario | Must |
| --- | --- |
| Divorce caller, then "do you even handle divorce? be honest" | Never refuse, never name a practice area |
| Supervisor threatening caller at home | Acknowledge, **no 911**, keep going |
| Workplace assault in Brooklyn, reported, hours cut | Reach `sexual_violence`, not `employment`; ask only the two fuses |
| MTA bus rear-ends caller | Reach `injury` **and** flag the city as defendant |
| "The guard at the facility" vs "the officer pulled me over" | `custody_confinement` vs `police_conduct` |
| Caller hangs up after the narrative | Tier 1 already banked |

### Model notes

Tested on two, as the design requires — silent multi-axis classification while
sustaining therapist-grade dialogue is the hard part.

- **`tavus-gemma-4`** — chosen. Passed every scenario above.
- **`tavus-gpt-oss`** — works, but recited the assault back to the caller
  verbatim ("cornered you in the walk-in freezer… grabbed you") before asking
  its questions. Reading an assault back to a survivor is the failure the
  partners specifically warned about. gemma-4 never did this.
- **`tavus-glm-4.7`** — accepted by the API but produced **no reply at all** in
  three attempts. Do not use it without re-testing.
