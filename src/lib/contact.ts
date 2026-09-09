/**
 * The three things collected before either intake starts.
 *
 * Typed contact details beat transcribed ones, and collecting them first means
 * an abandoned intake still leaves a lead someone can call back. Both front
 * doors validate them the same way, from here, so the video form and the text
 * form can never drift into accepting different things.
 */

export type Contact = {
  firstName: string;
  callbackPhone: string;
  email: string;
};

function digitCount(value: string): number {
  return (value.match(/\d/g) ?? []).length;
}

/**
 * Deliberately loose. A wrong-but-plausible address is a problem for the
 * follow-up, not for this moment: someone who has just decided to describe an
 * assault should not be argued with by a regex.
 */
function looksReachable(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** Parses and checks the contact block. Returns a message fit to show. */
export function readContact(
  body: Record<string, unknown>,
): { contact: Contact } | { error: string } {
  const firstName =
    typeof body.firstName === "string" ? body.firstName.trim() : "";
  const callbackPhone =
    typeof body.callbackPhone === "string" ? body.callbackPhone.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";

  if (!firstName) return { error: "Please tell us your first name." };
  if (digitCount(callbackPhone) < 7) {
    return { error: "Please enter a phone number we can reach you on." };
  }
  if (!looksReachable(email)) {
    return { error: "Please enter an email address we can reach you on." };
  }

  return {
    contact: {
      firstName: firstName.slice(0, 120),
      callbackPhone: callbackPhone.slice(0, 64),
      email: email.slice(0, 320),
    },
  };
}
