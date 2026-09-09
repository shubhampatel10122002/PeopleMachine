import { env } from "./env";

const TAVUS_API = "https://tavusapi.com/v2";

export type CreatedConversation = {
  conversation_id: string;
  conversation_url: string;
  conversation_name?: string;
  status?: string;
};

/**
 * The name, phone and email come from a public form and get embedded in Ethan's
 * context and greeting, so collapse them to a single short line first. This
 * keeps a pasted paragraph — or an attempt at prompt injection — from
 * becoming instructions.
 */
function sanitize(value: string, maxLength: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export type StartConversationInput = {
  conversationName: string;
  firstName: string;
  callbackPhone: string;
  email: string;
};

/**
 * Starts a CVI conversation with Ethan. The callback_url carries a shared
 * secret so our webhook can reject anything that did not come from this call.
 *
 * Name, phone and email are collected on the web form, so they are passed as
 * context rather than asked for out loud — Ethan's prompt tells him not to
 * re-ask.
 *
 * No `face_id` is sent, deliberately. A face_id in this body overrides the
 * PAL's `default_face_id`, which meant the face was pinned by an env var in
 * Vercel and editing it in PAL Maker changed nothing — the symptom that got
 * this removed. The PAL is now the only place the face is set. Tavus requires
 * a face from one side or the other, so a PAL with no `default_face_id` fails
 * here with a 400 rather than falling back to anything.
 *
 * Note: Ethan's per-objective callbacks are configured on the objective set in
 * Tavus, not here — see README ("Tavus objective callbacks").
 */
export async function createConversation(
  input: StartConversationInput,
): Promise<CreatedConversation> {
  const callbackUrl = `${env.publicBaseUrl}/api/tavus/webhook?secret=${encodeURIComponent(
    env.tavusWebhookSecret,
  )}`;

  // The origin here decides whether every conversation-level callback for this
  // call ever reaches us, and a wrong one fails silently — Tavus posts into the
  // void and the intake just sits at in_progress with no transcript. Logged
  // without the secret so a stuck call can be diagnosed from the origin alone.
  console.log("Tavus callback origin", new URL(callbackUrl).origin);

  const firstName = sanitize(input.firstName, 60);
  const callbackPhone = sanitize(input.callbackPhone, 32);
  const email = sanitize(input.email, 320);

  const response = await fetch(`${TAVUS_API}/conversations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.tavusApiKey,
    },
    body: JSON.stringify({
      pal_id: env.tavusPalId,
      conversation_name: input.conversationName,
      callback_url: callbackUrl,
      conversational_context:
        `The person you are speaking with is ${firstName}. ` +
        `They gave their first name, callback number (${callbackPhone}) and email address (${email}) on the web form before this call, ` +
        `so all three are already on file. Do not ask for any of them. ` +
        `Greet ${firstName} by name and invite them to tell you what happened.`,
      custom_greeting:
        `Hi ${firstName}, I'm Ethan. I help people here share what happened so the right attorney can take a look. ` +
        `Whenever you're ready, tell me what happened — take your time.`,
      properties: {
        max_call_duration: 1800,
        participant_left_timeout: 60,
        participant_absent_timeout: 120,
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Tavus create conversation failed (${response.status}): ${detail}`,
    );
  }

  return (await response.json()) as CreatedConversation;
}

/**
 * Reads the face a PAL is currently configured with, only so `intakes.face_id`
 * keeps recording what each call actually ran on. Nothing is sent back to
 * Tavus — the PAL decides the face on its own.
 *
 * Best-effort on purpose: the create-conversation response does not carry the
 * face, so this is a second round trip, and a lead is worth more than an audit
 * column. Every failure returns null and the intake proceeds. Call it
 * concurrently with createConversation so it costs no wall-clock time.
 */
export async function fetchPalFaceId(palId: string): Promise<string | null> {
  try {
    const response = await fetch(
      `${TAVUS_API}/pals/${encodeURIComponent(palId)}`,
      { headers: { "x-api-key": env.tavusApiKey } },
    );

    if (!response.ok) {
      console.error(
        `Tavus get pal failed (${response.status})`,
        await response.text(),
      );
      return null;
    }

    const body = (await response.json()) as { default_face_id?: unknown };
    return typeof body.default_face_id === "string"
      ? body.default_face_id
      : null;
  } catch (error) {
    console.error("Tavus get pal threw", error);
    return null;
  }
}

/** Best-effort cleanup so an abandoned room does not run to max duration. */
export async function endConversation(conversationId: string): Promise<void> {
  const response = await fetch(
    `${TAVUS_API}/conversations/${encodeURIComponent(conversationId)}/end`,
    {
      method: "POST",
      headers: { "x-api-key": env.tavusApiKey },
    },
  );

  // A conversation that already ended on its own is not an error worth raising.
  if (!response.ok && response.status !== 400 && response.status !== 404) {
    const detail = await response.text();
    throw new Error(
      `Tavus end conversation failed (${response.status}): ${detail}`,
    );
  }
}

/** What a conversation looks like when read back rather than pushed to us. */
export type ConversationSnapshot = {
  status: string | null;
  transcript: unknown[] | null;
  perceptionAnalysis: Record<string, unknown> | null;
};

type VerboseEvent = {
  event_type?: string;
  properties?: Record<string, unknown>;
};

/**
 * Reads a finished conversation back from Tavus.
 *
 * The webhook is a push, and a push that goes to the wrong origin is gone for
 * good — there is no replay. This is the pull side of the same data, so an
 * intake stuck at in_progress can be reconciled after the fact instead of
 * being written off. Tavus keeps the transcript and the perception analysis on
 * the conversation itself; `?verbose=true` is what returns them.
 *
 * Shapes are read defensively: the transcript has been seen both as a
 * top-level field and inside the events list, and neither is worth a crash.
 */
export async function fetchConversation(
  conversationId: string,
): Promise<ConversationSnapshot | null> {
  const response = await fetch(
    `${TAVUS_API}/conversations/${encodeURIComponent(conversationId)}?verbose=true`,
    { headers: { "x-api-key": env.tavusApiKey } },
  );

  if (!response.ok) {
    console.error(
      `Tavus get conversation failed (${response.status})`,
      await response.text(),
    );
    return null;
  }

  const body = (await response.json()) as {
    status?: unknown;
    transcript?: unknown;
    events?: unknown;
  };

  const events: VerboseEvent[] = Array.isArray(body.events)
    ? (body.events as VerboseEvent[])
    : [];

  const lastOf = (eventType: string): VerboseEvent | undefined =>
    events.filter((event) => event?.event_type === eventType).at(-1);

  const transcriptEvent = lastOf("application.transcription_ready");
  const transcriptFromEvent = transcriptEvent?.properties?.transcript;
  const transcript = Array.isArray(transcriptFromEvent)
    ? transcriptFromEvent
    : Array.isArray(body.transcript)
      ? body.transcript
      : null;

  const perception = lastOf("application.perception_analysis")?.properties;

  return {
    status: typeof body.status === "string" ? body.status : null,
    transcript,
    perceptionAnalysis: perception ?? null,
  };
}
