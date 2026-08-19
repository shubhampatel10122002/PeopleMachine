"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Conversation = {
  conversationId: string;
  conversationUrl: string;
};

export function IntakeClient() {
  const router = useRouter();
  const [consented, setConsented] = useState(false);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/intake/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consent: true }),
      });
      const data = await response.json();

      if (!response.ok || !data.conversationUrl) {
        setError(data.error ?? "Could not start the conversation.");
        return;
      }

      setConversation({
        conversationId: data.conversationId,
        conversationUrl: data.conversationUrl,
      });
    } catch {
      setError("Could not reach the server. Check your connection and retry.");
    } finally {
      setBusy(false);
    }
  }

  async function end() {
    if (!conversation) return;
    setBusy(true);
    try {
      await fetch("/api/intake/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: conversation.conversationId }),
      });
    } catch {
      // The room times out on its own; sending the person onward is fine.
    }
    router.push("/intake/thanks");
  }

  if (conversation) {
    return (
      <div>
        <div className="overflow-hidden rounded-2xl border border-line bg-black">
          <iframe
            src={conversation.conversationUrl}
            allow="camera; microphone; autoplay; display-capture; fullscreen"
            className="h-[70vh] min-h-[480px] w-full"
            title="Intake conversation with Maya"
          />
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-muted">
            Take your time. When you and Maya are finished, end the conversation
            below.
          </p>
          <button
            type="button"
            onClick={end}
            disabled={busy}
            className="rounded-full border border-line px-5 py-2.5 text-sm font-medium transition-colors hover:bg-surface disabled:opacity-60"
          >
            {busy ? "Ending…" : "End conversation"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-8">
      <h2 className="font-display text-2xl tracking-tight">Before we start</h2>

      <div className="mt-4 space-y-3 leading-relaxed text-muted">
        <p>
          You&rsquo;ll be speaking with Maya, an AI intake specialist. She is
          not a lawyer and cannot give legal advice.
        </p>
        <p>
          Your conversation is transcribed and stored so our team and a
          reviewing attorney can read what you shared. You can skip any question
          or stop at any time.
        </p>
        <p>
          You&rsquo;ll need to allow camera and microphone access when your
          browser asks.
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
          I understand that Maya is an AI assistant, that this conversation will
          be transcribed and stored, that this is not legal advice, and that no
          attorney&ndash;client relationship is created.
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
        disabled={!consented || busy}
        className="mt-6 rounded-full bg-brand px-6 py-3 font-medium text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Connecting…" : "Start the conversation"}
      </button>
    </div>
  );
}
