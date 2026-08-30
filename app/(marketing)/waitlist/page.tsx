import { FileTextIcon, ScanSearchIcon, SquarePenIcon } from "lucide-react";

export const metadata = {
  title: "Get Started | Career Command Center",
  description:
    "Create an account to build a Career Profile, scan a resume against a job, and review a tailored draft.",
};

export default function WaitlistPage() {
  return (
    <div className="bg-[#F7F9FB]">
      {/* Hero Section */}
      <section className="max-w-[1200px] mx-auto px-6 pt-16 md:pt-24 pb-16 text-center">
        <div className="inline-flex items-center gap-1.5 bg-[#FFF3CD] text-[#785a1a] border border-[#e9c176]/40 px-3 py-1 rounded-full mb-6 shadow-sm">
          <FileTextIcon className="w-3.5 h-3.5" />
          <span className="font-mono text-[12px] font-medium tracking-[0.05em] uppercase">
            Product access
          </span>
        </div>

        {/* Headline */}
        <h1 className="text-[48px] md:text-[64px] font-semibold text-primary leading-[1.1] tracking-[-0.02em] max-w-4xl mx-auto mb-5">
          Build your career profile.{" "}
          <br className="hidden md:block" />
          Stop rewriting your{" "}
          <em className="font-serif italic not-italic" style={{ fontStyle: "italic" }}>
            resume
          </em>
          .
        </h1>

        {/* Subheadline */}
        <p className="text-[18px] text-on-surface-variant leading-relaxed max-w-2xl mx-auto mb-10">
          Keep reusable career evidence, compare a resume with a target job,
          and review every generated claim before export.
        </p>

        <a
          href="/signup"
          className="inline-flex items-center rounded-lg bg-primary px-7 py-3 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
        >
          Create an account
        </a>
      </section>

      {/* Trust Strip */}
      <section className="border-y border-outline-variant bg-white/60 backdrop-blur-md">
        <div className="max-w-[1200px] mx-auto px-6 py-6 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center text-primary shrink-0">
              <FileTextIcon className="w-5 h-5" />
            </div>
            <div className="text-left">
              <p className="font-mono text-[12px] tracking-[0.05em] uppercase text-outline mb-0.5">
                Source
              </p>
              <p className="text-sm font-semibold text-primary">
                Upload or paste a resume
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center text-primary shrink-0">
              <ScanSearchIcon className="w-5 h-5" />
            </div>
            <div className="text-left">
              <p className="font-mono text-[12px] tracking-[0.05em] uppercase text-outline mb-0.5">
                Compare
              </p>
              <p className="text-sm font-semibold text-primary">Scan against a job</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center text-primary shrink-0">
              <SquarePenIcon className="w-5 h-5" />
            </div>
            <div className="text-left">
              <p className="font-mono text-[12px] tracking-[0.05em] uppercase text-outline mb-0.5">
                Control
              </p>
              <p className="text-sm font-semibold text-primary">
                Preview and edit before export
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Product Preview Section */}
      <section className="max-w-[1200px] mx-auto px-6 py-16">
        <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-outline-variant bg-primary-container">
          {/* Gradient fade overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#F7F9FB] via-transparent to-transparent z-10 opacity-70 pointer-events-none" />

          {/* Mock UI */}
          <div className="p-6 md:p-10 flex flex-col md:flex-row gap-6 min-h-[520px]">
            {/* Sidebar */}
            <aside className="w-full md:w-56 flex flex-col gap-2 shrink-0">
              <div className="px-4 py-3 text-white font-semibold text-base mb-4">
                Career Memory
              </div>
              <div className="flex items-center gap-3 px-4 py-3 bg-white/10 rounded-lg text-white font-medium text-sm">
                <FileTextIcon className="w-4 h-4" />
                <span>Experience</span>
              </div>
              <div className="flex items-center gap-3 px-4 py-3 text-white/50 text-sm rounded-lg">
                <span className="w-4 h-4 rounded-sm border border-white/30 flex-shrink-0" />
                <span>Skills</span>
              </div>
              <div className="flex items-center gap-3 px-4 py-3 text-white/50 text-sm rounded-lg">
                <span className="w-4 h-4 rounded-sm border border-white/30 flex-shrink-0" />
                <span>Certifications</span>
              </div>
            </aside>

            {/* Content area */}
            <div className="flex-1 bg-[#F7F9FB] rounded-xl p-6 md:p-8 relative overflow-hidden">
              <div className="flex justify-between items-center mb-8 border-b border-outline-variant pb-4">
                <h2 className="text-base font-semibold text-primary">
                  Resume Editor —{" "}
                  <span className="text-secondary">Live AI Edit</span>
                </h2>
                <div className="w-8 h-8 rounded-full bg-surface-container" />
              </div>

              <div className="bg-white max-w-2xl mx-auto shadow-sm rounded-lg p-8 border border-outline-variant/30">
                <div className="mb-6">
                  <h3 className="text-lg font-bold text-primary">
                    Karen Kline
                  </h3>
                  <p className="text-sm text-on-surface-variant">
                    Product Manager | San Francisco, CA
                  </p>
                </div>

                <div className="space-y-5">
                  <h4 className="font-semibold text-sm border-b border-outline-variant pb-2 text-primary">
                    Professional Experience
                  </h4>
                  <div>
                    <p className="text-sm font-bold text-on-surface">
                      Lead Product Designer • TechFlow Inc.
                    </p>
                    <p className="text-xs text-on-surface-variant italic mb-3">
                      Jan 2021 — Present
                    </p>
                    <ul className="list-disc ml-5 space-y-2 text-sm text-on-surface-variant">
                      <li className="leading-relaxed">
                        Orchestrated the redesign of the core dashboard,
                        increasing user retention by 24% over 6 months.
                      </li>
                      <li className="bg-blue-50 border-l-4 border-secondary px-3 py-2 rounded relative leading-relaxed">
                        Led cross-functional teams to integrate generative AI
                        tools into the legacy editor.
                        <span className="absolute -right-2 md:-right-10 top-0 bg-primary text-white text-[9px] px-2 py-0.5 rounded shadow-lg animate-pulse whitespace-nowrap">
                          AI Optimizing…
                        </span>
                      </li>
                      <li className="leading-relaxed">
                        Mentored 4 junior designers and established the
                        company&apos;s first internal design system.
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="max-w-[1200px] mx-auto px-6 py-16">
        <div className="bg-primary-container text-white rounded-3xl p-12 md:p-20 text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-[100px] -mr-32 -mt-32" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/5 rounded-full blur-[100px] -ml-32 -mb-32" />
          <div className="relative z-10">
            <h2 className="text-[40px] md:text-[48px] font-semibold leading-[1.1] tracking-[-0.02em] mb-4">
              Ready to master your career path?
            </h2>
            <p className="text-lg text-white/80 max-w-xl mx-auto mb-10">
              Create an account to build your Career Profile and start a
              resume-to-job workspace.
            </p>
            <a
              href="/signup"
              className="inline-flex items-center px-8 py-4 bg-[#FFF3CD] text-[#785a1a] rounded-xl text-sm font-bold shadow-lg hover:brightness-105 active:scale-95 transition-all"
            >
              Create an account
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
