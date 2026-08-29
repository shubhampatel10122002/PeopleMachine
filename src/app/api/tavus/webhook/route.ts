import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase";
import { safeEqual } from "@/lib/admin-auth";
import { isIntakeField, shouldOverwriteField, type Intake } from "@/lib/types";

/**
 * Single endpoint for everything Tavus sends us. Three payload shapes arrive:
 *
 * 1. Objective callbacks (configured per objective on Ethan's objective set):
 *    { conversation_id, objective_name, output_variables: { ... } }
 *
 * 2. Conversation callbacks (from the callback_url on conversation create):
 *    { conversation_id, event_type, message_type, properties, timestamp }
 *    — notably `application.transcription_ready` and
 *    `application.perception_analysis`.
 *
 * 3. Guardrail callbacks, for guardrails carrying a callback_url of their own.
 *    Only `safety_flag_and_continue` has one. Guardrails otherwise publish to
 *    the Daily data channel as app messages, which never reach the server —
 *    which is exactly why the safety signal needs a callback and not a
 *    browser listener.
 *
 * Everything is logged raw to `intake_events` before we interpret it, so a
 * shape we did not anticipate is still recoverable from the admin dashboard.
 */

type WebhookBody = {
  conversation_id?: string;
  objective_name?: string;
  output_variables?: Record<string, unknown>;
  event_type?: string;
  message_type?: string;
  webhook_url?: string;
  guardrail_name?: string;
  properties?: {
    transcript?: unknown;
    analysis?: unknown;
    guardrail_name?: string;
    [key: string]: unknown;
  };
};

function authorized(request: Request): boolean {
  const provided = new URL(request.url).searchParams.get("secret");
  if (!provided) return false;
  return safeEqual(provided, env.tavusWebhookSecret);
}

/**
 * Tavus echoes the callback_url back in every payload, and ours carries the
 * shared secret in the query string. Drop it before the payload is stored.
 */
function redact(body: WebhookBody): Record<string, unknown> {
  const rest: Record<string, unknown> = { ...body };
  delete rest.webhook_url;
  return rest;
}

/** A guardrail fire, whichever shape Tavus sends it in. */
function guardrailName(body: WebhookBody): string | null {
  const name = body.guardrail_name ?? body.properties?.guardrail_name;
  if (typeof name === "string" && name) return name;
  if (typeof body.event_type === "string" && body.event_type.includes("guardrail")) {
    return "unknown_guardrail";
  }
  return null;
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: WebhookBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const conversationId = body.conversation_id;
  const supabase = supabaseAdmin();
  const firedGuardrail = guardrailName(body);

  const { data: intakeRow } = conversationId
    ? await supabase
        .from("intakes")
        .select("*")
        .eq("tavus_conversation_id", conversationId)
        .maybeSingle()
    : { data: null };

  await supabase.from("intake_events").insert({
    intake_id: intakeRow?.id ?? null,
    tavus_conversation_id: conversationId ?? null,
    event_type: body.event_type ?? (firedGuardrail ? "guardrail" : null),
    message_type: body.message_type ?? null,
    objective_name: body.objective_name ?? firedGuardrail ?? null,
    payload: redact(body),
  });

  if (!intakeRow) {
    // Logged above; nothing to update. Still a 200 so Tavus does not retry.
    // Conversations started outside /api/intake/start (a PAL Maker preview,
    // say) land here and are expected.
    return NextResponse.json({ ok: true, matched: false });
  }

  const intake = intakeRow as Intake;
  const updates: Record<string, unknown> = {};

  // --- Objective callback: structured variables ---
  if (body.objective_name && body.output_variables) {
    const existing = (intake.objectives ?? {}) as Record<string, unknown>;
    updates.objectives = {
      ...existing,
      [body.objective_name]: body.output_variables,
    };

    for (const [key, value] of Object.entries(body.output_variables)) {
      if (!isIntakeField(key)) continue;
      if (value === null || value === undefined) continue;

      const incoming =
        typeof value === "string" ? value.trim() : JSON.stringify(value);
      if (shouldOverwriteField(intake[key], incoming)) {
        updates[key] = incoming;
      }
    }
  }

  // --- Guardrail callback ---
  // Only safety_flag_and_continue carries a callback_url, so a fire here means
  // the caller signalled they may not be safe. The agent says nothing about it
  // on the call by design; the whole point is that it reaches the callback
  // queue. wrap_up also sets safety_flag, but only if the call gets that far —
  // this catches the ones that do not.
  if (firedGuardrail) {
    if (firedGuardrail === "safety_flag_and_continue" || firedGuardrail === "unknown_guardrail") {
      if (!intake.safety_flag) {
        updates.safety_flag = `guardrail:${firedGuardrail}`;
      }
      if (intake.priority_tier !== "p1") {
        updates.priority_tier = "p1";
      }
    }
  }

  // --- Conversation callbacks ---
  if (body.event_type === "application.transcription_ready") {
    const transcript = body.properties?.transcript;
    if (Array.isArray(transcript)) {
      updates.transcript = transcript;
    }
    updates.transcript_ready_at = new Date().toISOString();
    updates.status = "completed";
    if (!intake.ended_at) {
      updates.ended_at = new Date().toISOString();
    }
  }

  if (body.event_type === "application.perception_analysis" && body.properties) {
    updates.perception_analysis = body.properties;
  }

  if (body.event_type === "system.shutdown" && !intake.ended_at) {
    updates.ended_at = new Date().toISOString();
  }

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase
      .from("intakes")
      .update(updates)
      .eq("id", intake.id);

    if (error) {
      console.error("Failed to apply webhook updates", error);
    }
  }

  return NextResponse.json({ ok: true, matched: true });
}
