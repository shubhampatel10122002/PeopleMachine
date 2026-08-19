import { env } from "./env";

const TAVUS_API = "https://tavusapi.com/v2";

export type CreatedConversation = {
  conversation_id: string;
  conversation_url: string;
  conversation_name?: string;
  status?: string;
};

/**
 * Starts a CVI conversation with Maya. The callback_url carries a shared
 * secret so our webhook can reject anything that did not come from this call.
 *
 * Note: Maya's per-objective callbacks are configured on the objective set in
 * Tavus, not here — see README ("Tavus objective callbacks").
 */
export async function createConversation(
  conversationName: string,
): Promise<CreatedConversation> {
  const callbackUrl = `${env.publicBaseUrl}/api/tavus/webhook?secret=${encodeURIComponent(
    env.tavusWebhookSecret,
  )}`;

  const response = await fetch(`${TAVUS_API}/conversations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.tavusApiKey,
    },
    body: JSON.stringify({
      pal_id: env.tavusPalId,
      face_id: env.tavusFaceId,
      conversation_name: conversationName,
      callback_url: callbackUrl,
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
