"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard,
  FilePlus,
  Brain,
  Briefcase,
  Settings,
  LogOut,
  Menu,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  LogIn,
  Zap,
} from "lucide-react";
import { clsx } from "clsx";

const navItems = [
  { label: "Home", href: "/dashboard", icon: LayoutDashboard },
  { label: "New Resume", href: "/upload", icon: FilePlus },
  { label: "Quick Resume", href: "/quick-resume", icon: Zap },
  { label: "Career Profile", href: "/memory", icon: Brain },
  { label: "Applications", href: "/tracker", icon: Briefcase },
  { label: "Settings", href: "/settings", icon: Settings },
];

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

type AuthState = "loading" | "authenticated" | "unauthenticated";

export default function Sidebar({ collapsed, onToggleCollapsed }: SidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [authState, setAuthState] = useState<AuthState>("loading");
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const mobileDrawerRef = useRef<HTMLElement>(null);

  const closeMobileNavigation = useCallback((restoreFocus = false) => {
    setMobileOpen(false);
    if (restoreFocus) {
      window.requestAnimationFrame(() => menuButtonRef.current?.focus());
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      try {
        const res = await fetch("/api/auth/session", { cache: "no-store" });
        const session = (await res.json()) as { user?: unknown } | null;
        if (!cancelled) {
          setAuthState(session?.user ? "authenticated" : "unauthenticated");
        }
      } catch {
        if (!cancelled) setAuthState("unauthenticated");
      }
    }

    loadSession();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeMobileNavigation(true);
        return;
      }

      if (event.key !== "Tab" || !mobileDrawerRef.current) return;

      const focusable = Array.from(
        mobileDrawerRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    window.requestAnimationFrame(() => closeButtonRef.current?.focus());

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeMobileNavigation, mobileOpen]);

  const renderContent = (isCollapsed: boolean) => (
    <>
      <div
        className={clsx(
          "mb-8 flex items-start",
          isCollapsed ? "flex-col items-center gap-2 px-2" : "justify-between gap-3 px-4"
        )}
      >
        <div className="relative">
          <Link
            href="/dashboard"
            onClick={() => setMobileOpen(false)}
            className="group flex h-10 w-10 items-center justify-center rounded-lg transition-colors hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/35"
            title="Career Command Center"
            aria-label="Career Command Center home"
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/12 bg-white/[0.08] text-[11px] font-bold tracking-tight text-white shadow-sm">
              3C
            </span>
            <span className="sr-only">Career Command Center</span>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-11 top-1/2 z-50 w-max -translate-y-1/2 rounded-lg border border-white/10 bg-[#151918] px-3 py-2 text-left text-white opacity-0 shadow-xl transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
            >
              <span className="block text-sm font-semibold leading-4 tracking-tight">
                Career Command
              </span>
              <span className="block text-[10px] font-medium uppercase leading-3 tracking-[0.2em] text-white/50">
                Center
              </span>
            </span>
          </Link>
        </div>
        {!isCollapsed && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="hidden h-8 w-8 items-center justify-center rounded-lg text-white/45 transition-colors hover:bg-white/10 hover:text-white md:inline-flex"
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
          >
            <PanelLeftClose size={17} />
          </button>
        )}
        {isCollapsed && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="hidden h-8 w-8 items-center justify-center rounded-lg text-white/45 transition-colors hover:bg-white/10 hover:text-white md:inline-flex"
            aria-label="Expand sidebar"
            title="Expand sidebar"
          >
            <PanelLeftOpen size={17} />
          </button>
        )}
      </div>

      <nav className="flex-1 space-y-0.5 px-2">
        {navItems.map(({ label, href, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setMobileOpen(false)}
              title={isCollapsed ? label : undefined}
              className={clsx(
                "flex items-center rounded-lg text-sm transition-colors",
                isCollapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5",
                active
                  ? "bg-white/10 font-semibold text-white"
                  : "text-white/60 hover:bg-white/5 hover:text-white/90"
              )}
            >
              <Icon size={18} className="shrink-0" />
              {!isCollapsed && <span>{label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-white/8 px-2 pt-3">
        {authState === "authenticated" && (
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/" })}
            title={isCollapsed ? "Sign out" : undefined}
            className={clsx(
              "flex items-center rounded-lg text-sm text-white/40 transition-colors hover:text-white/70",
              isCollapsed ? "h-10 w-full justify-center px-0" : "gap-3 px-3 py-2.5"
            )}
          >
            <LogOut size={16} className="shrink-0" />
            {!isCollapsed && <span>Sign out</span>}
          </button>
        )}
        {authState === "unauthenticated" && (
          <Link
            href="/signin"
            onClick={() => setMobileOpen(false)}
            title={isCollapsed ? "Sign in" : undefined}
            className={clsx(
              "flex items-center rounded-lg text-sm text-white/40 transition-colors hover:text-white/70",
              isCollapsed ? "h-10 w-full justify-center px-0" : "gap-3 px-3 py-2.5"
            )}
          >
            <LogIn size={16} className="shrink-0" />
            {!isCollapsed && <span>Sign in</span>}
          </Link>
        )}
      </div>
    </>
  );

  return (
    <>
      <header
        data-testid="mobile-app-bar"
        className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-outline-variant/30 bg-background/95 px-3 backdrop-blur md:hidden"
      >
        <Link
          href="/dashboard"
          className="inline-flex min-w-0 items-center gap-2 rounded-lg py-1 pr-2 text-on-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary/50"
          aria-label="Career Command Center home"
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary text-[11px] font-bold text-white">
            3C
          </span>
          <span className="truncate text-sm font-semibold">Career Command Center</span>
        </Link>
        <button
          ref={menuButtonRef}
          type="button"
          onClick={() => setMobileOpen(true)}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary text-white transition-colors hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary/60 focus-visible:ring-offset-2"
          aria-label="Open menu"
          aria-expanded={mobileOpen}
          aria-controls="mobile-navigation"
        >
          <Menu size={21} />
        </button>
      </header>

      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-50 cursor-default bg-black/45 backdrop-blur-sm md:hidden"
          onClick={() => closeMobileNavigation(true)}
        />
      )}

      <aside
        className={clsx(
          "fixed left-0 top-0 z-40 hidden h-dvh flex-col bg-primary py-5 transition-[width] duration-200 md:flex",
          collapsed ? "w-16" : "w-56"
        )}
      >
        {renderContent(collapsed)}
      </aside>

      {mobileOpen && (
        <aside
          ref={mobileDrawerRef}
          id="mobile-navigation"
          aria-label="Main navigation"
          aria-modal="true"
          role="dialog"
          className="fixed left-0 top-0 z-[51] flex h-dvh w-[min(18rem,calc(100vw-2.5rem))] flex-col bg-primary py-5 shadow-2xl md:hidden"
        >
          <button
            ref={closeButtonRef}
            type="button"
            onClick={() => closeMobileNavigation(true)}
            className="absolute right-3 top-3 inline-flex h-11 w-11 items-center justify-center rounded-lg text-white/60 transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
          {renderContent(false)}
        </aside>
      )}
    </>
  );
}
