import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <Link href="/" className="font-display text-xl tracking-tight">
          People Machine
        </Link>
        <Link
          href="/intake"
          className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-hover"
        >
          Start your intake
        </Link>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-6 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-xl">
          People Machine is not a law firm and does not provide legal advice.
          Submitting an intake does not create an attorney&ndash;client
          relationship.
        </p>
        <Link href="/admin" className="underline underline-offset-4 hover:text-ink">
          Admin
        </Link>
      </div>
    </footer>
  );
}
