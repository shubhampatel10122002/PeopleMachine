import type { Metadata } from "next";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { TextIntakeClient } from "./TextIntakeClient";

export const metadata: Metadata = {
  title: "Write it out instead — People Machine",
};

export default function TextIntakePage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-14">
        <h1 className="font-display text-4xl tracking-tight">
          Write it out instead
        </h1>
        <p className="mt-4 leading-relaxed text-muted">
          No camera, no microphone, and no form to fill in. A few questions, one
          at a time, and most of them you can answer by tapping.
        </p>
        <div className="mt-10">
          <TextIntakeClient />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
