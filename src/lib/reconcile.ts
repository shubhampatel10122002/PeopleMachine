import { fetchConversation } from "@/lib/tavus";
import { supabaseAdmin } from "@/lib/supabase";
import type { Intake } from "@/lib/types";

/**
 * Conversation-level callbacks (`application.transcription_ready`,
 * `application.perception_analysis`, `system.shutdown`) are pushed to the
 * callback_url handed to Tavus at conversation create. That origin comes from
 * PUBLIC_BASE_URL, and when it is wrong the callbacks are posted into the void
 * — no retry, no error, nothing to notice. The intake simply stays at
 * in_progress with no transcript forever.
 *
 * Objective callbacks do not share that fate, because their URLs live on the
 * objective set in Tavus rather than being built per call. An intake carrying
 * objective data but no transcript is the signature of exactly that split.
 *
 * So the transcript is pulled rather than only waited for. This is the same
 * data the webhook would have written, read back from Tavus on demand.
 */

/** Long enough that a still-running call is never mistaken for a stuck one. */
const STUCK_AFTER_MS = 2 * 60 * 1000;

/**
 * True when a row looks like it lost its conversation callbacks: still open,
 * with no transcript, and either explicitly ended or started long enough ago
 * that a live call would have reported in by now.
 */
export function looksStuck(intake: Intake): boolean {
  if (intake.status !== "in_progress") return false;
  if (intake.transcript) return false;
  if (intake.ended_at) return true;

  const startedAt = intake.started_at ?? intake.created_at;
  if (!startedAt) return false;
  return Date.now() - new Date(startedAt).getTime() > STUCK_AFTER_MS;
}

/**
 * Pulls the conversation back from Tavus and applies whatever the webhook
 * never delivered. Returns true when the row changed.
 *
 * Never downgrades a row: existing values are left alone, so a late webhook
 * and a reconcile cannot fight over the same field.
 */
export async function reconcileFromTavus(intake: Intake): Promise<boolean> {
  if (!intake.tavus_conversation_id) return false;

  const snapshot = await fetchConversation(intake.tavus_conversation_id);
  if (!snapshot) return false;

  const updates: Record<string, unknown> = {};

  if (snapshot.transcript && !intake.transcript) {
    updates.transcript = snapshot.transcript;
    updates.transcript_ready_at = new Date().toISOString();
  }

  if (snapshot.perceptionAnalysis && !intake.perception_analysis) {
    updates.perception_analysis = snapshot.perceptionAnalysis;
  }

  // Tavus reports an ended conversation as "ended". Treat anything that is no
  // longer active as finished, so the dashboard stops claiming a call is live
  // even when the transcript itself never materialised.
  const ended = snapshot.status !== null && snapshot.status !== "active";
  if (ended && intake.status === "in_progress") {
    updates.status = "completed";
    if (!intake.ended_at) {
      updates.ended_at = new Date().toISOString();
    }
  }

  if (Object.keys(updates).length === 0) return false;

  const { error } = await supabaseAdmin()
    .from("intakes")
    .update(updates)
    .eq("id", intake.id);

  if (error) {
    console.error("Failed to reconcile intake from Tavus", error);
    return false;
  }

  return true;
}
