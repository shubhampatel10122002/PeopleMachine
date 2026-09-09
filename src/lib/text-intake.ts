import { AGENT_NAME } from "./agent";
import {
  branchFor,
  essentialProgress,
  essentialsSettled,
  hasRealAnswer,
  isWritableField,
  questionSpec,
  remainingQuestions,
  venueFor,
  type InputType,
  type Option,
  type QuestionSpec,
} from "./intake-plan";
import { nextIntakeStep, type ModelStep } from "./openai";
import {
  isNonAnswer,
  shouldOverwriteField,
  type Intake,
  type IntakeField,
  type TranscriptTurn,
} from "./types";

/**
 * The turn loop behind /intake/text.
 *
 * The division of labour with the model is the whole design. The model writes
 * the dialogue: the wording, the options, the acknowledgement, and what it
 * heard in the last answer. Everything that must be *true* is decided here,
 * from the row:
 *
 * - which fields are still open (so a question can never repeat),
 * - which branch the matter took (so an injury question can never land on an
 *   employment matter),
 * - whether the intake may close,
 * - and what actually gets written to a column.
 *
 * A model that drifts therefore costs a slightly worse sentence, never a
 * repeated question, a lost answer, or an intake that ends early. And when the
 * model cannot be reached at all, the same machinery walks the catalog
 * unaided: the intake still completes, it just stops being dynamic.
 */

/** Which side produced the question the person is looking at. */
export type TextEngine = "openai" | "fallback";

export type TurnQuestion = {
  field: string;
  text: string;
  helper: string | null;
  input: InputType;
  options: Option[];
  /** Whether a free-text box is offered alongside the options. */
  allowOther: boolean;
  allowSkip: boolean;
};

export type TurnAnswer = {
  at: string;
  /** Exactly what the person submitted, for the transcript. */
  raw: string;
  /** Option values chosen, empty when they typed instead. */
  values: string[];
  skipped: boolean;
};

/** One question and its answer. The last entry's answer is null until given. */
export type TextTurn = {
  at: string;
  engine: TextEngine;
  acknowledgement: string | null;
  question: TurnQuestion;
  answer: TurnAnswer | null;
};

export type AnswerInput = {
  values: string[];
  text: string;
  skipped: boolean;
  /** The person pressed "I'm done". Ends the intake wherever it stands. */
  ended: boolean;
};

export type TurnReply = {
  status: "asking" | "finished";
  acknowledgement: string | null;
  question: TurnQuestion | null;
  closingMessage: string | null;
  progress: { answered: number; total: number };
};

export type TurnResult = {
  updates: Record<string, unknown>;
  reply: TurnReply;
};

/**
 * The ceiling on questions. The intake references are unanimous that a long
 * form is an abandoned form; this is the point past which we take what we have
 * and let an attorney ask the rest.
 */
export const QUESTION_BUDGET = 24;

/** Longest answer accepted. Past this it is a document, not an answer. */
export const MAX_ANSWER_CHARS = 4000;

/** Most options a question may carry. More than this reads as a form. */
const MAX_OPTIONS = 8;

const CLOSING_FALLBACK =
  "Thank you for taking the time to write all of that down. An attorney at the firm will review what you shared and reach out at the number you gave us.";

// --- reading the row -------------------------------------------------------

export function readTurns(intake: Intake): TextTurn[] {
  const turns = (intake as unknown as { text_turns?: unknown }).text_turns;
  return Array.isArray(turns) ? (turns as TextTurn[]) : [];
}

/**
 * How many times each field has been put to the person. A field asked twice is
 * retired by `remainingQuestions`, which is what keeps an unanswerable
 * question from becoming a loop.
 */
export function askedCounts(turns: TextTurn[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const turn of turns) {
    const field = turn.question?.field;
    if (field) counts[field] = (counts[field] ?? 0) + 1;
  }
  return counts;
}

/**
 * Fields the person answered themselves, as opposed to fields the model
 * inferred. Their own answer is the better record, so nothing the model reads
 * out of the conversation later may overwrite one.
 */
