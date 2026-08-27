import type { Metadata } from "next";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import {
  capturedSpineCount,
  INTAKE_SPINE_FIELDS,
  type Intake,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Intakes — People Machine",
};

function formatDate(value: string): string {
  return new Date(value).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function StatusPill({ intake }: { intake: Intake }) {
  const label = intake.status === "completed" ? "Completed" : intake.status === "error" ? "Error" : "In progress";
  const tone =
    intake.status === "completed"
      ? "bg-brand-soft text-brand"
      : intake.status === "error"
        ? "bg-red-50 text-danger"
        : "bg-amber-50 text-amber-800";

  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${tone}`}>
      {label}
    </span>
  );
}

async function loadIntakes(): Promise<{ intakes: Intake[]; error: string | null }> {
  try {
    const { data, error } = await supabaseAdmin()
      .from("intakes")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    return { intakes: (data ?? []) as Intake[], error: error?.message ?? null };
  } catch (thrown) {
    // Missing env vars land here — show what is wrong instead of a 500.
    return {
      intakes: [],
      error: thrown instanceof Error ? thrown.message : "Unknown error.",
    };
  }
}

/**
 * Silent objective stalls show up here as a low count. Counts the spine only:
 * branch fields are null on nearly every row by design, so including them
 * would paint every intake red and the signal would be worthless.
 */
function FieldCount({ intake }: { intake: Intake }) {
  const captured = capturedSpineCount(intake);
  const total = INTAKE_SPINE_FIELDS.length;
  const incomplete = intake.status === "completed" && captured < total;

  return (
    <span className={incomplete ? "text-danger" : "text-muted"}>
      {captured}/{total}
    </span>
  );
}

export default async function AdminPage() {
  const { intakes, error } = await loadIntakes();

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl tracking-tight">Intakes</h1>
          <p className="mt-1 text-sm text-muted">
            {intakes.length} conversation{intakes.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/" className="text-muted underline underline-offset-4 hover:text-ink">
            Site
          </Link>
          <form action="/api/admin/logout" method="post">
            <button type="submit" className="text-muted underline underline-offset-4 hover:text-ink">
              Sign out
            </button>
          </form>
        </div>
      </div>

      {error && (
        <p className="mt-8 rounded-lg bg-red-50 px-4 py-3 text-sm text-danger">
          Could not load intakes: {error}
        </p>
      )}

      {!error && intakes.length === 0 && (
        <div className="mt-10 rounded-2xl border border-dashed border-line px-6 py-16 text-center">
          <p className="font-medium">No intakes yet.</p>
          <p className="mt-2 text-sm text-muted">
            Completed conversations appear here as soon as Tavus sends them
            through.
          </p>
        </div>
      )}

      {intakes.length > 0 && (
        <div className="mt-8 overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full min-w-3xl text-left text-sm">
            <thead className="border-b border-line text-xs tracking-wide text-muted uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">Started</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Contact</th>
                <th className="px-4 py-3 font-medium">Where</th>
                <th className="px-4 py-3 font-medium">Captured</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {intakes.map((intake) => (
                <tr key={intake.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 whitespace-nowrap text-muted">
                    {formatDate(intake.created_at)}
                  </td>
                  <td className="px-4 py-3 font-medium">
                    {intake.first_name ?? <span className="text-muted">—</span>}
                    {intake.reviewed && (
                      <span className="ml-2 text-xs font-normal text-muted">reviewed</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div>{intake.callback_phone ?? "—"}</div>
                    <div className="text-muted">{intake.email ?? "—"}</div>
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {[intake.incident_county, intake.incident_state]
                      .filter(Boolean)
                      .join(", ") || "—"}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <FieldCount intake={intake} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill intake={intake} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/${intake.id}`}
                      className="font-medium text-brand underline underline-offset-4"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
