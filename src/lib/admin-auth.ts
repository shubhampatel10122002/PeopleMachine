/**
 * Deliberately minimal admin gate: one shared password, no accounts.
 * Uses Web Crypto only, so it runs unchanged in `proxy.ts` and in route
 * handlers. The cookie holds an HMAC of a fixed string keyed by the password,
 * so the password itself is never stored in the browser.
 */

export const ADMIN_COOKIE = "pm_admin";
export const ADMIN_COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

const TOKEN_MESSAGE = "people-machine-admin-v1";

async function hmacHex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function adminToken(password: string): Promise<string> {
  return hmacHex(password, TOKEN_MESSAGE);
}

/** Length-independent constant-time comparison. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function isValidAdminToken(
  token: string | undefined,
  password: string,
): Promise<boolean> {
  if (!token) return false;
  return safeEqual(token, await adminToken(password));
}
