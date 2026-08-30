import Link from "next/link";
import { BriefcaseIcon } from "lucide-react";

const footerLinks = {
  Product: [
    { label: "Features", href: "/#features" },
    { label: "Pricing", href: "/#pricing" },
    { label: "How it Works", href: "/#how-it-works" },
  ],
  Account: [
    { label: "Sign In", href: "/signin" },
    { label: "Create Account", href: "/signup" },
    { label: "Dashboard", href: "/dashboard" },
  ],
  Legal: [
    { label: "Privacy Policy", href: "/privacy" },
    { label: "Terms of Service", href: "/terms" },
  ],
};

export default function MarketingFooter() {
  return (
    <footer className="bg-white border-t border-outline-variant">
      <div className="max-w-[1200px] mx-auto px-6 pt-12 pb-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10">
          {/* Brand col */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <BriefcaseIcon className="w-4 h-4 text-white" />
              </div>
              <span className="text-[18px] font-semibold text-primary leading-tight">
                Career Command Center
              </span>
            </Link>
            <p className="text-sm text-on-surface-variant max-w-xs leading-relaxed">
              Executive precision in career management. Build your professional
              legacy with clarity and control.
            </p>
          </div>

          {/* Link columns */}
          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category}>
              <h4 className="font-mono text-[12px] font-medium tracking-[0.05em] uppercase text-primary mb-4">
                {category}
              </h4>
              <ul className="space-y-2">
                {links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      prefetch={link.href === "/dashboard" ? false : undefined}
                      className="text-sm text-on-surface-variant hover:text-primary transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="mt-10 pt-6 border-t border-outline-variant flex flex-col md:flex-row justify-between items-center gap-3">
          <p className="font-mono text-[12px] tracking-[0.05em] text-on-surface-variant">
            &copy; {new Date().getFullYear()} Career Command Center. All rights reserved.
          </p>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-secondary inline-block" />
            <span className="font-mono text-[12px] tracking-[0.05em] text-on-surface-variant">
              PRIVACY AND USER CONTROL
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
