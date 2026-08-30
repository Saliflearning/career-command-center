import { ReactNode } from "react";

interface HeroSectionProps {
  badge?: string;
  headline: ReactNode;
  subheadline: string;
  ctaLabel?: string;
  ctaHref?: string;
  showEmailInput?: boolean;
  emailPlaceholder?: string;
  emailCtaLabel?: string;
  children?: ReactNode;
}

export default function HeroSection({
  badge,
  headline,
  subheadline,
  ctaLabel,
  ctaHref = "/waitlist",
  showEmailInput = false,
  emailPlaceholder = "Enter your work email",
  emailCtaLabel = "Join the waitlist",
  children,
}: HeroSectionProps) {
  return (
    <section className="max-w-[1200px] mx-auto px-6 pt-16 md:pt-24 pb-16 text-center">
      {badge && (
        <div className="inline-flex items-center gap-1.5 bg-[#FFF3CD] text-[#785a1a] px-3 py-1 rounded-full mb-6 border border-[#e9c176]/40 shadow-sm">
          <span className="font-mono text-[12px] font-medium tracking-[0.05em] uppercase">
            {badge}
          </span>
        </div>
      )}

      <h1 className="text-[48px] md:text-[64px] font-semibold text-primary leading-[1.1] tracking-[-0.02em] max-w-4xl mx-auto mb-5">
        {headline}
      </h1>

      <p className="text-[18px] text-on-surface-variant leading-relaxed max-w-2xl mx-auto mb-10">
        {subheadline}
      </p>

      {showEmailInput && (
        <div className="max-w-md mx-auto mb-6">
          <form className="flex flex-col sm:flex-row gap-2 bg-white p-1.5 rounded-xl shadow-lg border border-outline-variant">
            <input
              type="email"
              required
              placeholder={emailPlaceholder}
              className="flex-1 bg-transparent border-none focus:outline-none focus:ring-0 px-4 py-2 text-on-surface text-sm"
            />
            <button
              type="submit"
              className="bg-primary text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 transition-all shadow-sm whitespace-nowrap"
            >
              {emailCtaLabel}
            </button>
          </form>
        </div>
      )}

      {!showEmailInput && ctaLabel && (
        <a
          href={ctaHref}
          className="inline-flex items-center px-8 py-3 bg-secondary text-white rounded-lg text-sm font-semibold hover:opacity-90 transition-all shadow-sm"
        >
          {ctaLabel}
        </a>
      )}

      {children}
    </section>
  );
}
