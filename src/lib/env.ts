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
  /** Maya — Civil Rights Intake Specialist. */
  get tavusPalId() {
    return process.env.TAVUS_PAL_ID || "p7ac55cbadb2";
  },
  /** Maya's default face. */
  get tavusFaceId() {
    return process.env.TAVUS_FACE_ID || "ra3a03647d46";
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
