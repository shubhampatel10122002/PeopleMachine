import { NextResponse } from "next/server";
import { CONSENT_VERSION, env } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase";
import { createConversation } from "@/lib/tavus";

function digitCount(value: string): number {
  return (value.match(/\d/g) ?? []).length;
}

export async function POST(request: Request) {
  let body: { consent?: unknown; firstName?: unknown; callbackPhone?: unknown };
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

  const firstName =
    typeof body.firstName === "string" ? body.firstName.trim() : "";
  const callbackPhone =
    typeof body.callbackPhone === "string" ? body.callbackPhone.trim() : "";

  if (!firstName) {
    return NextResponse.json(
      { error: "Please tell us your first name." },
      { status: 400 },
    );
  }

  if (digitCount(callbackPhone) < 7) {
    return NextResponse.json(
      { error: "Please enter a phone number we can reach you on." },
      { status: 400 },
    );
  }

  try {
    const startedAt = new Date();
    const conversation = await createConversation({
      conversationName: `People Machine intake — ${startedAt.toISOString()}`,
      firstName,
      callbackPhone,
    });

    const { data, error } = await supabaseAdmin()
      .from("intakes")
      .insert({
        tavus_conversation_id: conversation.conversation_id,
        tavus_conversation_url: conversation.conversation_url,
        pal_id: env.tavusPalId,
        face_id: env.tavusFaceId,
        status: "in_progress",
        // Captured on the form, so the lead is usable even if they hang up
        // before Maya gets to anything else.
        first_name: firstName.slice(0, 120),
        callback_phone: callbackPhone.slice(0, 64),
        consent_at: startedAt.toISOString(),
        consent_version: CONSENT_VERSION,
        started_at: startedAt.toISOString(),
        user_agent: request.headers.get("user-agent"),
      })
      .select("id")
      .single();

    if (error) {
      // The call is live either way; surface the room so the person can talk,
      // and the webhook will still log events against the conversation id.
      console.error("Failed to record intake row", error);
      return NextResponse.json(
        {
          intakeId: null,
          conversationId: conversation.conversation_id,
          conversationUrl: conversation.conversation_url,
        },
        { status: 200 },
      );
    }

    return NextResponse.json({
      intakeId: data.id,
      conversationId: conversation.conversation_id,
      conversationUrl: conversation.conversation_url,
    });
  } catch (error) {
    console.error("Failed to start intake", error);
    return NextResponse.json(
      { error: "Could not start the conversation. Please try again." },
      { status: 502 },
    );
  }
}
