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
   * Fallback only. Production sets TAVUS_PAL_ID in Vercel to p7ac55cbadb2, and
   * that is the PAL callers actually reach — the pal_id column on `intakes`
   * records what each call really ran on, so check it before believing any
   * doc. Both PALs carry the same prompt and objective tree, so this fallback
   * degrades to an equivalent agent rather than a different one; they have to
   * be edited together to stay that way. See tavus/README.md.
   */
  get tavusPalId() {
    return process.env.TAVUS_PAL_ID || "p93c8a932419";
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
  /** Drives the text intake at /intake/text. Nothing else in the app reads it. */
  get openaiApiKey() {
    return required("OPENAI_API_KEY");
  },
  /**
   * Optional. Scopes usage and billing to one OpenAI project rather than the
   * account default, which is what makes the intake's spend legible on its own.
   */
  get openaiProjectId() {
    return process.env.OPENAI_PROJECT_ID || null;
  },
  /**
   * Overridable so a model can be swapped without a code change, but the
   * default is the model the flow was written for. It reasons before it
   * answers, which is what lets it classify a matter silently while sounding
   * like a person — see src/lib/openai.ts.
   */
  get openaiModel() {
    return process.env.OPENAI_MODEL || "gpt-5.6-sol";
  },
  /**
   * Where Tavus should send conversation-level webhooks. This must be an origin
   * Tavus can actually reach, and getting it wrong is silent: the callbacks are
   * posted into the void, nothing retries, and the intake sits at in_progress
   * with no transcript. Objective callbacks survive it, because their URLs live
   * on the objective set in Tavus rather than being built here — an intake with
   * objective data but no transcript means this value is wrong.
   *
   * `VERCEL_PROJECT_PRODUCTION_URL` is the project's production *domain*, which
   * is not necessarily wired up: attaching a custom domain in Vercel changes
   * this even while the domain still points at a registrar parking page, and
   * env values are baked per deployment, so the breakage lands on whichever
   * deploy happens next rather than when the domain was attached. Set
   * PUBLIC_BASE_URL explicitly and keep it on an origin that resolves.
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

/**
 * The text intake agrees to different things: no camera, no microphone, and no
 * video analysis, but the same AI disclosure, storage and non-engagement terms.
 * Versioned separately so `intakes.consent_version` still says exactly which
 * words a given person was shown.
 */
export const TEXT_CONSENT_VERSION = "text-2026-09-09";
