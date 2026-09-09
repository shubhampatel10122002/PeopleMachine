import type { Intake, IntakeField } from "./types";
import { isNonAnswer } from "./types";

/**
 * What the text intake is allowed to ask, and what it is allowed to write.
 *
 * This file is the *catalog*, not the script. The order and wording here are
 * what the model reads as raw material and what the fallback walks verbatim
 * when the model is unreachable. Which question comes next on a live
 * intake is decided per turn from what the person has already said. See
 * `src/lib/text-intake.ts`.
 *
 * Three rules shaped every entry:
 *
 * 1. **Enum values are never spoken.** `label` is what the person reads;
 *    `value` is what lands in the column. "Something at work" is a label;
 *    `employment` is a value. This is the same rule the call agent follows
 *    (tavus/README.md, "Read this before editing prompts").
 * 2. **Options are a vocabulary, not a menu.** A multi-select carries every
 *    value the column accepts; the model offers the three to seven that fit
 *    the matter in front of it. Showing all fourteen would be a form.
 * 3. **Nothing here is a new column.** Every field is one the call already
 *    writes, so an intake typed on this page and an intake spoken to the
 *    agent are the same row shape to /admin and to the extractor.
 */

/** The seven branch targets. Mirrors the objective tree in tavus/README.md. */
export type MatterBranch =
  | "employment"
  | "institutional_access"
  | "police_conduct"
  | "custody_confinement"
  | "sexual_violence"
  | "injury"
  | "general_matter";

export type Option = { value: string; label: string };

/**
 * The buckets recorded in `matter_bucket`, each mapped to the branch that
 * decides which follow-ups apply. housing, education, public_accommodation and
 * voting_rights deliberately share `institutional_access`: they have one
 * spine, *an institution treated me differently*, and a ten-way routing
 * decision is where misrouting happens.
 *
 * `venue` is what goes in `matter_venue`, so the venue is never a question:
 * naming the bucket already answers it.
 *
 * The call agent's objective set carries its own copy of this taxonomy and
 * cannot be read from this repo. If the two ever drift, this list is the one
 * to reconcile, being the only place the text intake defines it.
 */
export const MATTER_BUCKETS: {
  value: string;
  label: string;
  branch: MatterBranch;
  venue: string;
}[] = [
  { value: "employment", label: "Something at work", branch: "employment", venue: "workplace" },
  { value: "housing", label: "Housing, or my landlord", branch: "institutional_access", venue: "housing" },
  { value: "education", label: "A school, college or university", branch: "institutional_access", venue: "education" },
  { value: "public_accommodation", label: "A business or a public place", branch: "institutional_access", venue: "public_accommodation" },
  { value: "voting_rights", label: "Voting or an election", branch: "institutional_access", venue: "voting" },
  { value: "police_conduct", label: "Police or law enforcement", branch: "police_conduct", venue: "policing" },
  { value: "custody_confinement", label: "Jail, prison or immigration detention", branch: "custody_confinement", venue: "custody" },
  { value: "sexual_violence", label: "Sexual assault or sexual abuse", branch: "sexual_violence", venue: "sexual_violence" },
  { value: "injury", label: "I was physically hurt", branch: "injury", venue: "injury" },
  { value: "general_matter", label: "Something else", branch: "general_matter", venue: "general" },
];

/**
 * Which branch a stored `matter_bucket` routes to. Unrecognised values (the
 * person typed their own, or the call agent wrote a bucket this list does not
 * carry) route to `general_matter`, which asks the fewest extra questions
 * rather than the wrong ones.
 */
export function branchFor(matterBucket: string | null): MatterBranch {
  if (!matterBucket) return "general_matter";
  const normalized = matterBucket.trim().toLowerCase();
  return (
    MATTER_BUCKETS.find((bucket) => bucket.value === normalized)?.branch ??
    "general_matter"
  );
}

