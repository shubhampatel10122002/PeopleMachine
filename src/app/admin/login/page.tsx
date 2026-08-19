import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin — People Machine",
};

const messages: Record<string, string> = {
  invalid: "That password was not correct.",
  unconfigured:
    "ADMIN_PASSWORD is not set on this deployment, so the dashboard is locked.",
};

export default async function AdminLoginPage(
  props: PageProps<"/admin/login">,
) {
  const searchParams = await props.searchParams;
  const errorKey = typeof searchParams.error === "string" ? searchParams.error : null;
  const next = typeof searchParams.next === "string" ? searchParams.next : "/admin";

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-24">
      <h1 className="font-display text-3xl tracking-tight">People Machine</h1>
      <p className="mt-2 text-sm text-muted">Intake dashboard</p>

      <form action="/api/admin/login" method="post" className="mt-8">
        <input type="hidden" name="next" value={next} />
        <label htmlFor="password" className="text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          autoFocus
          className="mt-2 w-full rounded-lg border border-line bg-surface px-4 py-2.5 outline-none focus:border-brand"
        />

        {errorKey && messages[errorKey] && (
          <p className="mt-4 text-sm text-danger">{messages[errorKey]}</p>
        )}

        <button
          type="submit"
          className="mt-6 w-full rounded-full bg-brand px-6 py-3 font-medium text-white transition-colors hover:bg-brand-hover"
        >
          Sign in
        </button>
      </form>
    </main>
  );
}
