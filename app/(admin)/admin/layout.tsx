"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Users,
  FileText,
  Settings,
  LogOut,
  ShieldCheck,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { clsx } from "clsx";
import { signOut, useSession } from "next-auth/react";

const navItems = [
  { label: "Overview", href: "/admin/overview", icon: LayoutDashboard },
  { label: "Users", href: "/admin/users", icon: Users },
  { label: "Resumes", href: "/admin/resumes", icon: FileText },
  { label: "API Config", href: "/admin/config", icon: Settings },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, status } = useSession();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated") {
      if (pathname !== "/admin/login") {
        router.replace("/admin/login");
      } else {
        setChecking(false);
      }
      return;
    }
    // Authenticated — always allow /admin/login so they can switch accounts
    if (pathname === "/admin/login") {
      setChecking(false);
      return;
    }
    setChecking(false);
  }, [status, router, pathname]);

  // Render login page without the admin shell
  if (pathname === "/admin/login") {
    return <>{children}</>;
  }

  if (status === "loading" || checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Loader2 size={22} className="animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 z-40 flex h-screen w-60 flex-col bg-[#0f172a]">
        {/* Header */}
        <div className="flex items-center gap-2.5 border-b border-white/8 px-5 py-5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-600">
            <ShieldCheck size={15} className="text-white" />
          </div>
          <div>
            <div className="text-sm font-semibold text-white">Admin</div>
            <div className="text-[10px] text-white/35 font-mono uppercase tracking-wider truncate max-w-[140px]">
              {session?.user?.email ?? "Career Command"}
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-0.5 px-3 py-4">
          {navItems.map(({ label, href, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                className={clsx(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                  active
                    ? "bg-white/10 font-medium text-white"
                    : "text-white/55 hover:bg-white/5 hover:text-white/85"
                )}
              >
                <Icon size={16} className="shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="border-t border-white/8 px-3 py-3 space-y-1">
          <Link
            href="/dashboard"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/40 hover:text-white/70 transition-colors"
          >
            <ExternalLink size={15} className="shrink-0" />
            Back to App
          </Link>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/" })}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/40 hover:text-white/70 transition-colors"
          >
            <LogOut size={15} className="shrink-0" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Content area */}
      <div className="ml-60 flex-1 min-h-screen">
        {children}
      </div>
    </div>
  );
}
