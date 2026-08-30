import {
  ArrowRightIcon,
  FolderXIcon,
  EyeOffIcon,
  ZapIcon,
  CheckCircleIcon,
  CheckIcon,
} from "lucide-react";
import Link from "next/link";
import FeatureTabs from "@/components/marketing/FeatureTabs";

export const metadata = {
  title: "Career Command Center | Your Career, Command Centered.",
  description:
    "Build an evidence-backed career profile, compare it with a job, and create a tailored resume you control.",
};

const painPoints = [
  {
    icon: FolderXIcon,
    iconBg: "bg-red-50 text-red-600",
    title: "Resume Chaos",
    body: "Stop managing dozens of 'Final_v2_edit' files. Maintain one source of truth and export what you need.",
  },
  {
    icon: EyeOffIcon,
    iconBg: "bg-[#131B2E]/10 text-[#131B2E]",
    title: "Unclear Job Fit",
    body: "Compare a resume with the job description, review matched language and missing evidence, then decide what to improve.",
  },
  {
    icon: ZapIcon,
    iconBg: "bg-amber-50 text-amber-600",
    title: "Repetitive Rewriting",
    body: "Create a role-specific draft from your source resume and verified career profile, then review every change before export.",
  },
];

const steps = [
  {
    number: "1",
    title: "Add your resume",
    body: "Upload or paste an existing resume, or use the facts saved in your Career Profile.",
  },
  {
    number: "2",
    title: "Paste job description",
    body: "Paste the job text. The scan identifies role language and compares it with evidence in your resume.",
  },
  {
    number: "3",
    title: "Review, edit, and export",
    body: "Preview the generated resume, edit it in the workspace, verify every claim, and export a PDF.",
  },
];

// Product commitments, stated by us — not testimonials. This product's core
// rule is zero fabrication; its marketing cannot carry invented customer
// quotes. Replace with real, permissioned testimonials when they exist.
const commitments = [
  {
    quote:
      "Generation is constrained by the resume and career evidence you provide. You review and approve the final claims.",
    name: "Evidence first",
    role: "Generation standard",
  },
  {
    quote:
      "Each draft uses the target job description to select relevant language and organize the resume for the role.",
    name: "Tailored, not templated",
    role: "Our generation rule",
  },
  {
    quote:
      "You stay in control: preview everything, edit anything, and approve every claim before a single page leaves the app.",
    name: "You have the final word",
    role: "Our control rule",
  },
];

const comparisonRows = [
  {
    feature: "Starting point",
    manual: "Separate files and notes",
    ccc: "Saved resume sources and Career Profile",
  },
  {
    feature: "Job comparison",
    manual: "Manual keyword review",
    ccc: "Explainable resume-to-job scan",
  },
  {
    feature: "Draft control",
    manual: "Copy and rewrite documents",
    ccc: "Preview, edit, and export workflow",
  },
  {
    feature: "Final decision",
    manual: "Candidate reviews the resume",
    ccc: "Candidate still reviews every claim",
  },
  {
    feature: "Outcome",
    manual: "Not guaranteed",
    ccc: "Not guaranteed",
  },
];

