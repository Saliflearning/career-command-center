import Link from "next/link";
import {
  ArrowRightIcon,
  CheckCircle2Icon,
  LockKeyholeIcon,
  ScanSearchIcon,
  UserRoundCheckIcon,
} from "lucide-react";
import FaqAccordion from "@/components/marketing/FaqAccordion";

export const metadata = {
  title: "Pricing and Access | Career Command Center",
  description:
    "See what is available during the Career Command Center beta. Paid plans are not live and no subscription payment is collected.",
};

const accessOptions = [
  {
    title: "Free resume scan",
    status: "Available now",
    detail: "No account required",
    icon: ScanSearchIcon,
    features: [
      "Compare one resume with one job description",
      "Review explainable match and evidence findings",
      "Anonymous inputs are not saved after the request",
    ],
    action: { label: "Scan a resume", href: "/scan" },
  },
  {
    title: "Account workspace",
    status: "Beta access",
    detail: "Account required",
    icon: UserRoundCheckIcon,
    features: [
      "Keep resume sources and Career Profile evidence together",
      "Generate, preview, edit, and export tailored drafts",
      "Reopen saved work from your dashboard",
    ],
    action: { label: "Create an account", href: "/signup" },
  },
  {
    title: "Paid plans",
    status: "Not live",
    detail: "No checkout or subscription charge",
    icon: LockKeyholeIcon,
    features: [
      "No payment is collected during the current beta",
      "Future limits and prices will be published before checkout",
      "You will choose whether to upgrade when billing is available",
    ],
    action: null,
  },
] as const;

const faqs = [
  {
    question: "Are paid plans active?",
    answer:
      "No. Paid plans are not live yet, and Career Command Center does not currently collect subscription payments.",
  },
  {
    question: "What can I use without an account?",
    answer:
      "The public resume scan compares one resume with one job description. Anonymous inputs remain request-scoped and are not saved after the scan.",
  },
  {
    question: "What does an account add during beta?",
    answer:
      "An account gives you the connected workspace for resume sources, Career Profile evidence, generation, editing, saved drafts, and export.",
  },
  {
    question: "Will pricing change?",
    answer:
      "It may. Any future paid plan will show its current price, limits, and billing terms before you are asked to pay.",
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-[#F7F9FB]">
      <div className="mx-auto max-w-[1200px] px-6 py-14 md:py-20">
        <header className="mx-auto max-w-3xl text-center">
          <p className="font-mono text-[12px] font-semibold uppercase tracking-[0.08em] text-secondary">
            Current beta access
          </p>
          <h1 className="mt-3 text-[38px] font-semibold leading-[1.12] text-primary md:text-[50px]">
            Use what is live. Know what is not.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-[18px] leading-relaxed text-on-surface-variant">
            Start with the public scan or create an account for the full
            workspace. Paid plans are not live yet, so there is no checkout or
            subscription charge during this beta.
          </p>
        </header>

        <section
          aria-labelledby="access-heading"
          className="mx-auto mt-12 max-w-5xl"
        >
          <h2 id="access-heading" className="sr-only">
            Available access options
          </h2>
          <div className="grid gap-5 lg:grid-cols-3">
            {accessOptions.map((option) => {
              const Icon = option.icon;
              return (
                <article
                  key={option.title}
                  className="flex min-h-full flex-col rounded-lg border border-outline-variant bg-white p-6 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-4">
                    <span className="grid h-10 w-10 place-items-center rounded-lg bg-surface-container text-primary">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="rounded-full bg-secondary/10 px-3 py-1 text-xs font-semibold text-secondary">
                      {option.status}
                    </span>
                  </div>
                  <h3 className="mt-5 text-xl font-semibold text-primary">
                    {option.title}
                  </h3>
                  <p className="mt-1 text-sm text-on-surface-variant">
                    {option.detail}
                  </p>
                  <ul className="mt-6 flex-1 space-y-3">
                    {option.features.map((feature) => (
                      <li
                        key={feature}
                        className="flex items-start gap-3 text-sm leading-relaxed text-on-surface-variant"
                      >
                        <CheckCircle2Icon
                          className="mt-0.5 h-4 w-4 shrink-0 text-secondary"
                          aria-hidden="true"
                        />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  {option.action ? (
                    <Link
                      href={option.action.href}
                      className="mt-7 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                    >
                      {option.action.label}
                      <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  ) : (
                    <p className="mt-7 rounded-lg border border-outline-variant bg-surface-container px-4 py-3 text-center text-sm font-medium text-on-surface-variant">
                      No payment action available
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        <section className="mx-auto mt-16 max-w-3xl">
          <h2 className="mb-8 text-center text-[28px] font-semibold text-primary">
            Access questions
          </h2>
          <FaqAccordion faqs={faqs} />
        </section>

        <section className="mx-auto mt-16 max-w-4xl border-y border-outline-variant py-10 text-center">
          <h2 className="text-[28px] font-semibold text-primary">
            Start with evidence, not a purchase.
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-on-surface-variant">
            Run the free scan first. Create an account only when you want to
            keep your work and build a tailored resume.
          </p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              href="/scan"
              className="inline-flex items-center justify-center rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              Scan a resume free
            </Link>
            <Link
              href="/signup"
              className="inline-flex items-center justify-center rounded-lg border border-outline-variant px-6 py-3 text-sm font-semibold text-primary transition-colors hover:bg-surface-container"
            >
              Create an account
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