function personAnsweredFields(turns: TextTurn[]): Set<string> {
  const answered = new Set<string>();
  for (const turn of turns) {
    if (turn.answer && !turn.answer.skipped && turn.question?.field) {
      answered.add(turn.question.field);
    }
  }
  return answered;
}

/** The conversation as the model sees it: what was asked, what was said. */
function buildHistory(turns: TextTurn[]): {
  role: "assistant" | "user";
  content: string;
}[] {
  const history: { role: "assistant" | "user"; content: string }[] = [];
  for (const turn of turns) {
    const asked = [turn.acknowledgement, turn.question?.text]
      .filter((part): part is string => Boolean(part && part.trim()))
      .join(" ");
    if (asked) history.push({ role: "assistant", content: asked });
    if (turn.answer) {
      history.push({
        role: "user",
        content: turn.answer.skipped
          ? "(skipped this question)"
          : turn.answer.raw,
      });
    }
  }
  return history;
}

/**
 * The chat, projected into the `{ role, content }` shape Tavus sends for a
 * call. Deliberate duplication of `text_turns`: it means /admin, and anything
 * downstream that reads `transcript`, works on a typed intake without knowing
 * this feature exists.
 */
export function projectTranscript(turns: TextTurn[]): TranscriptTurn[] {
  const transcript: TranscriptTurn[] = [];
  for (const turn of turns) {
    const asked = [turn.acknowledgement, turn.question?.text]
      .filter((part): part is string => Boolean(part && part.trim()))
      .join(" ");
    if (asked) transcript.push({ role: "assistant", content: asked });
    if (turn.answer) {
      transcript.push({
        role: "user",
        content: turn.answer.skipped ? "(skipped)" : turn.answer.raw,
      });
    }
  }
  return transcript;
}

function withUpdates(intake: Intake, updates: Record<string, unknown>): Intake {
  return { ...intake, ...updates } as Intake;
}

// --- questions -------------------------------------------------------------

function toQuestion(spec: QuestionSpec): TurnQuestion {
  return {
    field: spec.field,
    text: spec.question,
    helper: spec.helper ?? null,
    input: spec.input,
    options: (spec.options ?? []).slice(0, MAX_OPTIONS),
    allowOther: spec.allowOther,
    allowSkip: spec.allowSkip,
  };
}

/**
 * The one question every intake opens with, asked before any model call. It is
 * fixed by design, because the account comes first and nothing about it
 * depends on what we already know, so the first thing the person sees never
 * waits on an API round trip.
 */
export function openingTurn(firstName: string): TextTurn {
  const spec = questionSpec("narrative_summary");
  if (!spec) throw new Error("The question plan has lost its opening question.");
  return {
    at: new Date().toISOString(),
    // Not a model turn, and labelled honestly as such, so `text_engine` on a
    // row that never got past the first question is not read as a model that
    // worked.
    engine: "fallback",
    acknowledgement: `Hi ${firstName}, I'm ${AGENT_NAME}. I'll ask a few things, and I'll keep it as short as I can.`,
    question: toQuestion(spec),
    answer: null,
  };
}

/**
 * Takes the model's question and makes it safe to show: the field must be one
 * that is genuinely open, the options are deduped and capped, and a select with
 * nothing to select becomes a text box. Anything that fails lands on the
 * catalog's own wording for the same field, and a question for a field that is
 * not open at all is discarded outright in favour of the next open one.
 */
function reconcileQuestion(
  proposed: ModelStep["question"] | null,
  remaining: QuestionSpec[],
): TurnQuestion | null {
  const fallbackSpec = remaining[0];

  const spec = proposed
    ? remaining.find((candidate) => candidate.field === proposed.field)
    : undefined;

  if (!spec || !proposed) {
    return fallbackSpec ? toQuestion(fallbackSpec) : null;
  }

  const seen = new Set<string>();
  const options: Option[] = [];
  for (const option of proposed.options ?? []) {
    const value = option?.value?.trim();
    const label = option?.label?.trim();
    if (!value || !label || seen.has(value)) continue;
    seen.add(value);
    options.push({ value, label });
    if (options.length >= MAX_OPTIONS) break;
  }

  const text = proposed.text?.trim() || spec.question;
  const wantsOptions =
    proposed.input_type === "single_select" ||
    proposed.input_type === "multi_select";

  return {
    field: spec.field,
    text,
    helper: proposed.helper?.trim() || spec.helper || null,
    // A select with no options would render as a dead end.
    input: wantsOptions && options.length === 0 ? "text" : proposed.input_type,
    options: wantsOptions ? options : [],
    // The catalog's `allowOther` is a floor, not a ceiling: the model may add a
    // free-text way out of any list, and may never take one away.
    allowOther: spec.allowOther || proposed.allow_other === true,
    allowSkip: spec.allowSkip && proposed.allow_skip !== false,
  };
}

