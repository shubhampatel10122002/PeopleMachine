import { env } from "./env";

const TAVUS_API = "https://tavusapi.com/v2";

export type CreatedConversation = {
  conversation_id: string;
  conversation_url: string;
  conversation_name?: string;
  status?: string;
};

/**
 * The name and phone come from a public form and get embedded in Ethan's
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
};

/**
 * Starts a CVI conversation with Ethan. The callback_url carries a shared
 * secret so our webhook can reject anything that did not come from this call.
 *
 * Name and phone are collected on the web form, so they are passed as context
 * rather than asked for out loud — Ethan's prompt tells him not to re-ask.
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

  const firstName = sanitize(input.firstName, 60);
  const callbackPhone = sanitize(input.callbackPhone, 32);

  const response = await fetch(`${TAVUS_API}/conversations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.tavusApiKey,
    },
    body: JSON.stringify({
      pal_id: env.tavusPalId,
      face_id: env.tavusFaceId,
      conversation_name: input.conversationName,
      callback_url: callbackUrl,
      conversational_context:
        `The person you are speaking with is ${firstName}. ` +
        `They gave their first name and callback number (${callbackPhone}) on the web form before this call, ` +
        `so both are already on file. Do not ask for either one. ` +
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
