"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AGENT_NAME } from "@/lib/agent";

/**
 * The typed intake.
 *
 * Everything about which question comes next is the server's decision, so this
 * component holds no plan of its own: it renders whatever question came back,
 * collects one answer, and posts it. That is why a question can be a set of
 * chips one turn and a text box the next without any branching here.
 */

type Option = { value: string; label: string };

type Question = {
  field: string;
  text: string;
  helper: string | null;
  input: "single_select" | "multi_select" | "text" | "long_text";
  options: Option[];
  allowOther: boolean;
  allowSkip: boolean;
};

type Reply = {
  status: "asking" | "finished";
  acknowledgement: string | null;
  question: Question | null;
  closingMessage: string | null;
  progress: { answered: number; total: number };
};

type Bubble = { role: "agent" | "person"; text: string };

type Session = { intakeId: string; sessionToken: string };

export function TextIntakeClient() {
  const router = useRouter();

  const [firstName, setFirstName] = useState("");
  const [callbackPhone, setCallbackPhone] = useState("");
  const [email, setEmail] = useState("");
  const [consented, setConsented] = useState(false);

  const [session, setSession] = useState<Session | null>(null);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [question, setQuestion] = useState<Question | null>(null);
  const [progress, setProgress] = useState({ answered: 0, total: 1 });
  const [closing, setClosing] = useState<string | null>(null);

  const [chosen, setChosen] = useState<string[]>([]);
  const [typed, setTyped] = useState("");
  const [otherOpen, setOtherOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const endRef = useRef<HTMLDivElement | null>(null);
  const typedRef = useRef<HTMLTextAreaElement | null>(null);

  const emailLooksReachable = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const readyToStart =
    firstName.trim().length > 0 &&
    (callbackPhone.match(/\d/g) ?? []).length >= 7 &&
    emailLooksReachable &&
    consented;

  const isSelect =
    question?.input === "single_select" || question?.input === "multi_select";
  const freeTextOnly = Boolean(question) && !isSelect;
  const showTextBox = freeTextOnly || otherOpen;

  // Keep the newest bubble in view as the conversation grows.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [bubbles, question, closing]);

  // A free-text question should be typeable without reaching for the mouse.
  useEffect(() => {
    if (showTextBox) typedRef.current?.focus();
  }, [showTextBox, question]);

  function applyReply(reply: Reply, personSaid?: string) {
    setBubbles((previous) => {
      const next = [...previous];
      if (personSaid) next.push({ role: "person", text: personSaid });
      if (reply.acknowledgement) {
        next.push({ role: "agent", text: reply.acknowledgement });
      }
      if (reply.question) next.push({ role: "agent", text: reply.question.text });
      return next;
    });

    setQuestion(reply.question);
    setProgress(reply.progress);
    setClosing(reply.status === "finished" ? reply.closingMessage : null);
    setChosen([]);
    setTyped("");
    setOtherOpen(false);
  }

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/intake/text/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consent: true,
          firstName: firstName.trim(),
          callbackPhone: callbackPhone.trim(),
          email: email.trim(),
        }),
      });
      const data = await response.json();

      if (!response.ok || !data.question) {
        setError(data.error ?? "Could not start the conversation.");
        return;
      }

      setSession({ intakeId: data.intakeId, sessionToken: data.sessionToken });
      applyReply({
        status: "asking",
        acknowledgement: data.acknowledgement,
        question: data.question,
        closingMessage: null,
        progress: data.progress,
      });
    } catch {
      setError("Could not reach the server. Check your connection and retry.");
    } finally {
      setBusy(false);
    }
  }

  async function send(payload: {
    values: string[];
    text: string;
    skipped?: boolean;
    ended?: boolean;
  }) {
    if (!session || !question) return;

    const labels = payload.values.map(
      (value) =>
        question.options.find((option) => option.value === value)?.label ?? value,
    );
    const said = payload.skipped
      ? "Skipped"
      : payload.ended
        ? "That's everything for now"
        : [...labels, payload.text.trim()].filter(Boolean).join(", ");

    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/intake/text/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...session, ...payload }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Could not save that answer.");
        return;
      }

      applyReply(data as Reply, said);
    } catch {
      setError("Could not reach the server. Your answer was not saved.");
    } finally {
      setBusy(false);
    }
  }

  function toggle(value: string) {
    if (!question) return;
    if (question.input === "single_select") {
      // One tap answers a single-select. Anything else is a second click for
      // no reason, on the question type that is meant to be the fast one.
      void send({ values: [value], text: "" });
      return;
    }
    setChosen((previous) =>
      previous.includes(value)
        ? previous.filter((entry) => entry !== value)
        : [...previous, value],
    );
  }

  const canSubmit =
    !busy &&
    Boolean(question) &&
    (chosen.length > 0 || typed.trim().length > 0);

  // --- the form ------------------------------------------------------------

  if (!session) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-8">
        <h2 className="font-display text-2xl tracking-tight">Before we start</h2>
        <p className="mt-2 text-sm text-muted">
          Just three things, so we can reach you if you have to stop partway.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="firstName" className="text-sm font-medium">
              First name
            </label>
            <input
              id="firstName"
              name="firstName"
              type="text"
              autoComplete="given-name"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              className="mt-2 w-full rounded-lg border border-line px-4 py-2.5 outline-none focus:border-brand"
            />
          </div>
          <div>
            <label htmlFor="callbackPhone" className="text-sm font-medium">
              Phone number
            </label>
            <input
              id="callbackPhone"
              name="callbackPhone"
              type="tel"
              autoComplete="tel"
              value={callbackPhone}
              onChange={(event) => setCallbackPhone(event.target.value)}
              className="mt-2 w-full rounded-lg border border-line px-4 py-2.5 outline-none focus:border-brand"
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 w-full rounded-lg border border-line px-4 py-2.5 outline-none focus:border-brand"
            />
          </div>
        </div>

        <div className="mt-8 space-y-3 leading-relaxed text-muted">
          <p>
            You&rsquo;ll be writing with {AGENT_NAME}, an AI intake specialist,
            who is not a lawyer and cannot give legal advice.
          </p>
          <p>
            No camera and no microphone. What you write is stored so our team
            and a reviewing attorney can read it. You can skip any question and
            stop whenever you like.
          </p>
        </div>

        <label className="mt-6 flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={consented}
            onChange={(event) => setConsented(event.target.checked)}
            className="mt-1 size-4 accent-brand"
          />
          <span className="text-sm leading-relaxed">
            I understand that {AGENT_NAME} is an AI assistant, that what I write
            will be stored and reviewed, that this is not legal advice, and that
            no attorney&ndash;client relationship is created.
          </span>
        </label>

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-danger">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={start}
          disabled={!readyToStart || busy}
          className="mt-6 rounded-full bg-brand px-6 py-3 font-medium text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Starting…" : "Start writing"}
        </button>

        <p className="mt-6 text-sm text-muted">
          Would rather talk it through?{" "}
          <Link href="/intake" className="text-brand underline underline-offset-4">
            Speak with {AGENT_NAME} on video instead
          </Link>
          .
        </p>
      </div>
    );
  }

  // --- the conversation ----------------------------------------------------

  return (
    <div>
      <div className="rounded-2xl border border-line bg-surface">
        <div className="max-h-[52vh] min-h-[280px] space-y-4 overflow-y-auto p-6">
          {bubbles.map((bubble, index) => (
            <div
              key={index}
              className={bubble.role === "person" ? "flex justify-end" : ""}
            >
              <p
                className={
                  bubble.role === "person"
                    ? "prose-plain max-w-[85%] rounded-2xl rounded-br-sm bg-brand-soft px-4 py-3 leading-relaxed text-ink"
                    : "prose-plain max-w-[85%] rounded-2xl rounded-bl-sm bg-paper px-4 py-3 leading-relaxed"
                }
              >
                {bubble.text}
              </p>
            </div>
          ))}

          {busy && (
            <p className="text-sm text-muted" aria-live="polite">
              {AGENT_NAME} is reading that…
            </p>
          )}

          {closing && (
            <div className="rounded-2xl border border-line bg-paper px-4 py-3">
              <p className="prose-plain leading-relaxed">{closing}</p>
            </div>
          )}

          <div ref={endRef} />
        </div>

        {question && (
          <div className="border-t border-line p-6">
            {question.helper && (
              <p className="mb-3 text-sm text-muted">{question.helper}</p>
            )}

            {isSelect && (
              <div className="flex flex-wrap gap-2">
                {question.options.map((option) => {
                  const active = chosen.includes(option.value);
                  return (
                    <button
                      key={option.value}
                      type="button"
                      disabled={busy}
                      onClick={() => toggle(option.value)}
                      aria-pressed={
                        question.input === "multi_select" ? active : undefined
                      }
                      className={`rounded-full border px-4 py-2 text-sm transition-colors disabled:opacity-50 ${
                        active
                          ? "border-brand bg-brand text-white"
                          : "border-line bg-surface hover:border-brand hover:bg-brand-soft"
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}

                {question.allowOther && !otherOpen && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setOtherOpen(true)}
                    className="rounded-full border border-dashed border-line px-4 py-2 text-sm text-muted transition-colors hover:border-brand hover:text-ink disabled:opacity-50"
                  >
                    Something else
                  </button>
                )}
              </div>
            )}

            {showTextBox && (
              <textarea
                ref={typedRef}
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                onKeyDown={(event) => {
                  // Enter sends, Shift+Enter breaks the line. A long account
                  // needs paragraphs, so the opening question is exempt.
                  if (
                    event.key === "Enter" &&
                    !event.shiftKey &&
                    question.input !== "long_text" &&
                    canSubmit
                  ) {
                    event.preventDefault();
                    void send({ values: chosen, text: typed });
                  }
                }}
                rows={question.input === "long_text" ? 6 : 2}
                placeholder={
                  question.input === "long_text"
                    ? "Start wherever makes sense to you."
                    : "Type your answer"
                }
                className={`w-full rounded-lg border border-line px-4 py-3 outline-none focus:border-brand ${
                  isSelect ? "mt-3" : ""
                }`}
              />
            )}

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={!canSubmit}
                onClick={() => void send({ values: chosen, text: typed })}
                className="rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? "Sending…" : "Send"}
              </button>

              {question.allowSkip && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void send({ values: [], text: "", skipped: true })}
                  className="text-sm text-muted underline underline-offset-4 hover:text-ink disabled:opacity-50"
                >
                  I&rsquo;d rather not say
                </button>
              )}

              <button
                type="button"
                disabled={busy}
                onClick={() => void send({ values: [], text: "", ended: true })}
                className="ml-auto text-sm text-muted underline underline-offset-4 hover:text-ink disabled:opacity-50"
              >
                That&rsquo;s everything
              </button>
            </div>
          </div>
        )}
      </div>

      {error && (
        <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      {question && (
        <p className="mt-4 text-sm text-muted">
          {progress.answered} of {progress.total} essentials covered. You can
          stop at any point and we will still have what you have shared.
        </p>
      )}

      {!question && closing && (
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={() => router.push("/intake/thanks")}
            className="rounded-full bg-brand px-6 py-3 font-medium text-white transition-colors hover:bg-brand-hover"
          >
            Done
          </button>
          <span className="text-sm text-muted">
            Nothing else is needed from you right now.
          </span>
        </div>
      )}
    </div>
  );
}
