"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AssistantAction,
  AssistantAnswer,
  AssistantSource,
} from "@/lib/assistant";

/**
 * The chat badge in the corner of the public site.
 *
 * Three things it is not, all of them deliberate:
 *
 * - **Not an intake.** Its only reach into one is a link. Nothing said here is
 *   passed to Kelly or written to a row, so the two never have to be
 *   reconciled and an intake always starts clean. See src/lib/assistant.ts.
 * - **Not persistent.** The conversation lives in `sessionStorage` and dies
 *   with the tab. Nothing is on the server.
 * - **Not a wall of text.** An answer arrives as a short line plus at most one
 *   rendered block, because the alternative in a 400px column is unreadable.
 *
 * It is mounted from the root layout and hides itself on the pages below, so
 * every new public page gets it without being told to.
 */

/** Where a badge would be in the way rather than useful. */
const HIDDEN_PREFIXES = ["/admin"];
/** The two intakes themselves. /intake/thanks keeps the badge: it is over by then. */
const HIDDEN_EXACT = ["/intake", "/intake/text"];

const STORAGE_KEY = "pm_assistant_v1";

/** Shown in an empty window. Tapping one sends it as the first message. */
const STARTERS = [
  "What happens after I tell my story?",
  "Video or writing, which should I pick?",
  "What will you ask me?",
  "Does this cost anything?",
  "Is what I say private?",
];

const ACTION_LABELS: Record<AssistantAction, { href: string; label: string; hint: string }> = {
  text_intake: {
    href: "/intake/text",
    label: "Write it out",
    hint: "No camera or microphone",
  },
  video_intake: {
    href: "/intake",
    label: "Talk on video",
    hint: "About ten minutes",
  },
};

const OFFLINE: AssistantAnswer = {
  reply: "Something went wrong on my end. Try again, or go straight to an intake.",
  block: { kind: "none", steps: [], facts: [], compare: { left_title: "", left_points: [], right_title: "", right_points: [] } },
  actions: ["text_intake", "video_intake"],
  followups: [],
};

type ChatMessage =
  | { role: "user"; content: string }
  | {
      role: "assistant";
      answer: AssistantAnswer;
      sources: AssistantSource[];
      /** The flat form sent back as history next turn. */
      historyText: string;
    };

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function BubbleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-6" aria-hidden>
      <path d="M20.5 11.7a7.9 7.9 0 0 1-8.5 7.9 9 9 0 0 1-2.4-.4L4.5 21l1.2-4.2a7.6 7.6 0 0 1-1.2-4.2 7.9 7.9 0 0 1 8-7.9 7.9 7.9 0 0 1 8 7z" />
    </svg>
  );
}

/** What "still thinking" looks like when the answer is not streamed. */
function Thinking() {
  return (
    <div className="flex items-center gap-1.5 py-1" role="status" aria-label="Working on it">
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="pm-blink size-1.5 rounded-full bg-brand"
          style={{ animationDelay: `${index * 160}ms` }}
        />
      ))}
    </div>
  );
}

