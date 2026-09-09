import { NextResponse } from "next/server";
import { safeEqual } from "@/lib/admin-auth";
import { essentialProgress } from "@/lib/intake-plan";
import { supabaseAdmin } from "@/lib/supabase";
import { MAX_ANSWER_CHARS, takeTurn, type AnswerInput } from "@/lib/text-intake";
import type { Intake } from "@/lib/types";

/**
 * One answer in, the next question out.
 *
 * Authorised by the session token minted at start rather than by the row id
 * alone: this is a public POST route that appends to someone's legal intake,
 * and an id is not a secret.
 *
 * The model call inside `takeTurn` can take a few seconds. It is deliberately
 * not streamed: the person is answering one question at a time, and a question
 * that assembles itself word by word is harder to read than one that arrives.
 */
export const maxDuration = 60;

function readAnswer(body: Record<string, unknown>): AnswerInput {
  const values = Array.isArray(body.values)
    ? body.values
        .filter((value): value is string => typeof value === "string")
        .slice(0, 20)
    : [];

  return {
    values,
    text:
      typeof body.text === "string" ? body.text.slice(0, MAX_ANSWER_CHARS) : "",
    skipped: body.skipped === true,
    ended: body.ended === true,
  };
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const intakeId = typeof body.intakeId === "string" ? body.intakeId : "";
  const sessionToken =
    typeof body.sessionToken === "string" ? body.sessionToken : "";

  if (!intakeId || !sessionToken) {
    return NextResponse.json(
      { error: "intakeId and sessionToken are required." },
      { status: 400 },
    );
  }

  try {
    const supabase = supabaseAdmin();
    const { data } = await supabase
      .from("intakes")
      .select("*")
      .eq("id", intakeId)
      .maybeSingle();

    const intake = data as Intake | null;

    // One shape of refusal for a missing row, a wrong token and a voice intake
    // alike, so this endpoint cannot be used to find out which intakes exist.
    if (
      !intake ||
      intake.mode !== "text" ||
      !intake.session_token ||
      !safeEqual(sessionToken, intake.session_token)
    ) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    const answer = readAnswer(body);

    // An empty submission that is not a skip and not an ending would spend a
    // model call to ask the same question again. The form already prevents it;
    // this is for everything that is not the form.
    if (
      !answer.ended &&
      !answer.skipped &&
      answer.values.length === 0 &&
      !answer.text.trim()
    ) {
      return NextResponse.json(
        { error: "Please choose an answer or type one." },
        { status: 400 },
      );
    }

    if (intake.status !== "in_progress") {
      return NextResponse.json({
        status: "finished",
        acknowledgement: null,
        question: null,
        closingMessage: "This intake is already complete.",
        progress: essentialProgress(intake),
      });
    }

    const { updates, reply } = await takeTurn(intake, answer);

    const { error } = await supabase
      .from("intakes")
      .update(updates)
      .eq("id", intake.id);

    if (error) {
      // The answer is gone if we return it as asked, and the person would
      // answer the next question against a row that never took the last one.
      console.error("Failed to persist text intake turn", error);
      return NextResponse.json(
        { error: "Could not save that answer. Please try again." },
        { status: 502 },
      );
    }

    return NextResponse.json(reply);
  } catch (thrown) {
    console.error("Text intake turn failed", thrown);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 502 },
    );
  }
}
