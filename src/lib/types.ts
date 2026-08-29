/**
 * The variables Ethan's objective set (crv-intake-v2) emits — `ofc70727fb48e`
 * in production, `o7fb756385afe` on the fallback PAL, the two being
 * content-identical copies of each other.
 * Each objective posts `{ conversation_id, objective_name, output_variables }`
 * to our webhook, and every name below maps 1:1 onto a column on `intakes`.
 *
 * Split into two groups because they mean different things when empty.
 */

/**
 * Asked on every call, whatever the matter is. `first_name` and
 * `callback_phone` come from the web form rather than an objective. An empty
 * spine field means the call ended early or the caller declined — it is signal.
 */
export const INTAKE_SPINE_FIELDS = [
  "first_name",
  "callback_phone",
  "email",
  "best_contact_time",
  "voicemail_text_safe",
  "narrative_summary",
  "subject_one_line",
  "matter_bucket",
  "matter_venue",
  "protected_basis",
  "conduct_types",
  "urgency",
  "incident_date",
  "opposing_party",
  "government_employer",
  "municipal_defendant",
  "prior_filing",
  "priority_tier",
  "safety_flag",
  "branch_summary",
] as const;

/**
 * Emitted by one branch each. A call runs a single branch, so these are null by
 * design on most rows — `injury_type` is empty on every employment matter. Never
 * count these toward completeness.
 */
export const INTAKE_BRANCH_FIELDS = [
  "employer_headcount_band",
  "incident_borough",
  "incident_county",
  "facility_name",
  "facility_type",
  "injury_type",
  "treatment_status",
  "insurer_identified",
  "liable_party_type",
] as const;

/** Written by the pre-redesign objective set. Read-only for old rows. */
export const INTAKE_LEGACY_FIELDS = [
  "responsible_party",
  "incident_state",
  "incident_month_year",
] as const;

export const INTAKE_FIELDS = [
  ...INTAKE_SPINE_FIELDS,
  ...INTAKE_BRANCH_FIELDS,
  ...INTAKE_LEGACY_FIELDS,
] as const;

export type IntakeField = (typeof INTAKE_FIELDS)[number];

export const INTAKE_FIELD_LABELS: Record<IntakeField, string> = {
  first_name: "First name",
  callback_phone: "Callback phone",
  email: "Email",
  best_contact_time: "Best time to reach",
  voicemail_text_safe: "Voicemail / text safe",
  narrative_summary: "What happened",
  subject_one_line: "Subject",
  matter_bucket: "Matter type",
  matter_venue: "Venue",
  protected_basis: "Protected basis",
  conduct_types: "Conduct",
  urgency: "Urgency",
  incident_date: "When it happened",
  opposing_party: "Other side",
  government_employer: "Government employer",
  municipal_defendant: "Municipal defendant",
  prior_filing: "Already filed",
  priority_tier: "Priority",
  safety_flag: "Safety flag",
  branch_summary: "Branch detail",

  employer_headcount_band: "Employer size",
  incident_borough: "Borough",
  incident_county: "County",
  facility_name: "Facility",
  facility_type: "Facility type",
  injury_type: "Injury",
  treatment_status: "Treatment status",
  insurer_identified: "Insurer contact",
  liable_party_type: "Liable party",

  responsible_party: "Responsible party (legacy)",
  incident_state: "State (legacy)",
  incident_month_year: "When it happened (legacy)",
};

export function isIntakeField(key: string): key is IntakeField {
  return (INTAKE_FIELDS as readonly string[]).includes(key);
}

function isFilled(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * How much of the spine a call actually captured. Tavus only fires an objective
 * callback when that objective produces variables, so a call that died early
 * shows up here as a low count.
 *
 * Counts the spine only. Branch fields are null on nearly every row by design,
 * so including them would mark every intake incomplete and the signal would be
 * worthless. 'unknown' and 'declined' count as captured — they are answers.
 */
export function capturedSpineCount(intake: Intake): number {
  return INTAKE_SPINE_FIELDS.filter((field) => isFilled(intake[field])).length;
}

/** Branch fields that this particular call actually produced. */
export function populatedBranchFields(intake: Intake): IntakeField[] {
  return INTAKE_BRANCH_FIELDS.filter((field) => isFilled(intake[field]));
}

/** Legacy fields, shown only on rows old enough to have them. */
export function populatedLegacyFields(intake: Intake): IntakeField[] {
  return INTAKE_LEGACY_FIELDS.filter((field) => isFilled(intake[field]));
}

/**
 * Values that mean "we asked and got nothing". A later objective callback
 * carrying one of these must never overwrite a real answer — see the merge
 * rule in the webhook route.
 */
export const NON_ANSWERS = new Set(["unknown", "declined", "n/a", "none given"]);

export function isNonAnswer(value: string): boolean {
  return NON_ANSWERS.has(value.trim().toLowerCase());
}

/**
 * Whether an incoming objective value should replace what we already hold.
 *
 * Objective callbacks fire repeatedly as an objective refines its variables,
 * not once when it completes: one observed conversation fired the same
 * objective three times with three different summaries, and moved a date from
 * 'unknown' to 'two days ago' across two fires. That repetition is what makes
 * the live Tier 1 write work — a call that dies at minute three still leaves a
 * routable lead — and it is also how a good answer gets clobbered.
 *
 * So a later fire may only replace what we hold if it carries strictly more
 * information: a real answer beats a placeholder, and nothing beats a real
 * answer except a different real answer.
 */
export function shouldOverwriteField(
  current: unknown,
  incoming: string,
): boolean {
  if (!incoming.trim()) return false;

  const held = typeof current === "string" ? current.trim() : "";
  if (!held) return true;

  if (isNonAnswer(incoming)) return false;
  return isNonAnswer(held) || held !== incoming;
}

export type TranscriptTurn = {
  role: string;
  content: string;
  timestamp?: number;
  seconds_from_start?: number;
  duration?: number;
  inference_id?: string;
};

export type Intake = {
  id: string;
  created_at: string;
  updated_at: string;
  tavus_conversation_id: string;
  tavus_conversation_url: string | null;
  pal_id: string | null;
  face_id: string | null;
  status: "in_progress" | "completed" | "error";
  consent_at: string | null;
  consent_version: string | null;
  started_at: string;
  ended_at: string | null;
  transcript_ready_at: string | null;
  objectives: Record<string, Record<string, unknown>>;
  transcript: TranscriptTurn[] | null;
  /** `properties` from Tavus's application.perception_analysis event. */
  perception_analysis: { analysis?: string; [key: string]: unknown } | null;
  source: string;
  user_agent: string | null;
  reviewed: boolean;
  admin_notes: string | null;
} & { [K in IntakeField]: string | null };

export type IntakeEvent = {
  id: number;
  created_at: string;
  intake_id: string | null;
  tavus_conversation_id: string | null;
  event_type: string | null;
  message_type: string | null;
  objective_name: string | null;
  payload: unknown;
};
