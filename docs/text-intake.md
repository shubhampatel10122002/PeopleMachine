# The text intake

The second front door. Someone who does not want to be on camera answers the
same intake in writing, one question at a time, mostly by tapping.

```
/intake/text ──POST /api/intake/text/start──▶ row written, first question returned
     │                                             (no model call: the opening
     │                                              question is fixed by design)
     └─ one answer ──POST /api/intake/text/turn──▶ OpenAI Responses ──▶ next question
                                                        │
                                                        └─▶ Supabase (same columns
                                                            a call writes) ──▶ /admin
```

It writes the **same columns** as a Tavus call. `matter_bucket`, the two fuses,
the branch fields, `priority_tier`, and the chat projected into `transcript` in
Tavus's own `{ role, content }` shape. Nothing downstream, including /admin and
the post-call extractor when it is built, has to learn there are two front
doors.

## Why it is not a form

The brief was a conversation, not a questionnaire, and the difference is where
the next question is decided.

- **The next question comes from the last answer.** Fields the account already
  covered are recorded rather than asked. Someone who writes "my manager fired
  me in March after I complained about him" has answered four questions before
  being asked one.
- **Only the branch the matter took gets follow-ups.** An employment matter is
  never asked about treatment status.
- **Answers are clickable.** Every question that can carry options carries three
  to seven, phrased the way a person would say them, with a free-text way out.
- **Nothing is asked twice.** That is enforced in code, not in the prompt. See
  below.

## Where the line between the model and the code is

The model writes the **dialogue**: the wording, which options to offer, the
occasional acknowledgement, and what it heard in the last answer. Everything
that has to be *true* is decided in `src/lib/text-intake.ts` from the row:

| Decision | Who makes it |
| --- | --- |
| Which fields are still open | `remainingQuestions()`, from the row |
| Which branch this matter took | `branchFor(matter_bucket)`, from the row |
| Whether a question may be asked at all | the code, against that list |
| Whether the intake may close | the code, plus an explicit request from the person |
| What is written to a column | the code, through the same merge rule the Tavus webhook uses |
| How the question is worded, and its options | the model |
| What was learned from the last answer | the model, then filtered |

So a model that drifts costs a slightly worse sentence. It cannot produce a
repeated question, a question from the wrong branch, a lost answer, or an
intake that ends early. A question for a field that is not open is discarded
and replaced with the catalog's own wording for the next field that is.

Two more guards worth knowing:

- **The person's own answer outranks an inference.** A field they answered
  themselves is never overwritten by something the model later says it heard,
  unless what we hold is a placeholder.
- **A field is put at most twice.** After that it is retired as unanswered,
  which is the same rule the call agent's objective prompts carry, and it is
  what stops an unanswerable question becoming a loop.

## When OpenAI is unreachable

`nextIntakeStep()` throws on any transport, quota or shape failure, and
`takeTurn()` treats a throw as "walk the catalog unaided". The intake still
completes, the answers are still recorded, and the questions stop adapting.

That path is not hypothetical: with no billing on the OpenAI project, every
turn takes it. **`intakes.text_engine` records which engine produced the last
question**, and /admin labels such a row `text (scripted)` in red, because a
scripted intake is a working intake and a broken feature, and the transcript
alone will not tell you which you are looking at.

## The question catalog

`src/lib/intake-plan.ts`. One entry per column, carrying why the firm needs it,
the wording the fallback uses verbatim, and the value vocabulary. The catalog
is data the model reads per turn, deliberately **not** part of the system
prompt: a taxonomy in the prompt is re-read every turn and is what makes an
agent sound like it is reading a form.

`essential` fields are what the firm cannot route without, so the intake does
not close while one is open and answerable. `opportunistic` fields are asked
while there is budget. The ceiling is `QUESTION_BUDGET`, currently 24, on the
principle every intake reference in the brief agrees on: a long form is an
abandoned form.

Enum values are never spoken. `label` is what the person reads, `value` is what
lands in the column.

