import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

/**
 * Service-role client. RLS is enabled on both tables with no policies, so this
 * is the only way in — which means it must never be imported by a client
 * component or used outside a server route/page.
 */
export function supabaseAdmin() {
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
