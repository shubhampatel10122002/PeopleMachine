import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { readContact } from "@/lib/contact";
import { TEXT_CONSENT_VERSION } from "@/lib/env";
import { essentialProgress } from "@/lib/intake-plan";
import { supabaseAdmin } from "@/lib/supabase";
import { openingTurn, projectTranscript } from "@/lib/text-intake";
import type { Intake } from "@/lib/types";

/**
 * Opens a typed intake and hands back the first question.
 *
 * No model call happens here. The opening question is fixed by design (one
 * open question, the same one the call opens with), so the first thing the
 * person sees is immediate and does not depend on OpenAI being reachable.
 *
 * The row is written before anything else, so a person who types their account
 * and then closes the tab still leaves a lead with a name and a number on it.
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (body.consent !== true) {
    return NextResponse.json(
      { error: "Consent is required before starting an intake." },
      { status: 400 },
    );
  }

  const parsed = readContact(body);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { firstName, callbackPhone, email } = parsed.contact;

  // The row id travels in a request body and ends up in logs, so it is not on
  // its own enough to write to an intake. This is what the turn endpoint checks.
  const sessionToken = randomBytes(32).toString("hex");
  const startedAt = new Date().toISOString();
  const turn = openingTurn(firstName);

  try {
    const { data, error } = await supabaseAdmin()
      .from("intakes")
      .insert({
        // Null on purpose: there is no Tavus conversation behind a typed
        // intake. Migration 0004 dropped the NOT NULL for exactly this.
        tavus_conversation_id: null,
        mode: "text",
        status: "in_progress",
        session_token: sessionToken,
        first_name: firstName,
        callback_phone: callbackPhone,
        email,
        consent_at: startedAt,
        consent_version: TEXT_CONSENT_VERSION,
        started_at: startedAt,
        user_agent: request.headers.get("user-agent"),
        text_turns: [turn],
        transcript: projectTranscript([turn]),
      })
      .select("*")
      .single();

    if (error || !data) {
      console.error("Failed to record text intake row", error);
      return NextResponse.json(
        { error: "Could not start the conversation. Please try again." },
        { status: 502 },
      );
    }

    return NextResponse.json({
      intakeId: data.id,
      sessionToken,
      acknowledgement: turn.acknowledgement,
      question: turn.question,
      progress: essentialProgress(data as Intake),
    });
  } catch (thrown) {
    // Missing env vars land here rather than as a 500 with no explanation.
    console.error("Failed to start text intake", thrown);
    return NextResponse.json(
      { error: "Could not start the conversation. Please try again." },
      { status: 502 },
    );
  }
}
