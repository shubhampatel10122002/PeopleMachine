/**
 * Env access is lazy on purpose: `next build` must succeed on a machine that
 * has none of these set. Anything missing throws at request time instead.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  get tavusApiKey() {
    return required("TAVUS_API_KEY");
  },
  /**
   * Maya — Civil Rights Intake v2. The pre-redesign PAL (p7ac55cbadb2) is
   * superseded and must not be used: it is stuck mid-migration with no
   * guardrails attached, and PAL Maker holds a draft on it that blocks every
   * write, so it cannot be finished or reverted through the API.
   *
   * TAVUS_PAL_ID is set explicitly in Vercel and overrides this default, so it
   * has to be updated there too — see tavus/README.md.
   */
  get tavusPalId() {
    return process.env.TAVUS_PAL_ID || "p93c8a932419";
  },
  /** Anna - Professional (phoenix-4). Its own default voice is used, because
   *  Maya's TTS layer is left on tavus-auto. */
  get tavusFaceId() {
    return process.env.TAVUS_FACE_ID || "rf4e9d9790f0";
  },
  /** Shared secret appended to every callback_url we hand Tavus. */
  get tavusWebhookSecret() {
    return required("TAVUS_WEBHOOK_SECRET");
  },
  get supabaseUrl() {
    return required("NEXT_PUBLIC_SUPABASE_URL");
  },
  get supabaseServiceRoleKey() {
    return required("SUPABASE_SERVICE_ROLE_KEY");
  },
  get adminPassword() {
    return required("ADMIN_PASSWORD");
  },
  /**
   * Where Tavus should send webhooks. Set PUBLIC_BASE_URL explicitly in
   * production — the Vercel fallback keeps preview deploys from silently
   * pointing callbacks at a URL that changes on every push.
   */
  get publicBaseUrl() {
    const explicit = process.env.PUBLIC_BASE_URL;
    if (explicit) return explicit.replace(/\/$/, "");

    const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
    if (vercel) return `https://${vercel}`;

    return "http://localhost:3000";
  },
};

export const CONSENT_VERSION = "2026-08-19";