function AnswerBlock({ block }: { block: AssistantAnswer["block"] }) {
  if (block.kind === "steps") {
    return (
      <ol className="mt-3 space-y-2">
        {block.steps.map((step, index) => (
          <li key={step} className="flex gap-2.5 text-sm leading-relaxed">
            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[11px] font-medium text-brand">
              {index + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    );
  }

  if (block.kind === "facts") {
    return (
      <dl className="mt-3 divide-y divide-line rounded-xl border border-line">
        {block.facts.map((fact) => (
          <div key={fact.label} className="flex gap-3 px-3 py-2">
            <dt className="w-24 shrink-0 text-xs font-medium tracking-wide text-muted uppercase">
              {fact.label}
            </dt>
            <dd className="text-sm leading-snug">{fact.value}</dd>
          </div>
        ))}
      </dl>
    );
  }

  if (block.kind === "compare") {
    const columns = [
      { title: block.compare.left_title, points: block.compare.left_points },
      { title: block.compare.right_title, points: block.compare.right_points },
    ];
    return (
      <div className="mt-3 grid grid-cols-2 gap-2">
        {columns.map((column) => (
          <div key={column.title} className="rounded-xl border border-line p-3">
            <p className="text-xs font-medium tracking-wide text-brand uppercase">
              {column.title}
            </p>
            <ul className="mt-2 space-y-1.5">
              {column.points.map((point) => (
                <li key={point} className="text-[13px] leading-snug text-muted">
                  {point}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    );
  }

  return null;
}

function AnswerCard({
  message,
  onFollowup,
  onNavigate,
}: {
  message: Extract<ChatMessage, { role: "assistant" }>;
  onFollowup: (question: string) => void;
  onNavigate: () => void;
}) {
  const { answer, sources } = message;

  return (
    <div className="space-y-3">
      <p className="text-[15px] leading-relaxed">{answer.reply}</p>

      <AnswerBlock block={answer.block} />

      {answer.actions.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {answer.actions.map((action) => {
            const spec = ACTION_LABELS[action];
            return (
              <Link
                key={action}
                href={spec.href}
                onClick={onNavigate}
                className="group rounded-xl border border-brand bg-brand px-3.5 py-2 text-white transition-colors hover:bg-brand-hover"
              >
                <span className="block text-sm font-medium">{spec.label}</span>
                <span className="block text-[11px] text-white/70">{spec.hint}</span>
              </Link>
            );
          })}
        </div>
      )}

      {sources.length > 0 && (
        <div className="pt-1">
          <p className="text-[11px] font-medium tracking-wide text-muted uppercase">
            Sources
          </p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {sources.map((source, index) => (
              <li key={source.url}>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={source.title}
                  className="flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[11px] text-muted transition-colors hover:border-brand hover:text-brand"
                >
                  <span className="font-mono text-[10px] text-brand">{index + 1}</span>
                  {hostOf(source.url)}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {answer.followups.length > 0 && (
        <ul className="flex flex-col items-start gap-1.5 pt-1">
          {answer.followups.map((followup) => (
            <li key={followup}>
              <button
                type="button"
                onClick={() => onFollowup(followup)}
                className="rounded-full border border-dashed border-line px-3 py-1.5 text-left text-[13px] text-muted transition-colors hover:border-brand hover:text-brand"
              >
                {followup}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AssistantWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [restored, setRestored] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const hidden =
    HIDDEN_EXACT.includes(pathname) ||
    HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  // Restored when the panel is opened rather than on mount. The server has no
  // session storage, so reading it during render would hydrate a tree the
  // server never produced, and reading it in an effect would be a setState the
  // first paint does not need: nothing from `messages` is on screen until the
  // panel is open anyway.
  const openPanel = useCallback(() => {
    setOpen(true);
    if (restored) return;
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) setMessages(JSON.parse(stored) as ChatMessage[]);
    } catch {
      // A blocked or full store is not worth a broken badge.
    }
    setRestored(true);
  }, [restored]);

  // Guarded on `restored` so the empty initial state cannot overwrite a
  // conversation that has not been read back yet.
  useEffect(() => {
    if (!restored) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      // As above.
    }
  }, [messages, restored]);

  // The panel is a full-screen sheet on a phone, so the page behind it must not
  // scroll under the thumb.
  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    if (!window.matchMedia("(max-width: 639px)").matches) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages, busy, open]);

  const send = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || busy) return;

      const next: ChatMessage[] = [...messages, { role: "user", content }];
      setMessages(next);
      setDraft("");
      if (inputRef.current) inputRef.current.style.height = "auto";
      setBusy(true);

      try {
        const response = await fetch("/api/assistant", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            messages: next.map((message) =>
              message.role === "user"
                ? { role: "user", content: message.content }
                : { role: "assistant", content: message.historyText },
            ),
          }),
        });

        const data = (await response.json()) as {
          answer?: AssistantAnswer;
          sources?: AssistantSource[];
          historyText?: string;
        };

        if (!response.ok || !data.answer) throw new Error("assistant turn failed");

        setMessages((current) => [
          ...current,
          {
            role: "assistant",
            answer: data.answer as AssistantAnswer,
            sources: data.sources ?? [],
            historyText: data.historyText ?? (data.answer as AssistantAnswer).reply,
          },
        ]);
      } catch {
        setMessages((current) => [
          ...current,
          { role: "assistant", answer: OFFLINE, sources: [], historyText: OFFLINE.reply },
        ]);
      } finally {
        setBusy(false);
      }
    },
    [busy, messages],
  );

  if (hidden) return null;

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={openPanel}
          aria-label="Ask the People Machine assistant"
          className="pm-rise fixed right-5 bottom-5 z-50 flex size-14 items-center justify-center rounded-full bg-brand text-white shadow-lg shadow-brand/25 transition-colors hover:bg-brand-hover focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          <BubbleIcon />
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-modal="false"
          aria-label="People Machine assistant"
          className="pm-rise fixed inset-0 z-50 flex flex-col border-line bg-surface sm:inset-auto sm:right-5 sm:bottom-5 sm:h-[min(41rem,calc(100dvh-2.5rem))] sm:w-[25rem] sm:rounded-2xl sm:border sm:shadow-2xl"
        >
          <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
            <div>
              <p className="font-display text-lg leading-none tracking-tight">
                Ask People Machine
              </p>
              <p className="mt-1.5 text-xs text-muted">
                General help finding your way. Not legal advice.
              </p>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={() => setMessages([])}
                  className="rounded-full px-2.5 py-1 text-xs text-muted transition-colors hover:bg-paper hover:text-ink"
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="flex size-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-paper hover:text-ink"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="size-4" aria-hidden>
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto px-4 py-4">
            {messages.length === 0 ? (
              <div className="pt-2">
                <p className="font-display text-2xl leading-snug tracking-tight">
                  What would you like to know?
                </p>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  Ask about how this works, or anything you have been wondering
                  about your situation. I can look things up.
                </p>
                <ul className="mt-5 flex flex-col items-start gap-2">
                  {STARTERS.map((starter) => (
                    <li key={starter}>
                      <button
                        type="button"
                        onClick={() => send(starter)}
                        className="rounded-full border border-line px-3.5 py-2 text-left text-[13px] transition-colors hover:border-brand hover:bg-brand-soft hover:text-brand"
                      >
                        {starter}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="space-y-5" aria-live="polite">
                {messages.map((message, index) =>
                  message.role === "user" ? (
                    <p
                      key={index}
                      className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-brand-soft px-3.5 py-2 text-[15px] leading-relaxed text-ink"
                    >
                      {message.content}
                    </p>
                  ) : (
                    <AnswerCard
                      key={index}
                      message={message}
                      onFollowup={send}
                      onNavigate={() => setOpen(false)}
                    />
                  ),
                )}
                {busy && <Thinking />}
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="border-t border-line px-3 pt-3 pb-2">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void send(draft);
              }}
              className="flex items-end gap-2 rounded-2xl border border-line bg-paper px-3 py-2 focus-within:border-brand"
            >
              <textarea
                ref={inputRef}
                rows={1}
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value);
                  const element = event.target;
                  element.style.height = "auto";
                  element.style.height = `${Math.min(element.scrollHeight, 112)}px`;
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void send(draft);
                  }
                }}
                placeholder="Ask anything"
                className="max-h-28 flex-1 resize-none bg-transparent py-1 text-[15px] placeholder:text-muted focus:outline-none"
              />
              <button
                type="submit"
                disabled={busy || draft.trim().length === 0}
                aria-label="Send"
                className="mb-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-brand text-white transition-opacity hover:bg-brand-hover disabled:opacity-30"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden>
                  <path d="M12 19V5M5 12l7-7 7 7" />
                </svg>
              </button>
            </form>
            <p className="px-1 pt-2 text-[11px] leading-snug text-muted">
              An AI assistant, not a lawyer. This chat is not saved and is not
              part of your intake.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