/** The venue implied by a bucket, so `matter_venue` is never asked out loud. */
export function venueFor(matterBucket: string | null): string | null {
  if (!matterBucket) return null;
  const normalized = matterBucket.trim().toLowerCase();
  return (
    MATTER_BUCKETS.find((bucket) => bucket.value === normalized)?.venue ?? null
  );
}

export type InputType = "single_select" | "multi_select" | "text" | "long_text";

/**
 * When a question may be asked.
 *
 * `opening` runs once and alone: one open question, the same one the call
 * opens with. `core` is everything that routes and evaluates the matter.
 * `closing` is the two contact questions, which belong at the end, because asking
 * someone the best time to call them back before they have said what happened
 * is what a form does.
 */
export type Stage = "opening" | "core" | "closing";

export type QuestionSpec = {
  field: IntakeField;
  stage: Stage;
  /**
   * `essential` fields are what the firm cannot route or evaluate without, so
   * the intake does not close while one is missing and answerable.
   * `opportunistic` fields are asked while there is budget for them.
   */
  necessity: "essential" | "opportunistic";
  /** Why the firm needs it. Read by the model; never shown to the person. */
  purpose: string;
  input: InputType;
  /** Verbatim wording for the fallback, and the register the model should keep. */
  question: string;
  helper?: string;
  /** The column's value vocabulary. The model offers a fitting subset. */
  options?: Option[];
  /** Whether a free-text answer is offered alongside the options. */
  allowOther: boolean;
  /** Whether the person may pass. A skipped field is recorded as `declined`. */
  allowSkip: boolean;
  /** Branch gate. Absent means every intake, whatever the matter. */
  branches?: MatterBranch[];
};

const YES_NO_UNSURE: Option[] = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "unknown", label: "I'm not sure" },
];

/**
 * The catalog, in the order the fallback asks them and the order the model is
 * shown as a default. Every entry writes exactly one column.
 */