// --- writing answers -------------------------------------------------------

/** What the person's own answer puts in the column. */
function answerToValue(question: TurnQuestion, answer: AnswerInput): string {
  if (answer.skipped) return "declined";

  const typed = answer.text.trim().slice(0, MAX_ANSWER_CHARS);
  const chosen = answer.values
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value) => question.options.some((option) => option.value === value));

  if (chosen.length === 0) return typed;
  if (!typed) return chosen.join(", ");
  // "Something else" alongside a choice: keep both, in the order shown.
  return [...chosen, typed].join(", ");
}

/** The same answer, as the person would read it back in the transcript. */
function answerToRaw(question: TurnQuestion, answer: AnswerInput): string {
  if (answer.skipped) return "(skipped)";

  const typed = answer.text.trim().slice(0, MAX_ANSWER_CHARS);
  const labels = answer.values
    .map(
      (value) =>
        question.options.find((option) => option.value === value)?.label ?? value,
    )
    .filter(Boolean);

  return [...labels, typed].filter(Boolean).join(", ");
}

/**
 * Applies what the model says it heard.
 *
 * Two guards, in this order. A field the person answered themselves is never
 * overwritten by an inference, unless what we hold is a placeholder, in which
 * case a real answer is an improvement. Everything else goes through the same
 * merge rule the Tavus webhook uses, so 'unknown' can never bury an answer.
 */
function applyCaptures(
  intake: Intake,
  captured: ModelStep["captured"],
  personAnswered: Set<string>,
  updates: Record<string, unknown>,
): void {
  for (const entry of captured ?? []) {
    const field = entry?.field;
    const raw = typeof entry?.value === "string" ? entry.value.trim() : "";
    if (!field || !raw || !isWritableField(field)) continue;

    const value = raw.slice(0, MAX_ANSWER_CHARS);
    const held = (updates[field] ?? intake[field]) as string | null;

    if (
      personAnswered.has(field) &&
      typeof held === "string" &&
      held.trim() &&
      !isNonAnswer(held)
    ) {
      continue;
    }

    if (shouldOverwriteField(held, value)) {
      updates[field] = value;
    }
  }
}

/**
 * Fields nobody has to say out loud. `matter_venue` follows from the bucket,
 * and `priority_tier` from the safety flag and the urgency, so the callback
 * queue is ordered even on an intake the model never got to touch.
 */
function applyDerived(
  intake: Intake,
  updates: Record<string, unknown>,
  finishing: boolean,
): void {
  const merged = withUpdates(intake, updates);

  const venue = venueFor(merged.matter_bucket);
  if (venue && !merged.matter_venue) updates.matter_venue = venue;

  if (!finishing || merged.priority_tier) return;

  const safety = (merged.safety_flag ?? "").toLowerCase();
  const urgency = (merged.urgency ?? "").toLowerCase();
  const flagged = safety.startsWith("yes") || safety.startsWith("guardrail");

  if (flagged || urgency === "high") updates.priority_tier = "p1";
  else if (urgency === "medium") updates.priority_tier = "p2";
  else updates.priority_tier = "p3";
}

// --- the turn --------------------------------------------------------------

/**
 * Records one answer and produces the next question.
 *
 * Returns the column updates to persist and what to show the person; it does
 * no I/O of its own beyond the model call, so the route stays in charge of the
 * single write.
 */
