import type { Metadata } from "next";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { IntakeClient } from "./IntakeClient";

export const metadata: Metadata = {
  title: "Start your intake — People Machine",
};

export default function IntakePage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-14">
        <h1 className="font-display text-4xl tracking-tight">
          Your intake conversation
        </h1>
        <p className="mt-4 leading-relaxed text-muted">
          Find a quiet place where you can speak freely. There is no time limit
          and nothing to fill out.
        </p>
        <div className="mt-10">
          <IntakeClient />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