export default function MarketingHomePage() {
  return (
    <div className="bg-[#F7F9FB]">
      {/* Hero Section — 2-col */}
      <section className="max-w-[1200px] mx-auto px-6 py-16 md:py-24 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
        <div className="space-y-6">
          {/* Badge */}
          <div className="inline-flex items-center gap-1.5 bg-[#FFF3CD] text-[#785a1a] border border-[#e9c176]/40 px-3 py-1 rounded-full">
            <CheckCircleIcon className="w-3.5 h-3.5" />
            <span className="font-mono text-[12px] font-medium tracking-[0.05em] uppercase">
              Now Open
            </span>
          </div>

          {/* Headline */}
          <h1 className="text-[48px] md:text-[56px] font-semibold text-primary leading-[1.1] tracking-[-0.02em]">
            Your Career,
            <br />
            Command Centered.
          </h1>

          {/* Subheadline */}
          <p className="text-[18px] text-on-surface-variant leading-relaxed max-w-lg">
            Turn your work history into an evidence-backed career profile,
            compare it with a target job, and build a resume you control.
          </p>

          {/* CTA row */}
          <div className="flex flex-col sm:flex-row items-start gap-4 pt-2">
            <a
              href="/scan"
              className="inline-flex items-center px-8 py-3.5 bg-primary text-white rounded-lg text-sm font-bold hover:opacity-90 transition-all shadow-sm"
            >
              Scan your resume free
            </a>
            <div className="flex items-center gap-2 text-on-surface-variant text-sm self-center">
              <CheckIcon className="w-4 h-4" />
              <span>No credit card required.</span>
            </div>
          </div>

          {/* Stat card */}
          <div className="mt-4 inline-flex items-center gap-4 bg-white border border-outline-variant rounded-xl px-5 py-4 shadow-sm">
            <div>
              <p className="text-[28px] font-bold text-primary leading-none">
                11 states
              </p>
              <p className="text-xs text-on-surface-variant mt-1">
                make pipeline progress inspectable
              </p>
            </div>
            <div className="w-px h-10 bg-outline-variant" />
            <div>
              <p className="text-[28px] font-bold text-secondary leading-none">
                Review
              </p>
              <p className="text-xs text-on-surface-variant mt-1">
                required before every final export
              </p>
            </div>
          </div>
        </div>

        {/* Right — UI mockup */}
        <div className="relative group">
          <div className="absolute -inset-4 bg-primary/5 rounded-2xl blur-2xl group-hover:bg-primary/10 transition-all duration-700" />
          <div className="relative rounded-2xl overflow-hidden border border-outline-variant shadow-xl bg-primary-container p-6">
            {/* Mock dashboard */}
            <div className="bg-[#F7F9FB] rounded-xl overflow-hidden shadow-inner">
              <div className="bg-white px-5 py-3 border-b border-outline-variant flex items-center justify-between">
                <span className="text-sm font-semibold text-primary">
                  Resume Editor
                </span>
                <span className="font-mono text-[11px] tracking-[0.05em] uppercase text-secondary">
                  AI Active
                </span>
              </div>
              <div className="p-5 space-y-3">
                {[85, 65, 75, 50, 90, 40].map((w, i) => (
                  <div
                    key={i}
                    className={`h-2.5 rounded-full ${i === 2 ? "bg-secondary" : "bg-outline-variant"}`}
                    style={{ width: `${w}%` }}
                  />
                ))}
                <div className="mt-4 pt-4 border-t border-outline-variant flex items-center justify-between">
                  <span className="text-xs text-on-surface-variant">
                    Resume-to-job scan
                  </span>
                  <span className="text-sm font-bold text-secondary">
                    Calculated from your inputs
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pain Points Section */}
      <section className="py-16 bg-surface-container-low border-y border-outline-variant">
        <div className="max-w-[1200px] mx-auto px-6">
          <h2 className="text-[32px] font-semibold text-primary text-center mb-12 leading-tight tracking-[-0.01em]">
            Applying shouldn&apos;t be a full-time job.
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {painPoints.map((point) => {
              const Icon = point.icon;
              return (
                <div
                  key={point.title}
                  className="bg-white p-6 rounded-xl border border-outline-variant shadow-sm space-y-4 hover:shadow transition-shadow"
                >
                  <div
                    className={`w-12 h-12 rounded-lg ${point.iconBg} flex items-center justify-center`}
                  >
                    <Icon className="w-6 h-6" />
                  </div>
                  <h3 className="text-[20px] font-semibold text-primary">
                    {point.title}
                  </h3>
                  <p className="text-sm text-on-surface-variant leading-relaxed">
                    {point.body}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-16 max-w-[1200px] mx-auto px-6" id="how-it-works">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-5">
            <h2 className="text-[48px] font-semibold text-primary leading-[1.1] tracking-[-0.02em]">
              From history
              <br />
              to{" "}
              <em className="italic">hire</em>.
            </h2>
            <p className="text-[18px] text-on-surface-variant leading-relaxed">
              A streamlined three-step workflow designed to take you from a
              messy work history to a reviewable, professional application.
            </p>
            <div className="pt-4">
              <a
                href="/signup"
                className="inline-flex items-center px-6 py-2.5 bg-primary text-white rounded-lg text-sm font-semibold hover:opacity-90 transition-all shadow-sm"
              >
                Explore the Workflow
              </a>
            </div>
          </div>

          <div className="space-y-3">
            {steps.map((step) => (
              <div
                key={step.number}
                className="flex items-start gap-5 p-5 rounded-xl hover:bg-white transition-colors border border-transparent hover:border-outline-variant"
              >
                <div className="shrink-0 w-12 h-12 rounded-full border-2 border-primary flex items-center justify-center text-primary font-semibold text-lg">
                  {step.number}
                </div>
                <div>
                  <h4 className="text-[18px] font-semibold text-primary mb-1">
                    {step.title}
                  </h4>
                  <p className="text-sm text-on-surface-variant leading-relaxed">
                    {step.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Feature Showcase — dark card with tabs (client component) */}
      <section className="py-16" id="features">
        <div className="max-w-[1200px] mx-auto px-6">
          <FeatureTabs />
        </div>
      </section>

      {/* Pricing summary — the detailed route explains current beta access. */}
      <section
        className="scroll-mt-20 border-y border-outline-variant bg-white py-16"
        id="pricing"
      >
        <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-10 px-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div className="max-w-xl">
            <p className="font-mono text-[12px] font-semibold uppercase tracking-[0.08em] text-secondary">
              Beta access
            </p>
            <h2 className="mt-3 text-[36px] font-semibold leading-[1.12] text-primary md:text-[44px]">
              Start with the scan. Build when you are ready.
            </h2>
            <p className="mt-5 text-[17px] leading-relaxed text-on-surface-variant">
              Check one resume without an account, then create a workspace when
              you want to generate, save, edit, and export a tailored draft.
              Paid plans are not live yet, and we do not collect subscription
              payments during this beta.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/pricing"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              >
                View full pricing
                <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link
                href="/scan"
                className="inline-flex items-center justify-center rounded-lg border border-outline-variant px-6 py-3 text-sm font-semibold text-primary transition-colors hover:bg-surface-container"
              >
                Scan a resume free
              </Link>
            </div>
          </div>

          <div className="divide-y divide-outline-variant border-y border-outline-variant">
            <div className="grid gap-2 py-5 sm:grid-cols-[10rem_1fr] sm:gap-6">
              <h3 className="font-semibold text-primary">Public scan</h3>
              <p className="text-sm leading-relaxed text-on-surface-variant">
                No account required. Resume and job-description inputs are not
                saved after the anonymous scan request.
              </p>
            </div>
            <div className="grid gap-2 py-5 sm:grid-cols-[10rem_1fr] sm:gap-6">
              <h3 className="font-semibold text-primary">Account workspace</h3>
              <p className="text-sm leading-relaxed text-on-surface-variant">
                Sign in to keep resume sources, Career Profile evidence,
                tailored drafts, edits, and exports together.
              </p>
            </div>
            <div className="grid gap-2 py-5 sm:grid-cols-[10rem_1fr] sm:gap-6">
              <h3 className="font-semibold text-primary">Paid plans</h3>
              <p className="text-sm leading-relaxed text-on-surface-variant">
                Not active during beta. Any future price, limit, and billing
                term will be shown before payment is enabled.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Product commitments */}
      <section className="py-16 max-w-[1200px] mx-auto px-6">
        <h2 className="text-[32px] font-semibold text-primary text-center mb-12 tracking-[-0.01em]">
          What we promise every user.
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {commitments.map((t, i) => (
            <div
              key={i}
              className="bg-white p-6 rounded-xl border border-outline-variant shadow-sm space-y-4"
            >
              <p className="text-sm text-on-surface-variant italic leading-relaxed">
                &ldquo;{t.quote}&rdquo;
              </p>
              <div className="pt-3 border-t border-outline-variant">
                <p className="text-sm font-semibold text-primary">{t.name}</p>
                <p className="font-mono text-[11px] tracking-[0.05em] uppercase text-on-surface-variant mt-0.5">
                  {t.role}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Comparison Table */}
      <section className="py-16 bg-surface-container-low border-y border-outline-variant">
        <div className="max-w-[1200px] mx-auto px-6">
          <h2 className="text-[32px] font-semibold text-primary text-center mb-12 tracking-[-0.01em]">
            How we compare.
          </h2>
          <div className="overflow-x-auto rounded-xl border border-outline-variant bg-white shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-outline-variant bg-[#F7F9FB]">
                  <th className="p-5 font-mono text-[11px] tracking-[0.05em] uppercase text-on-surface-variant">
                    Feature
                  </th>
                  <th className="p-5 font-mono text-[11px] tracking-[0.05em] uppercase text-on-surface-variant">
                    Manual Process
                  </th>
                  <th className="p-5 font-mono text-[11px] tracking-[0.05em] uppercase text-secondary font-bold">
                    Command Center
                  </th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y divide-outline-variant">
                {comparisonRows.map((row) => (
                  <tr
                    key={row.feature}
                    className="hover:bg-surface-container transition-colors"
                  >
                    <td className="p-5 font-semibold text-primary">
                      {row.feature}
                    </td>
                    <td className="p-5 text-on-surface-variant">{row.manual}</td>
                    <td className="p-5 font-semibold text-primary">
                      {row.ccc}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Bottom CTA — full width */}
      <section className="py-16">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="bg-primary-container text-white rounded-3xl p-12 text-center space-y-6 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-10">
              <div className="absolute -top-1/2 -left-1/4 w-[150%] h-[150%] border border-white/30 rounded-full" />
              <div className="absolute -top-1/3 -left-1/3 w-[150%] h-[150%] border border-white/30 rounded-full" />
            </div>

            <div className="relative z-10 space-y-5">
              <h2 className="text-[40px] md:text-[48px] font-semibold leading-[1.1] tracking-[-0.02em]">
                Ready to command your career?
              </h2>
              <p className="text-lg text-white/80 max-w-2xl mx-auto">
                Turn your verified experience into tailored, truthful resumes for every role you target.
                Start building your career memory today.
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4 max-w-lg mx-auto">
                <a
                  href="/signup"
                  className="w-full sm:w-auto whitespace-nowrap bg-[#FFF3CD] text-[#785a1a] px-8 py-3.5 rounded-lg text-sm font-bold hover:brightness-105 transition-all text-center"
                >
                  Get Started Free
                </a>
                <a
                  href="/signin"
                  className="w-full sm:w-auto whitespace-nowrap bg-white/10 border border-white/20 text-white px-8 py-3.5 rounded-lg text-sm font-medium hover:bg-white/20 transition-all text-center"
                >
                  Sign In
                </a>
              </div>
              <p className="font-mono text-[11px] tracking-[0.05em] uppercase text-white/50">
                Create an account to start. No credit card required.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