export const QUESTION_PLAN: QuestionSpec[] = [
  {
    field: "narrative_summary",
    stage: "opening",
    necessity: "essential",
    purpose:
      "The person's own account, in their own words. Everything else is either drawn from this or checked against it.",
    input: "long_text",
    question: "Tell me what happened, in your own words.",
    helper: "Take as much space as you need. There's no right way to start.",
    allowOther: false,
    allowSkip: false,
  },

  {
    field: "matter_bucket",
    stage: "core",
    necessity: "essential",
    purpose:
      "Routes the matter to an attorney and decides which follow-ups apply. Infer it from the account whenever the account is clear; only ask when two buckets are genuinely live.",
    input: "single_select",
    question: "Which of these comes closest to what you're dealing with?",
    options: MATTER_BUCKETS.map(({ value, label }) => ({ value, label })),
    allowOther: true,
    allowSkip: false,
  },
  {
    field: "incident_date",
    stage: "core",
    necessity: "essential",
    purpose:
      "Filing deadlines run from it. Whatever precision the person has is an answer: 'last spring' is useful, an exact date is not required.",
    input: "single_select",
    question: "Roughly when did this happen?",
    options: [
      { value: "still happening", label: "It's still going on" },
      { value: "within the last week", label: "Within the last week" },
      { value: "within the last month", label: "Within the last month" },
      { value: "a few months ago", label: "A few months ago" },
      { value: "earlier this year", label: "Earlier this year" },
      { value: "more than a year ago", label: "More than a year ago" },
    ],
    allowOther: true,
    allowSkip: true,
  },
  {
    field: "opposing_party",
    stage: "core",
    necessity: "essential",
    purpose:
      "The conflict check runs on this name before anyone at the firm reads the matter, so a name beats a description.",
    input: "text",
    question: "Who's on the other side of this?",
    helper: "A person, a company, an agency: whatever name you'd put on it.",
    allowOther: false,
    allowSkip: true,
  },
  {
    field: "government_employer",
    stage: "core",
    necessity: "essential",
    purpose:
      "A case-killer fuse, asked on every intake whatever the matter. Public employment changes the deadline and the path.",
    input: "single_select",
    question:
      "Were you working for a government employer, like a city, state or federal agency, a public school or a public hospital?",
    options: [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
      { value: "n/a", label: "This isn't about a job" },
      { value: "unknown", label: "I'm not sure" },
    ],
    allowOther: false,
    allowSkip: true,
  },
  {
    field: "municipal_defendant",
    stage: "core",
    necessity: "essential",
    purpose:
      "The second fuse, and separate from the first on purpose: a city bus rear-ending someone starts a 90-day notice clock without the person ever having worked for anyone.",
    input: "single_select",
    question:
      "Is a city, state or county body involved on the other side, like the police, a public hospital, a transit authority or a public school?",
    options: YES_NO_UNSURE,
    allowOther: false,
    allowSkip: true,
  },
  {
    field: "prior_filing",
    stage: "core",
    necessity: "essential",
    purpose:
      "The third fuse. Filing with one agency generally forecloses the others, so an intake that misses this can route a matter that is already gone.",
    input: "single_select",
    question: "Have you already filed anything about this anywhere?",
    options: [
      { value: "no", label: "No, nothing yet" },
      { value: "eeoc", label: "With the EEOC" },
      { value: "state or city agency", label: "With a state or city human rights agency" },
      { value: "union grievance", label: "A union grievance" },
      { value: "court", label: "In court" },
      { value: "filed something, unsure what", label: "I filed something, but I'm not sure what" },
      { value: "unknown", label: "I'm not sure" },
    ],
    allowOther: true,
    allowSkip: true,
  },
  {
    field: "protected_basis",
    stage: "core",
    necessity: "opportunistic",
    purpose:
      "Which characteristic the treatment attached to. Offer only the ones the account makes plausible, and never argue with the answer.",
    input: "multi_select",
    question:
      "Do you think any of these had something to do with how you were treated?",
    options: [
      { value: "race", label: "Race or color" },
      { value: "national origin", label: "National origin or accent" },
      { value: "religion", label: "Religion" },
      { value: "sex", label: "Sex or gender" },
      { value: "pregnancy", label: "Pregnancy" },
      { value: "sexual orientation", label: "Sexual orientation" },
      { value: "gender identity", label: "Gender identity" },
      { value: "disability", label: "A disability or medical condition" },
      { value: "age", label: "Age" },
      { value: "immigration status", label: "Immigration status" },
      { value: "criminal record", label: "A criminal record" },
      { value: "caregiver status", label: "Having children or caring for family" },
      { value: "retaliation", label: "Because I spoke up or complained" },
      { value: "none", label: "None of these" },
      { value: "unknown", label: "I'm not sure" },
    ],
    allowOther: true,
    allowSkip: true,
  },
  {
    field: "conduct_types",
    stage: "core",
    necessity: "opportunistic",
    purpose:
      "What was actually done. Offer the handful that fit this matter: an eviction option on a police matter reads as a form.",
    input: "multi_select",
    question: "What did they actually do?",
    options: [
      { value: "termination", label: "Fired me or let me go" },
      { value: "hours or pay cut", label: "Cut my hours or my pay" },
      { value: "demotion", label: "Demoted me or moved me" },
      { value: "refused accommodation", label: "Refused a change I asked for" },
      { value: "harassing comments", label: "Comments, slurs or harassment" },
      { value: "unwanted touching", label: "Unwanted touching" },
      { value: "threats", label: "Threatened me" },
      { value: "physical force", label: "Used physical force" },
      { value: "denied access", label: "Denied me housing, service or access" },
      { value: "eviction", label: "Evicted me, or tried to" },
      { value: "arrest or detention", label: "Arrested or detained me" },
      { value: "search", label: "Searched me or my property" },
      { value: "denied medical care", label: "Denied me medical care" },
      { value: "ignored complaint", label: "Ignored it when I complained" },
      { value: "retaliation", label: "Came after me once I complained" },
    ],
    allowOther: true,
    allowSkip: true,
  },
  {
    field: "urgency",
    stage: "core",
    necessity: "opportunistic",
    purpose:
      "Feeds the callback queue. A hearing next week outranks a matter with no date attached.",
    input: "single_select",
    question: "Is there a date coming up, like a hearing or a deadline?",
    options: [
      { value: "high", label: "Yes, in the next couple of weeks" },
      { value: "medium", label: "Yes, in the next few months" },
      { value: "none", label: "Nothing I know of" },
      { value: "unknown", label: "I'm not sure" },
    ],
    allowOther: true,
    allowSkip: true,
  },

  // --- Branch follow-ups. Only one branch ever runs. -----------------------
  {
    field: "employer_headcount_band",
    stage: "core",
    necessity: "opportunistic",
    purpose:
      "Headcount decides which statute reaches the employer at all, and the bands are the thresholds rather than round numbers.",
    input: "single_select",
    question: "Roughly how many people work there?",
    helper: "A rough count is fine.",
    options: [
      { value: "fewer than 4", label: "Fewer than 4" },
      { value: "4 to 14", label: "4 to 14" },
      { value: "15 to 49", label: "15 to 49" },
      { value: "50 or more", label: "50 or more" },
      { value: "unknown", label: "I'm not sure" },
    ],
    allowOther: false,
    allowSkip: true,
    branches: ["employment"],
  },
  {
    field: "incident_borough",
    stage: "core",
    necessity: "opportunistic",
    purpose: "Venue, and which set of local protections applies.",
    input: "single_select",
    question: "Where did this happen?",
    options: [
      { value: "manhattan", label: "Manhattan" },
      { value: "brooklyn", label: "Brooklyn" },
      { value: "queens", label: "Queens" },
      { value: "bronx", label: "The Bronx" },
      { value: "staten island", label: "Staten Island" },
      { value: "elsewhere in new york", label: "Elsewhere in New York" },
      { value: "outside new york", label: "Outside New York" },
    ],
    allowOther: true,
    allowSkip: true,
    branches: [
      "police_conduct",
      "sexual_violence",
      "institutional_access",
      "employment",
      "custody_confinement",
    ],
  },
  {
    field: "incident_county",
    stage: "core",
    necessity: "opportunistic",
    purpose:
      "Only worth asking when the matter is outside the five boroughs and the borough question has therefore left the venue open.",
    input: "text",
    question: "Which county was that in?",
    allowOther: false,
    allowSkip: true,
    branches: ["institutional_access", "injury", "general_matter"],
  },
  {
    field: "facility_name",
    stage: "core",
    necessity: "opportunistic",
    purpose: "Names the custodian, and with it the grievance system that had to be exhausted.",
    input: "text",
    question: "Where were you being held?",
    allowOther: false,
    allowSkip: true,
    branches: ["custody_confinement"],
  },
  {
    field: "facility_type",
    stage: "core",
    necessity: "opportunistic",
    purpose:
      "Which system it sits in. Exhaustion and the deadline both differ between a city jail and immigration detention.",
    input: "single_select",
    question: "What kind of place was it?",
    options: [
      { value: "city jail", label: "A city jail" },
      { value: "state prison", label: "A state prison" },
      { value: "federal prison", label: "A federal prison" },
      { value: "immigration detention", label: "Immigration detention" },
      { value: "police holding", label: "A police precinct or holding cell" },
      { value: "juvenile facility", label: "A juvenile facility" },
      { value: "psychiatric facility", label: "A psychiatric facility" },
      { value: "unknown", label: "I'm not sure" },
    ],
    allowOther: true,
    allowSkip: true,
    branches: ["custody_confinement"],
  },
  {
    field: "injury_type",
    stage: "core",
    necessity: "opportunistic",
    purpose: "Damages, and which records to request first.",
    input: "multi_select",
    question: "What kind of injury are we talking about?",
    options: [
      { value: "broken bone", label: "A broken bone" },
      { value: "head injury", label: "A head injury or concussion" },
      { value: "back or neck", label: "Back or neck" },
      { value: "cuts or bruising", label: "Cuts or bruising" },
      { value: "burns", label: "Burns" },
      { value: "internal injury", label: "An internal injury" },
      { value: "psychological", label: "Psychological or emotional" },
    ],
    allowOther: true,
    allowSkip: true,
    branches: ["injury", "police_conduct"],
  },
  {
    field: "treatment_status",
    stage: "core",
    necessity: "opportunistic",
    purpose:
      "Whether medical records exist yet, which is the difference between a documented injury and an asserted one.",
    input: "single_select",
    question: "Where are you with treatment?",
    options: [
      { value: "emergency room", label: "I went to the emergency room" },
      { value: "ongoing", label: "I'm seeing someone now" },
      { value: "seen once", label: "I saw someone once" },
      { value: "not yet seen", label: "I haven't seen anyone yet" },
      { value: "finished", label: "Treatment is finished" },
    ],
    allowOther: true,
    allowSkip: true,
    branches: ["injury"],
  },
  {
    field: "insurer_identified",
    stage: "core",
    necessity: "opportunistic",
    purpose:
      "Whether an insurer has already made contact, which is often where a matter is quietly lost before the firm sees it.",
    input: "single_select",
    question: "Has an insurance company been in touch with you about this?",
    options: [
      { value: "yes, contacted", label: "Yes, and I've spoken with them" },
      { value: "yes, not spoken", label: "Yes, but I haven't spoken with them" },
      { value: "no", label: "No" },
      { value: "unknown", label: "I'm not sure" },
    ],
    allowOther: false,
    allowSkip: true,
    branches: ["injury"],
  },
  {
    field: "liable_party_type",
    stage: "core",
    necessity: "opportunistic",
    purpose: "Who the claim runs against, which decides both the deadline and the insurer.",
    input: "single_select",
    question: "Who do you think is responsible for what happened?",
    options: [
      { value: "driver", label: "A driver" },
      { value: "business", label: "A business" },
      { value: "property owner", label: "A property owner or landlord" },
      { value: "government agency", label: "A government agency" },
      { value: "employer", label: "An employer" },
      { value: "medical provider", label: "A doctor or a hospital" },
      { value: "unknown", label: "I'm not sure" },
    ],
    allowOther: true,
    allowSkip: true,
    branches: ["injury"],
  },

  // --- The close. ----------------------------------------------------------
  {
    field: "best_contact_time",
    stage: "closing",
    necessity: "essential",
    purpose: "So the callback lands when the person can actually take it.",
    input: "single_select",
    question: "When's the best time to reach you?",
    options: [
      { value: "mornings", label: "Mornings" },
      { value: "afternoons", label: "Afternoons" },
      { value: "evenings", label: "Evenings" },
      { value: "anytime", label: "Anytime" },
      { value: "weekends", label: "Weekends only" },
    ],
    allowOther: true,
    allowSkip: true,
  },
  {
    field: "voicemail_text_safe",
    stage: "closing",
    necessity: "opportunistic",
    purpose:
      "A safety question wearing a convenience question's clothes: the phone or the home may be shared with the person the matter is about. Ask it plainly and never explain why.",
    input: "single_select",
    question: "If we can't reach you, is it safe to leave a voicemail or send a text?",
    options: [
      { value: "voicemail and text", label: "Either is fine" },
      { value: "voicemail only", label: "Voicemail only" },
      { value: "text only", label: "Text only" },
      { value: "neither", label: "Neither, please just try again" },
    ],
    allowOther: true,
    allowSkip: true,
  },
];

