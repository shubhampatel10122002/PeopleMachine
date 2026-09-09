import { env } from "./env";

const TAVUS_API = "https://tavusapi.com/v2";

export type CreatedConversation = {
  conversation_id: string;
  conversation_url: string;
  conversation_name?: string;
  status?: string;
};

/**
 * The name, phone and email come from a public form and get embedded in the
 * agent's context and greeting, so collapse them to a single short line first.
 * This keeps a pasted paragraph — or an attempt at prompt injection — from
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
 * Starts a CVI conversation with whichever PAL TAVUS_PAL_ID names. The
 * callback_url carries a shared secret so our webhook can reject anything that
 * did not come from this call.
 *
 * Name, phone and email are collected on the web form, so they are passed as
 * context rather than asked for out loud — the PAL's prompt says not to
 * re-ask.
 *
 * Nothing about the agent's identity is sent from here — not `face_id`, not the
 * name, not the greeting. Every one of those fields overrides the PAL when it
 * appears in this body, and each override in turn was why an edit in PAL Maker
 * appeared to do nothing: the face was pinned by an env var, and the greeting
 * hardcoded the agent's name, so renaming the PAL left callers still being
 * greeted by the old name. PAL Maker is now the only place any of it is set.
 *
 * The one exception is `custom_greeting`, and only when the PAL's own greeting
 * asks for it by containing a `{first_name}` token — the text is still the
 * PAL's, with the name filled in. See personalizeGreeting.
 *
 * Tavus requires a face from the PAL or the request, and the request no longer
 * supplies one, so a PAL with no `default_face_id` fails here with a 400 rather
 * than falling back to anything.
 *
 * Note: the per-objective callbacks are configured on the objective set in
 * Tavus, not here — see README ("Tavus objective callbacks").
 */
export async function createConversation(
  input: StartConversationInput,
  pal: PalConfig,
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
  const personalizedGreeting = personalizeGreeting(pal.greeting, firstName);

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
      // Omitted entirely unless the PAL's greeting carries a {first_name}
      // token; an absent custom_greeting is what makes Tavus speak the PAL's
      // own, which is the whole point.
      ...(personalizedGreeting ? { custom_greeting: personalizedGreeting } : {}),
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

/** The parts of a PAL this app reads back rather than dictates. */
export type PalConfig = {
  faceId: string | null;
  name: string | null;
  greeting: string | null;
};

/**
 * Reads the PAL's own configuration so PAL Maker stays the only place the
 * agent's identity is set. Nothing here is ever sent back as an override —
 * `greeting` is read only so the caller's first name can be substituted into
 * it, and `faceId` only so `intakes.face_id` records what the call ran on.
 *
 * Never rejects. Every failure degrades to nulls: the conversation is created
 * with no greeting override (Tavus falls back to the PAL's own greeting, which
 * is what we wanted anyway) and the row records a null face. A lead is worth
 * more than either.
 */
export async function fetchPalConfig(palId: string): Promise<PalConfig> {
  const empty: PalConfig = { faceId: null, name: null, greeting: null };

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
      return empty;
    }

    const body = (await response.json()) as {
      default_face_id?: unknown;
      pal_name?: unknown;
      greeting?: unknown;
    };

    const str = (value: unknown) =>
      typeof value === "string" && value.trim() ? value : null;

    return {
      faceId: str(body.default_face_id),
      name: str(body.pal_name),
      greeting: str(body.greeting),
    };
  } catch (error) {
    console.error("Tavus get pal threw", error);
    return empty;
  }
}

/**
 * Weaves the caller's first name into the PAL's own greeting.
 *
 * The greeting text belongs to PAL Maker, so the only thing done to it here is
 * substituting `{first_name}` (or `{firstname}`, either case). A greeting with
 * no token is left entirely alone and no override is sent at all, so what PAL
 * Maker shows is exactly what the caller hears.
 */
function personalizeGreeting(
  greeting: string | null,
  firstName: string,
): string | null {
  if (!greeting) return null;
  const personalized = greeting.replace(/\{first_?name\}/gi, firstName);
  return personalized === greeting ? null : personalized;
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
