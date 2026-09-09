/**
 * The agent's name as it appears in *site copy* — the landing page, the intake
 * consent text, the transcript labels in /admin.
 *
 * Everything the caller actually hears comes from PAL Maker instead: the name
 * the agent gives, its greeting, its face and its whole system prompt live on
 * the PAL and are read at call time, so renaming there needs no deploy. This
 * constant exists only because static marketing copy cannot be fetched from
 * Tavus without making every page render an API call.
 *
 * So a rename is two steps: the PAL in PAL Maker, and this one line. Keep them
 * in step — nothing enforces it.
 */
export const AGENT_NAME = "Kelly";
