import Link from "next/link";
import { type LucideIcon } from "lucide-react";
import { clsx } from "clsx";

interface EmptyStateProps {
  icon: LucideIcon;
  headline: string;
  body: string;
  ctaLabel?: string;
  ctaHref?: string;
  secondaryLabel?: string;
  secondaryHref?: string;
  className?: string;
}

export default function EmptyState({
  icon: Icon,
  headline,
  body,
  ctaLabel,
  ctaHref = "#",
  secondaryLabel,
  secondaryHref = "#",
  className,
}: EmptyStateProps) {
  return (
    <div
      className={clsx(
        "bg-surface-lowest rounded-xl p-10 border border-outline-variant shadow-sm flex flex-col items-center text-center",
        className
      )}
    >
      <div className="w-16 h-16 bg-surface-container rounded-xl flex items-center justify-center mb-6">
        <Icon size={32} className="text-on-surface" strokeWidth={1.5} />
      </div>
      <h3 className="text-xl font-semibold text-on-surface mb-3">{headline}</h3>
      <p className="text-sm text-on-surface-variant max-w-sm mb-8 leading-relaxed">
        {body}
      </p>
      {ctaLabel && (
        <Link
          href={ctaHref}
          className="px-6 py-3 bg-secondary text-white font-semibold rounded-lg hover:opacity-90 transition-opacity text-sm"
        >
          {ctaLabel}
        </Link>
      )}
      {secondaryLabel && (
        <Link
          href={secondaryHref}
          className="mt-3 text-sm text-on-surface-variant hover:text-on-surface underline underline-offset-4 transition-colors"
        >
          {secondaryLabel}
        </Link>
      )}
    </div>
  );
}
