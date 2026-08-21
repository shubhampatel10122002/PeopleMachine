/**
 * The variables Maya's objective set (o9269328bfe16) emits. Each objective
 * posts `{ conversation_id, objective_name, output_variables }` to our webhook,
 * and every one of these names maps 1:1 onto a column on `intakes`.
 */
export const INTAKE_FIELDS = [
  "first_name",
  "callback_phone",
  "email",
  "best_contact_time",
  "narrative_summary",
  "responsible_party",
  "incident_state",
  "incident_county",
  "incident_month_year",
] as const;

export type IntakeField = (typeof INTAKE_FIELDS)[number];

export const INTAKE_FIELD_LABELS: Record<IntakeField, string> = {
  first_name: "First name",
  callback_phone: "Callback phone",
  email: "Email",
  best_contact_time: "Best time to reach",
  narrative_summary: "What happened",
  responsible_party: "Responsible party",
  incident_state: "State",
  incident_county: "County",
  incident_month_year: "When it happened",
};

export function isIntakeField(key: string): key is IntakeField {
  return (INTAKE_FIELDS as readonly string[]).includes(key);
}

/**
 * How many of the nine fields actually hold a value. Tavus only fires an
 * objective callback when that objective completes, so a stalled objective
 * loses its fields silently — this makes that visible at a glance.
 * 'unknown' and 'declined' count as captured: they are answers, not silence.
 */
export function capturedFieldCount(intake: Intake): number {
  return INTAKE_FIELDS.filter((field) => {
    const value = intake[field];
    return typeof value === "string" && value.trim().length > 0;
  }).length;
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
  first_name: string | null;
  callback_phone: string | null;
  email: string | null;
  best_contact_time: string | null;
  narrative_summary: string | null;
  responsible_party: string | null;
  incident_state: string | null;
  incident_county: string | null;
  incident_month_year: string | null;
  objectives: Record<string, Record<string, unknown>>;
  transcript: TranscriptTurn[] | null;
  /** `properties` from Tavus's application.perception_analysis event. */
  perception_analysis: { analysis?: string; [key: string]: unknown } | null;
  source: string;
  user_agent: string | null;
  reviewed: boolean;
  admin_notes: string | null;
};

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
