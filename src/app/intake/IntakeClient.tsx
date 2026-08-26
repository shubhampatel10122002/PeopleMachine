"use client";

import type { DailyCall } from "@daily-co/daily-js";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

type Conversation = {
  conversationId: string;
  conversationUrl: string;
};

type Phase = "form" | "ready" | "live";

export function IntakeClient() {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [callbackPhone, setCallbackPhone] = useState("");
  const [consented, setConsented] = useState(false);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [phase, setPhase] = useState<Phase>("form");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const callFrameRef = useRef<DailyCall | null>(null);
  // Preloaded while the conversation is being created, so the join below stays
  // synchronous inside the click — iOS Safari only grants camera and mic
  // access on a real user gesture, and an await would break that chain.
  const dailyRef = useRef<typeof import("@daily-co/daily-js").default | null>(null);
  const leavingRef = useRef(false);

  const ready =
    firstName.trim().length > 0 &&
    (callbackPhone.match(/\d/g) ?? []).length >= 7 &&
    consented;

  useEffect(() => {
    return () => {
      callFrameRef.current?.destroy();
      callFrameRef.current = null;
    };
  }, []);

  const finish = useCallback(async () => {
    if (leavingRef.current) return;
    leavingRef.current = true;

    const frame = callFrameRef.current;
    callFrameRef.current = null;
    try {
      await frame?.destroy();
    } catch {
      // Already gone; nothing to clean up.
    }

    if (conversation) {
      try {
        await fetch("/api/intake/end", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId: conversation.conversationId }),
        });
      } catch {
        // The room times out on its own; sending the person onward is fine.
      }
    }

    router.push("/intake/thanks");
  }, [conversation, router]);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/intake/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consent: true,
          firstName: firstName.trim(),
          callbackPhone: callbackPhone.trim(),
        }),
      });
      const data = await response.json();

      if (!response.ok || !data.conversationUrl) {
        setError(data.error ?? "Could not start the conversation.");
        return;
      }

      dailyRef.current = (await import("@daily-co/daily-js")).default;

      setConversation({
        conversationId: data.conversationId,
        conversationUrl: data.conversationUrl,
      });
      setPhase("ready");
    } catch {
      setError("Could not reach the server. Check your connection and retry.");
    } finally {
      setBusy(false);
    }
  }

  /**
   * Must stay synchronous. Joining through the Daily SDK rather than pointing
   * an iframe at the room URL is what skips Daily's own pre-join screen, which
   * otherwise asks for a name we already collected on the form above.
   */
  function join() {
    const DailyIframe = dailyRef.current;
    const container = containerRef.current;
    if (!DailyIframe || !container || !conversation || callFrameRef.current) {
      return;
    }

    const frame = DailyIframe.createFrame(container, {
      iframeStyle: { width: "100%", height: "100%", border: "0" },
      showLeaveButton: false,
      showFullscreenButton: false,
    });
    callFrameRef.current = frame;
    frame.on("left-meeting", () => {
      void finish();
    });

    setPhase("live");
    frame.join({
      url: conversation.conversationUrl,
      userName: firstName.trim(),
    });
  }

  if (conversation) {
    return (
      <div>
        <div className="relative h-[70vh] min-h-[480px] overflow-hidden rounded-2xl border border-line bg-black">
          <div ref={containerRef} className="absolute inset-0" />

          {phase === "ready" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
              <p className="text-white">
                Maya is ready. Your browser will ask for camera and microphone
                access.
              </p>
              <button
                type="button"
                onClick={join}
                className="rounded-full bg-brand px-6 py-3 font-medium text-white transition-colors hover:bg-brand-hover"
              >
                Join the conversation
              </button>
            </div>
          )}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-muted">
            Take your time. When you and Maya are finished, end the conversation
            below.
          </p>
          <button
            type="button"
            onClick={() => void finish()}
            className="rounded-full border border-line px-5 py-2.5 text-sm font-medium transition-colors hover:bg-surface"
          >
            End conversation
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-8">
      <h2 className="font-display text-2xl tracking-tight">Before we start</h2>
      <p className="mt-2 text-sm text-muted">
        Just two things, so we can reach you if the call drops.
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
      </div>

      <div className="mt-8 space-y-3 leading-relaxed text-muted">
        <p>
          You&rsquo;ll be speaking with Maya, an AI intake specialist. She is
          not a lawyer and cannot give legal advice.
        </p>
        <p>
          Your conversation is transcribed and stored, and your video is
          analysed during the call, so our team and a reviewing attorney can
          read what you shared. You can skip any question or stop at any time.
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
          be transcribed, stored, and visually analysed, that this is not legal
          advice, and that no attorney&ndash;client relationship is created.
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
        disabled={!ready || busy}
        className="mt-6 rounded-full bg-brand px-6 py-3 font-medium text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Connecting…" : "Start the conversation"}
      </button>
    </div>
  );
}
