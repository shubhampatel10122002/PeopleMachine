import { NextResponse } from "next/server";
import {
  answerToText,
  askAssistant,
  EMPTY_BLOCK,
  MAX_HISTORY_TURNS,
  MAX_MESSAGE_CHARS,
  type AssistantAnswer,
  type AssistantTurn,
} from "@/lib/assistant";

/**
 * One turn of the site-wide chat badge.
 *
 * Stateless on purpose. The whole conversation is held by the browser and sent
 * back each turn, which is why nothing here touches Supabase: this chat is not
 * an intake, it is not evidence, and a legal question someone typed on their
 * way to deciding whether to trust us is not ours to keep. Anything they want
 * on the record they say to Kelly.
 *
 * That also means there is no session to authorise, and therefore nothing an id
 * would protect. What keeps it from being a free model endpoint is the size of
 * what it will accept: a bounded history of bounded messages, and one model
 * call per request.
 */
export const maxDuration = 60;

/** Roughly what a person types before they should be talking to Kelly instead. */
const MAX_TURNS_IN = MAX_HISTORY_TURNS * 2;

function readHistory(body: Record<string, unknown>): AssistantTurn[] {
  const raw = Array.isArray(body.messages) ? body.messages : [];

  return raw
    .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object")
    .map((entry) => ({
      role: entry.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content:
        typeof entry.content === "string"
          ? entry.content.trim().slice(0, MAX_MESSAGE_CHARS)
          : "",
    }))
    .filter((turn) => turn.content.length > 0)
    .slice(-MAX_TURNS_IN);
}

/**
 * What the widget shows when the model could not be reached. Deliberately an
 * answer rather than an error: the two buttons are the whole point of the
 * badge, and they work whether or not OpenAI does.
 */
function unreachable(): AssistantAnswer {
  return {
    reply:
      "I could not reach my end just then. Try again in a moment, or go straight to an intake.",
    block: EMPTY_BLOCK,
    actions: ["text_intake", "video_intake"],
    followups: [],
  };
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const messages = readHistory(body);
  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    return NextResponse.json(
      { error: "messages must end with a non-empty user turn" },
      { status: 400 },
    );
  }

  try {
    const { answer, sources } = await askAssistant(messages);
    return NextResponse.json({ answer, sources, historyText: answerToText(answer) });
  } catch (thrown) {
    console.error("[assistant] turn failed", thrown);
    const answer = unreachable();
    return NextResponse.json({ answer, sources: [], historyText: answer.reply });
  }
}
