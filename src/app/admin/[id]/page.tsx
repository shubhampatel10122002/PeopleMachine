import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import {
  capturedFieldCount,
  INTAKE_FIELDS,
  INTAKE_FIELD_LABELS,
  type Intake,
  type IntakeEvent,
  type TranscriptTurn,
} from "@/lib/types";
import { saveTriage } from "./actions";

export const dynamic = "force-dynamic";

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function Section({
  title,
  children,
  subtitle,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="font-display text-2xl tracking-tight">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/**
 * Tavus returns the perception analysis as a markdown-ish bullet list
 * ("* **Heading:** body"). Split it back into labelled rows so it reads.
 */
function PerceptionAnalysis({ text }: { text: string }) {
  const rows = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[*-]\s+/, "").replace(/\*\*/g, ""))
    .map((line) => {
      // Only a short leading fragment is a heading; a colon mid-sentence is not.
      const separator = line.indexOf(": ");
      if (separator < 1 || separator > 60) return { label: null, body: line };
      return {
        label: line.slice(0, separator),
        body: line.slice(separator + 2),
      };
    });

  return (
    <div className="space-y-4 rounded-2xl border border-line bg-surface p-6">
      {rows.map((row, index) => (
        <div key={index}>
          {row.label && (
            <div className="text-xs tracking-wide text-muted uppercase">
              {row.label}
            </div>
          )}
          <p className="prose-plain mt-1 leading-relaxed">{row.body}</p>
        </div>
      ))}
    </div>
  );
}

function Json({ value }: { value: unknown }) {
  return (
    <pre className="overflow-x-auto rounded-xl border border-line bg-surface p-4 font-mono text-xs leading-relaxed">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export default async function IntakeDetailPage(props: PageProps<"/admin/[id]">) {
  const { id } = await props.params;
  const supabase = supabaseAdmin();

  const { data } = await supabase.from("intakes").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const intake = data as Intake;

  const { data: eventRows } = await supabase
    .from("intake_events")
    .select("*")
    .eq("intake_id", id)
    .order("created_at", { ascending: true });
  const events = (eventRows ?? []) as IntakeEvent[];

  const transcript: TranscriptTurn[] = Array.isArray(intake.transcript)
    ? intake.transcript
    : [];
  const narrative = intake.narrative_summary;

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-12">
      <Link
        href="/admin"
        className="text-sm text-muted underline underline-offset-4 hover:text-ink"
      >
        ← All intakes
      </Link>

      <h1 className="mt-4 font-display text-4xl tracking-tight">
        {intake.first_name ?? "Unnamed intake"}
      </h1>

      <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
        {[
          ["Status", intake.status],
          ["Started", formatDate(intake.started_at)],
          ["Ended", formatDate(intake.ended_at)],
          ["Transcript", formatDate(intake.transcript_ready_at)],
          ["Consent", formatDate(intake.consent_at)],
          ["Consent version", intake.consent_version ?? "—"],
          ["Conversation", intake.tavus_conversation_id],
          ["PAL", intake.pal_id ?? "—"],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs tracking-wide text-muted uppercase">{label}</dt>
            <dd className="mt-1 break-words">{value}</dd>
          </div>
        ))}
      </dl>

      <Section
        title="Collected details"
        subtitle={`${capturedFieldCount(intake)} of ${INTAKE_FIELDS.length} fields captured. A field stays empty when its Tavus objective never completed.`}
      >
        <dl className="grid gap-x-6 gap-y-4 rounded-2xl border border-line bg-surface p-6 sm:grid-cols-2">
          {INTAKE_FIELDS.filter((field) => field !== "narrative_summary").map(
            (field) => (
              <div key={field}>
                <dt className="text-xs tracking-wide text-muted uppercase">
                  {INTAKE_FIELD_LABELS[field]}
                </dt>
                <dd className="mt-1">
                  {intake[field] ?? <span className="text-muted">—</span>}
                </dd>
              </div>
            ),
          )}
        </dl>
      </Section>

      <Section title="What happened">
        {narrative ? (
          <p className="prose-plain rounded-2xl border border-line bg-surface p-6 leading-relaxed">
            {narrative}
          </p>
        ) : (
          <p className="text-muted">
            No narrative captured yet. It arrives when the
            <code className="mx-1 font-mono text-xs">gather_open_narrative</code>
            objective completes.
          </p>
        )}
      </Section>

      <Section
        title="Transcript"
        subtitle={
          transcript.length > 0
            ? `${transcript.length} turns`
            : "Arrives after the conversation ends."
        }
      >
        {transcript.length > 0 ? (
          <div className="space-y-4 rounded-2xl border border-line bg-surface p-6">
            {transcript
              .filter((turn) => turn.role !== "system")
              .map((turn, index) => (
                <div key={index}>
                  <div className="text-xs tracking-wide text-muted uppercase">
                    {turn.role === "assistant" ? "Maya" : turn.role}
                  </div>
                  <p className="prose-plain mt-1 leading-relaxed">{turn.content}</p>
                </div>
              ))}
          </div>
        ) : (
          <p className="text-muted">Nothing yet.</p>
        )}
      </Section>

      <Section
        title="Video analysis"
        subtitle="Tavus's visual read of the caller during the conversation."
      >
        {typeof intake.perception_analysis?.analysis === "string" ? (
          <PerceptionAnalysis text={intake.perception_analysis.analysis} />
        ) : intake.perception_analysis ? (
          <Json value={intake.perception_analysis} />
        ) : (
          <p className="text-muted">
            No analysis received. It arrives shortly after the call ends.
          </p>
        )}
      </Section>

      <Section
        title="Raw objective output"
        subtitle="Exactly what Tavus sent, keyed by objective name."
      >
        <Json value={intake.objectives ?? {}} />
      </Section>

      <Section
        title="Webhook log"
        subtitle={`${events.length} event${events.length === 1 ? "" : "s"} received.`}
      >
        {events.length === 0 ? (
          <p className="text-muted">No events received for this conversation.</p>
        ) : (
          <div className="space-y-2">
            {events.map((event) => (
              <details
                key={event.id}
                className="rounded-xl border border-line bg-surface px-4 py-3"
              >
                <summary className="cursor-pointer text-sm">
                  <span className="font-medium">
                    {event.objective_name ?? event.event_type ?? "unknown"}
                  </span>
                  <span className="ml-2 text-muted">
                    {formatDate(event.created_at)}
                  </span>
                </summary>
                <div className="mt-3">
                  <Json value={event.payload} />
                </div>
              </details>
            ))}
          </div>
        )}
      </Section>

      <Section title="Triage">
        <form
          action={saveTriage}
          className="rounded-2xl border border-line bg-surface p-6"
        >
          <input type="hidden" name="id" value={intake.id} />
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              name="reviewed"
              defaultChecked={intake.reviewed}
              className="size-4 accent-brand"
            />
            <span className="text-sm font-medium">Mark as reviewed</span>
          </label>

          <label htmlFor="admin_notes" className="mt-6 block text-sm font-medium">
            Internal notes
          </label>
          <textarea
            id="admin_notes"
            name="admin_notes"
            rows={4}
            defaultValue={intake.admin_notes ?? ""}
            className="mt-2 w-full rounded-lg border border-line px-4 py-3 text-sm outline-none focus:border-brand"
          />

          <button
            type="submit"
            className="mt-4 rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-hover"
          >
            Save
          </button>
        </form>
      </Section>
    </main>
  );
}
