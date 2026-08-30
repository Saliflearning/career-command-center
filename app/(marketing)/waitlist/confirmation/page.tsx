import { CheckCircleIcon, MailIcon } from "lucide-react";
import CopyLinkButton from "@/components/marketing/CopyLinkButton";

export const metadata = {
  title: "You're on the list! | Career Command Center",
  description: "You've successfully joined the Career Command Center waitlist.",
};

export default async function WaitlistConfirmationPage({
  searchParams,
}: {
  searchParams?: Promise<{ position?: string }>;
}) {
  // Real position comes from the signup response via the redirect query.
  // If absent, show honest copy with no number — never a fabricated rank.
  const resolvedSearchParams = await searchParams;
  const parsed = Number.parseInt(resolvedSearchParams?.position ?? "", 10);
  const position = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  const shareLink = "https://career-command-center-hazel.vercel.app/waitlist";

  return (
    <div className="bg-[#F7F9FB]">
      {/* Hero Section */}
      <section className="max-w-[1200px] mx-auto px-6 pt-16 pb-8 text-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-1.5 bg-[#FFF3CD] text-[#785a1a] border border-[#e9c176]/40 px-3 py-1 rounded-full mb-6 shadow-sm">
          <CheckCircleIcon className="w-3.5 h-3.5" />
          <span className="font-mono text-[12px] font-medium tracking-[0.05em] uppercase">
            Registration Confirmed
          </span>
        </div>

        <h1 className="text-[40px] md:text-[56px] font-semibold text-primary leading-[1.1] tracking-[-0.02em] mb-4">
          You&apos;re on the list.
        </h1>
        <p className="text-[18px] text-on-surface-variant leading-relaxed max-w-2xl mx-auto mb-12">
          Your registration was received. We&apos;ll use the email you provided
          for access updates.
        </p>

        {/* Laptop / Device frame with product screenshot */}
        <div className="relative max-w-[900px] mx-auto mb-16">
          <div className="relative rounded-t-2xl bg-primary p-2 md:p-4 shadow-2xl overflow-hidden">
            {/* Top bar chrome */}
            <div className="flex items-center gap-1.5 mb-2 px-2">
              <div className="w-3 h-3 rounded-full bg-white/20" />
              <div className="w-3 h-3 rounded-full bg-white/20" />
              <div className="w-3 h-3 rounded-full bg-white/20" />
            </div>
            {/* Mockup screen */}
            <div className="bg-[#F7F9FB] rounded-lg overflow-hidden border border-outline-variant aspect-video flex flex-col">
              {/* Navbar mock */}
              <div className="bg-white border-b border-outline-variant px-4 py-2.5 flex items-center justify-between shrink-0">
                <span className="text-xs font-semibold text-primary">
                  Career Command Center
                </span>
                <div className="flex gap-1.5">
                  {[50, 35, 45].map((w, i) => (
                    <div
                      key={i}
                      className="h-1.5 bg-outline-variant rounded-full"
                      style={{ width: `${w}px` }}
                    />
                  ))}
                </div>
              </div>
              {/* Content mock */}
              <div className="flex flex-1 overflow-hidden">
                {/* Sidebar */}
                <div className="w-36 bg-primary-container p-3 shrink-0">
                  {["Experience", "Skills", "Projects", "Education"].map(
                    (item, i) => (
                      <div
                        key={item}
                        className={`px-2 py-1.5 rounded text-xs mb-1 ${i === 0 ? "bg-white/15 text-white font-medium" : "text-white/50"}`}
                      >
                        {item}
                      </div>
                    )
                  )}
                </div>
                {/* Document */}
                <div className="flex-1 bg-white p-4 overflow-hidden">
                  <div className="space-y-2">
                    <div className="h-3 bg-outline-variant/60 rounded w-1/3" />
                    <div className="h-2 bg-outline-variant/40 rounded w-1/2" />
                    <div className="mt-4 space-y-1.5">
                      {[85, 70, 90, 60, 80].map((w, i) => (
                        <div
                          key={i}
                          className={`h-1.5 rounded-full ${i === 2 ? "bg-secondary" : "bg-outline-variant/50"}`}
                          style={{ width: `${w}%` }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          {/* Laptop base */}
          <div className="h-4 md:h-6 bg-primary-container rounded-b-3xl w-[105%] -ml-[2.5%] relative z-10 shadow-lg" />
        </div>
      </section>

      {/* Stats & Referral Section */}
      <section className="py-16 bg-surface-container-low border-y border-outline-variant">
        <div className="max-w-[1200px] mx-auto px-6 grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Waitlist position card */}
          <div className="bg-white p-10 rounded-xl border border-outline-variant shadow-sm flex flex-col items-center justify-center text-center">
            <p className="font-mono text-[12px] tracking-[0.05em] uppercase text-on-surface-variant mb-2">
              Your Current Rank
            </p>
            <h2 className="text-[72px] font-bold text-primary leading-none mb-2">
              {position ? `#${position}` : "Saved"}
            </h2>
            <p className="text-sm text-on-surface-variant mb-8">
              {position
                ? "Your place in line is locked in."
                : "You're on the list — your spot is locked in."}
            </p>
            <p className="font-mono text-[12px] tracking-[0.05em] uppercase text-amber-600 font-semibold">
              Registration recorded
            </p>
          </div>

          {/* Referral card */}
          <div className="bg-white p-8 rounded-xl border border-outline-variant shadow-sm">
            <h3 className="text-[22px] font-semibold text-primary mb-3">
              Know someone job hunting?
            </h3>
            <p className="text-sm text-on-surface-variant leading-relaxed mb-6">
              Share the waitlist with colleagues who could use truthful,
              tailored resumes too.
            </p>

            <div className="space-y-4">
              <label className="font-mono text-[12px] tracking-[0.05em] uppercase text-on-surface-variant block">
                Waitlist link
              </label>

              <CopyLinkButton link={shareLink} />

              {/* Social share */}
              <div className="flex items-center gap-4 pt-2">
                <span className="font-mono text-[11px] tracking-[0.05em] uppercase text-on-surface-variant">
                  Share on:
                </span>
                <div className="flex gap-2">
                  {/* X/Twitter */}
                  <button
                    aria-label="Share on X"
                    className="w-10 h-10 rounded-full border border-outline-variant flex items-center justify-center hover:bg-surface-container transition-colors group"
                  >
                    <svg
                      className="w-4 h-4 fill-on-surface-variant group-hover:fill-primary"
                      viewBox="0 0 24 24"
                    >
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                    </svg>
                  </button>

                  {/* LinkedIn */}
                  <button
                    aria-label="Share on LinkedIn"
                    className="w-10 h-10 rounded-full border border-outline-variant flex items-center justify-center hover:bg-surface-container transition-colors group"
                  >
                    <svg
                      className="w-4 h-4 fill-on-surface-variant group-hover:fill-primary"
                      viewBox="0 0 24 24"
                    >
                      <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3V10h-2.8v8.5h2.8v-4.69c0-.57.28-1.14.93-1.14.63 0 .89.54.89 1.14v4.69h2.76M6.25 10v8.5h2.8V10h-2.8M7.65 6.35a1.5 1.5 0 0 0-1.5 1.5 1.5 1.5 0 0 0 1.5 1.5 1.5 1.5 0 0 0 1.5-1.5 1.5 1.5 0 0 0-1.5-1.5z" />
                    </svg>
                  </button>

                  {/* Email */}
                  <button
                    aria-label="Share via email"
                    className="w-10 h-10 rounded-full border border-outline-variant flex items-center justify-center hover:bg-surface-container transition-colors group"
                  >
                    <MailIcon className="w-4 h-4 text-on-surface-variant group-hover:text-primary" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
