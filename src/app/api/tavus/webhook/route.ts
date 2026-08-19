import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase";
import { safeEqual } from "@/lib/admin-auth";
import { isIntakeField } from "@/lib/types";

/**
 * Single endpoint for everything Tavus sends us. Two payload shapes arrive here:
 *
 * 1. Objective callbacks (configured per objective on Maya's objective set):
 *    { conversation_id, objective_name, output_variables: { ... } }
 *
 * 2. Conversation callbacks (from the callback_url on conversation create):
 *    { conversation_id, event_type, message_type, properties, timestamp }
 *    — the one that matters is `application.transcription_ready`.
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
  properties?: { transcript?: unknown; [key: string]: unknown };
};

function authorized(request: Request): boolean {
  const provided = new URL(request.url).searchParams.get("secret");
  if (!provided) return false;
  return safeEqual(provided, env.tavusWebhookSecret);
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

  const { data: intake } = conversationId
    ? await supabase
        .from("intakes")
        .select("id, objectives, ended_at")
        .eq("tavus_conversation_id", conversationId)
        .maybeSingle()
    : { data: null };

  await supabase.from("intake_events").insert({
    intake_id: intake?.id ?? null,
    tavus_conversation_id: conversationId ?? null,
    event_type: body.event_type ?? null,
    message_type: body.message_type ?? null,
    objective_name: body.objective_name ?? null,
    payload: body,
  });

  if (!intake) {
    // Logged above; nothing to update. Still a 200 so Tavus does not retry.
    return NextResponse.json({ ok: true, matched: false });
  }

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
      if (value === null || value === undefined || value === "") continue;
      updates[key] = typeof value === "string" ? value : JSON.stringify(value);
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