export async function takeTurn(
  intake: Intake,
  answer: AnswerInput,
): Promise<TurnResult> {
  const turns = readTurns(intake);
  const pending = turns.at(-1);
  const updates: Record<string, unknown> = {};

  // Record the answer against whatever was actually asked, which is the last
  // question this row put and not whatever the client says it is answering.
  // A submission that arrives when nothing is pending is a stale tab or a
  // double submit: it is not written to a field at all, since the only field
  // it could go to is the wrong one, and the turn simply moves on.
  if (pending && !pending.answer) {
    // A skip on a question that does not offer one is discarded rather than
    // written as 'declined'. The UI never shows the control, so this only
    // happens to a hand-made request, and the question is worth more open than
    // it is answered by a client that decided for the person.
    const submitted: AnswerInput = {
      ...answer,
      skipped: answer.skipped && pending.question.allowSkip,
    };

    pending.answer = {
      at: new Date().toISOString(),
      raw: answerToRaw(pending.question, submitted),
      values: submitted.values,
      skipped: submitted.skipped,
    };

    const value = answerToValue(pending.question, submitted);
    if (value && isWritableField(pending.question.field)) {
      const field = pending.question.field as IntakeField;
      // The person's own words win outright: this is the only write that does
      // not consult the merge rule.
      updates[field] = value;
    }
  }

  const answered = withUpdates(intake, updates);
  const counts = askedCounts(turns);
  const personAnswered = personAnsweredFields(turns);

  let engine: TextEngine = "openai";
  let step: ModelStep | null = null;

  try {
    step = await nextIntakeStep({
      known: knownFields(answered),
      remaining: remainingQuestions(answered, counts),
      branch: branchFor(answered.matter_bucket),
      askedCount: turns.length,
      questionBudget: QUESTION_BUDGET,
      mayFinish: essentialsSettled(answered, counts),
      history: buildHistory(turns),
    });
  } catch (error) {
    // Never fatal. The person keeps answering; the questions stop adapting.
    console.error("Text intake model call failed; using the scripted plan", error);
    engine = "fallback";
  }

  if (step) {
    applyCaptures(answered, step.captured, personAnswered, updates);
  }

  const merged = withUpdates(intake, updates);
  const remaining = remainingQuestions(merged, counts);

  // The model may close the intake, but not before there is an account to
  // close on: a "finished" on the opening turn is drift, not a decision.
  // A declined or unanswered opening does not count as an account.
  const hasNarrative = hasRealAnswer(merged, "narrative_summary");
  const finishing =
    answer.ended ||
    remaining.length === 0 ||
    turns.length >= QUESTION_BUDGET ||
    (step?.status === "finished" && hasNarrative);

  const question = finishing ? null : reconcileQuestion(step?.question ?? null, remaining);
  const acknowledgement = step?.acknowledgement?.trim() || null;

  if (question) {
    turns.push({
      at: new Date().toISOString(),
      engine,
      acknowledgement,
      question,
      answer: null,
    });
  }

  applyDerived(intake, updates, finishing || !question);

  const closingMessage =
    finishing || !question
      ? step?.closing_message?.trim() || CLOSING_FALLBACK
      : null;

  updates.text_turns = turns;
  updates.transcript = projectTranscript(turns);
  updates.text_engine = engine;

  if (finishing || !question) {
    updates.status = "completed";
    updates.ended_at = new Date().toISOString();
    updates.transcript_ready_at = new Date().toISOString();
  }

  return {
    updates,
    reply: {
      status: question ? "asking" : "finished",
      acknowledgement: question ? acknowledgement : null,
      question,
      closingMessage,
      progress: essentialProgress(withUpdates(intake, updates)),
    },
  };
}

/**
 * What we already hold, for the model to work from and never ask about.
 * Placeholders are included on purpose: 'unknown' means asked and unanswered,
 * which is exactly as useful to know as an answer.
 */
function knownFields(intake: Intake): Record<string, string> {
  const known: Record<string, string> = {};

  // The contact details, so the model can see they are on file and knows not
  // to ask. They are not writable fields here; the form owns them.
  for (const field of ["first_name", "callback_phone", "email"] as const) {
    const value = intake[field];
    if (value) known[field] = value;
  }

  for (const key of Object.keys(intake)) {
    if (!isWritableField(key)) continue;
    const value = intake[key];
    if (typeof value === "string" && value.trim()) known[key] = value;
  }

  return known;
}
