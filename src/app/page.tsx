import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { AGENT_NAME } from "@/lib/agent";

const steps = [
  {
    title: "Tell it your way",
    body: `${AGENT_NAME}, our intake specialist, meets you on video and listens. Not up for a camera? Answer the same questions in writing instead. No forms either way, no time limit, no wrong way to tell it.`,
  },
  {
    title: "We organize it",
    body: "Your account is written up alongside the details that matter: who was involved, where it happened, and roughly when.",
  },
  {
    title: "An attorney reviews it",
    body: "A real person from our network reads what you shared and follows up at the number you gave us.",
  },
];

const asked = [
  "Your first name, a number and an email to reach you, before anything else",
  "What happened, in your own words",
  "Who was responsible: an agency, an employer, a landlord",
  "Where and roughly when it happened",
  "Whether you have already filed anything about it",
  "The best time to reach you",
];

export default function Home() {
  return (
    <>
      <SiteHeader />

      <main className="flex-1">
        <section className="mx-auto max-w-5xl px-6 pt-20 pb-16">
          <p className="text-sm font-medium tracking-wide text-brand uppercase">
            Civil rights intake
          </p>
          <h1 className="mt-4 max-w-3xl font-display text-5xl leading-[1.1] tracking-tight sm:text-6xl">
            Tell your story once. We take it from there.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted">
            Most people never get past the first phone call. People Machine
            gives you a conversation instead of a form, and puts what you said
            in front of an attorney who handles cases like yours.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Link
              href="/intake"
              className="rounded-full bg-brand px-6 py-3 font-medium text-white transition-colors hover:bg-brand-hover"
            >
              Start your intake
            </Link>
            <Link
              href="/intake/text"
              className="rounded-full border border-line px-6 py-3 font-medium transition-colors hover:bg-surface"
            >
              Or write it out instead
            </Link>
            <span className="text-sm text-muted">
              About 10 minutes &middot; No cost &middot; Camera optional
            </span>
          </div>
        </section>

        <section className="border-y border-line bg-surface">
          <div className="mx-auto max-w-5xl px-6 py-16">
            <h2 className="font-display text-3xl tracking-tight">How it works</h2>
            <ol className="mt-10 grid gap-10 sm:grid-cols-3">
              {steps.map((step, index) => (
                <li key={step.title}>
                  <span className="flex size-8 items-center justify-center rounded-full bg-brand-soft text-sm font-medium text-brand">
                    {index + 1}
                  </span>
                  <h3 className="mt-4 text-lg font-medium">{step.title}</h3>
                  <p className="mt-2 leading-relaxed text-muted">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-6 py-16">
          <div className="grid gap-12 sm:grid-cols-2">
            <div>
              <h2 className="font-display text-3xl tracking-tight">
                What we&rsquo;ll ask
              </h2>
              <p className="mt-4 leading-relaxed text-muted">
                Whichever way you choose, you can skip anything you are not
                comfortable answering and stop at any point. {AGENT_NAME} will
                not push, and will not ask the same thing twice.
              </p>
              <ul className="mt-6 space-y-3">
                {asked.map((item) => (
                  <li key={item} className="flex gap-3 text-muted">
                    <span aria-hidden className="text-brand">
                      &mdash;
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-line bg-surface p-8">
              <h2 className="font-display text-2xl tracking-tight">
                Being straight with you
              </h2>
              <div className="mt-4 space-y-4 leading-relaxed text-muted">
                <p>
                  {AGENT_NAME} is an AI assistant, not a lawyer, and not a
                  person: here to listen and take down what happened
                  accurately. What you say is stored either way, and on video
                  the call is transcribed and analysed, so our team can review
                  it properly.
                </p>
                <p>
                  We are building our network of civil rights attorneys right
                  now. Sharing your story today means you are in front of them
                  as that network comes online.
                </p>
                <p>
                  Nothing here is legal advice, and an intake does not create an
                  attorney&ndash;client relationship. If you are facing a filing
                  deadline, talk to a lawyer directly.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-line bg-surface">
          <div className="mx-auto max-w-5xl px-6 py-16 text-center">
            <h2 className="font-display text-3xl tracking-tight">
              Ready when you are
            </h2>
            <p className="mx-auto mt-4 max-w-xl leading-relaxed text-muted">
              On video you will need a camera and microphone, so find somewhere
              you can speak freely. In writing you need neither.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <Link
                href="/intake"
                className="rounded-full bg-brand px-6 py-3 font-medium text-white transition-colors hover:bg-brand-hover"
              >
                Talk it through on video
              </Link>
              <Link
                href="/intake/text"
                className="rounded-full border border-line px-6 py-3 font-medium transition-colors hover:bg-paper"
              >
                Write it out instead
              </Link>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
