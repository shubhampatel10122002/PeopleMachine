import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";

export const metadata: Metadata = {
  title: "Thank you — People Machine",
};

export default function ThanksPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-24">
        <h1 className="font-display text-4xl tracking-tight">
          Thank you for telling us.
        </h1>
        <div className="mt-6 space-y-4 leading-relaxed text-muted">
          <p>
            What you shared has been saved and is with our team. Someone will
            follow up at the number and email you gave Ethan.
          </p>
          <p>
            If your situation changes, or you remember something important, you
            can start another conversation any time.
          </p>
        </div>
        <Link
          href="/"
          className="mt-10 inline-block rounded-full border border-line px-6 py-3 font-medium transition-colors hover:bg-surface"
        >
          Back to home
        </Link>
      </main>
      <SiteFooter />
    </>
  );
}