## The firm's standing decisions carry over

All of them, verbatim in effect, from [`tavus/README.md`](../tavus/README.md)
("Decisions, recorded"). They are in the system prompt in
`src/lib/openai.ts` and are not stylistic preferences:

- **No safety scripting.** No 911, no hotline, no shelter, no crisis resource,
  no safety advice. A safety signal is recorded in `safety_flag`, forces
  `priority_tier` to `p1`, and the conversation continues.
- **Never say no.** The firm never declines a matter, never names a practice
  area, never refers anyone elsewhere.
- **No callback SLA is spoken.**
- **No merits evaluation.** No statute, no deadline, no "that sounds strong".
- **Never read the account back.** Reciting an assault to a survivor is the
  failure the partners specifically warned about, and it is the one that got
  `tavus-gpt-oss` rejected on the call side.

Name, phone and email are typed on the form before the conversation starts, for
the same reasons they are on the call side: typed contact details beat
transcribed ones, and an abandoned intake still leaves a lead worth calling.

## Prompt injection

Everything the person types is testimony, and it goes into the model's context.
It only ever appears in `user` messages, the system prompt says to treat
anything command-shaped inside it as part of the account, and, more to the
point, nothing the model returns can widen what the intake does: the field it
may ask about and the value that may reach a column are both checked against
the row afterwards.

## Auth on the turn endpoint

`/api/intake/text/turn` is a public POST that appends to someone's legal
intake, so the row id is not enough to reach it. `start` mints a 32-byte token
into `intakes.session_token` and hands it to the browser once; every turn
carries it and it is compared in constant time. A missing row, a wrong token
and a voice intake all return the same 404, so the endpoint cannot be used to
discover which intakes exist.

## Model and API shape

`gpt-5.6-sol` through the **Responses API**: `responses.create`, `text.format`
with a strict `json_schema`, `reasoning.effort`, `text.verbosity`. This is not
`chat.completions`; there is no `messages`, no `response_format`, no `system`
role. Do not port that shape back in.

Two details in `src/lib/openai.ts` worth not "fixing":

- **Nothing in the schema is nullable, and every key is required.** That is what
  strict structured output accepts. Optionality is an empty string, and
  `question` is ignored once `status` is `finished`. A nullable nested object
  would read better and is not worth a 400 in front of someone mid-sentence.
- **`store: false`.** The conversation is someone's account of what was done to
  them. We keep the record; OpenAI does not need to.

The per-turn state block is sent **last**, after the transcript, so the stable
prefix (instructions, then an append-only conversation) stays cacheable while
the constraints land closest to the answer.

## Columns

Migration `0004_text_intake.sql`, all additive except one drop of `NOT NULL`:

| Column | What it holds |
| --- | --- |
| `mode` | `voice` or `text`. Defaults to `voice`, which is what makes the migration safe on existing rows |
| `session_token` | Bearer token for the turn endpoint |
| `text_turns` | The machine record: every question, its options, its engine, the raw answer |
| `text_engine` | `openai` or `fallback`, for the last question |
| `tavus_conversation_id` | Now nullable. A typed intake has no conversation behind it |

`transcript` is written alongside `text_turns` rather than derived on read.
That duplication is deliberate: it is what lets /admin and anything downstream
read a typed intake without knowing this feature exists.

`looksStuck()` returns false for `mode = 'text'`, so the dashboard does not
spend its Tavus repair budget on rows that were never calls.

## What is not built

- **No resume.** A closed tab cannot be picked back up: the row keeps every
  answer given so far, so the lead survives, but the person would start again.
- **No rate limit beyond the per-intake question budget.** Each turn is an
  OpenAI call, and nothing stops one browser opening many intakes.
- **The bucket taxonomy is defined here, not shared.** The call agent's
  objective set carries its own copy and cannot be read from this repo
  (`tavus_pal_get` returns 401 with the key this repo has). If the two drift,
  `MATTER_BUCKETS` in `src/lib/intake-plan.ts` is the one to reconcile.