/**
 * Fields the model fills in from what it has heard, and must never turn into a
 * question. `safety_flag` in particular: asking someone whether they are safe
 * is a dialogue move the firm has deliberately ruled out (tavus/README.md,
 * "No safety scripting"): the signal is inferred and routed, not discussed.
 */
export const DERIVED_FIELDS: { field: IntakeField; purpose: string }[] = [
  {
    field: "subject_one_line",
    purpose:
      "One line an attorney can read in the callback queue: what happened, to whom, and by whom. Write it as soon as the account allows.",
  },
  {
    field: "matter_venue",
    purpose:
      "Set automatically from matter_bucket. Never ask, and never write it yourself.",
  },
  {
    field: "branch_summary",
    purpose:
      "Two or three sentences on the detail specific to this kind of matter, written at the close.",
  },
  {
    field: "safety_flag",
    purpose:
      "'yes' when anything said suggests the person may not be safe: ongoing threats, someone turning up where they live, an abuser sharing the phone or the home. Otherwise 'no'. Inferred silently; never asked, never mentioned, never acted on in the conversation.",
  },
  {
    field: "priority_tier",
    purpose:
      "'p1' for a safety flag or a deadline inside two weeks, 'p2' for a live deadline or ongoing harm, 'p3' otherwise. Written at the close.",
  },
];

