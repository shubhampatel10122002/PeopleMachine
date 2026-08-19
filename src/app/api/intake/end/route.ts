import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { endConversation } from "@/lib/tavus";

/**
 * Called when the person clicks "End conversation". Best-effort: Tavus also
 * tears the room down on its own timeouts, and the transcript webhook arrives
 * regardless of who ended it.
 */
export async function POST(request: Request) {
  let body: { conversationId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const conversationId = body.conversationId;
  if (typeof conversationId !== "string" || !conversationId) {
    return NextResponse.json({ error: "conversationId is required." }, { status: 400 });
  }

  try {
    await endConversation(conversationId);
  } catch (error) {
    console.error("Failed to end Tavus conversation", error);
  }

  try {
    await supabaseAdmin()
      .from("intakes")
      .update({ ended_at: new Date().toISOString() })
      .eq("tavus_conversation_id", conversationId)
      .is("ended_at", null);
  } catch (error) {
    console.error("Failed to stamp ended_at", error);
  }

  return NextResponse.json({ ok: true });
}