const PLAN_BY_FIELD = new Map(QUESTION_PLAN.map((spec) => [spec.field, spec]));

export function questionSpec(field: string): QuestionSpec | undefined {
  return PLAN_BY_FIELD.get(field as IntakeField);
}

/** Every column the text intake may write, asked or derived. */
export const WRITABLE_FIELDS: IntakeField[] = [
  ...QUESTION_PLAN.map((spec) => spec.field),
  ...DERIVED_FIELDS.map((entry) => entry.field),
];

export function isWritableField(field: string): field is IntakeField {
  return (WRITABLE_FIELDS as string[]).includes(field);
}

/** A real answer, `unknown` and `declined` all count as asked and answered. */
function isAnswered(intake: Intake, field: IntakeField): boolean {
  const value = intake[field];
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * How many times a field may be put to someone before it is written off as
 * `unknown`. Ported from the call agent's objective prompts, where the same
 * rule is what stops an objective stalling on an answer that is not coming.
 */
export const MAX_ASKS_PER_FIELD = 2;

/**
 * What is still open, in the order it should be asked.
 *
 * Everything gated out here is gated out deterministically (an answered
 * field, a field belonging to a branch this matter did not take, a field
 * already put twice), so no amount of model drift can produce a repeat
 * question or an injury question on an employment matter.
 */
export function remainingQuestions(
  intake: Intake,
  askedCounts: Record<string, number> = {},
): QuestionSpec[] {
  const branch = branchFor(intake.matter_bucket);

  return QUESTION_PLAN.filter((spec) => {
    if (isAnswered(intake, spec.field)) return false;
    if ((askedCounts[spec.field] ?? 0) >= MAX_ASKS_PER_FIELD) return false;
    if (spec.branches && !spec.branches.includes(branch)) return false;
    return true;
  });
}

/**
 * Whether every essential field is settled. `unknown` and `declined` settle a
 * field: the firm asked, and not getting an answer is itself an answer.
 */
export function essentialsSettled(
  intake: Intake,
  askedCounts: Record<string, number> = {},
): boolean {
  return !remainingQuestions(intake, askedCounts).some(
    (spec) => spec.necessity === "essential",
  );
}

/**
 * The progress the person sees. Counts essential fields only. The
 * opportunistic ones are why an intake can end early without being incomplete,
 * so counting them would make a finished intake look unfinished.
 */
export function essentialProgress(intake: Intake): {
  answered: number;
  total: number;
} {
  const essential = QUESTION_PLAN.filter(
    (spec) => spec.necessity === "essential",
  );
  return {
    answered: essential.filter((spec) => isAnswered(intake, spec.field)).length,
    total: essential.length,
  };
}

/**
 * A real answer as opposed to a placeholder, for deciding whether a field is
 * worth a second ask rather than whether it has been touched.
 */
export function hasRealAnswer(intake: Intake, field: IntakeField): boolean {
  const value = intake[field];
  return (
    typeof value === "string" && value.trim().length > 0 && !isNonAnswer(value)
  );
}
