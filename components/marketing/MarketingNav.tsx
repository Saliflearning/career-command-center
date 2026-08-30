"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BriefcaseIcon, Menu, X } from "lucide-react";
import {
  getMarketingNavCurrentState,
  marketingNavigationItems,
  marketingSectionIds,
} from "./marketing-navigation-state";

export default function MarketingNav() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeHash, setActiveHash] = useState("");
  const mobileOpenRef = useRef(false);
  const pathname = usePathname();

  useEffect(() => {
    mobileOpenRef.current = false;
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (pathname !== "/") {
      setActiveHash("");
      return;
    }

    let syncFrame = 0;
    let firstNavigationFrame = 0;
    let secondNavigationFrame = 0;
    let navigationReleaseTimer = 0;
    let hashNavigationInProgress = false;

    const getLinkedSection = () => {
      const locationHash = window.location.hash.toLowerCase();
      const sectionId = marketingSectionIds.find(
        (candidate) => locationHash === `#${candidate}`,
      );

      return {
        element: sectionId ? document.getElementById(sectionId) : null,
        hash: sectionId ? `#${sectionId}` : "",
      };
    };

    const syncActiveSection = () => {
      const linkedSection = getLinkedSection();
      if (
        (hashNavigationInProgress || mobileOpenRef.current) &&
        linkedSection.hash
      ) {
        setActiveHash(linkedSection.hash);
        return;
      }

      const navOffset = window.innerWidth >= 768 ? 88 : 76;
      const visibleSection = marketingSectionIds.find((sectionId) => {
        const section = document.getElementById(sectionId);
        if (!section) return false;

        const bounds = section.getBoundingClientRect();
        return bounds.top <= navOffset && bounds.bottom > navOffset;
      });

      if (visibleSection) {
        setActiveHash(`#${visibleSection}`);
        return;
      }

      // Keep the requested section selected while smooth scrolling settles or
      // the mobile menu opens over the page. A visible section at the nav line
      // still wins above when the user manually scrolls to another section.
      if (linkedSection.hash) {
        setActiveHash(linkedSection.hash);
        return;
      }

      setActiveHash("");
    };

    const scheduleSync = () => {
      window.cancelAnimationFrame(syncFrame);
      syncFrame = window.requestAnimationFrame(syncActiveSection);
    };

    const alignLinkedSectionAfterLayout = () => {
      const linkedSection = getLinkedSection();
      if (!linkedSection.element) {
        hashNavigationInProgress = false;
        scheduleSync();
        return;
      }

      hashNavigationInProgress = true;
      setActiveHash(linkedSection.hash);
      window.cancelAnimationFrame(firstNavigationFrame);
      window.cancelAnimationFrame(secondNavigationFrame);
      window.clearTimeout(navigationReleaseTimer);

      // The mobile menu collapses during navigation. Wait for that layout change
      // before aligning the destination so the visible section and marker agree.
      firstNavigationFrame = window.requestAnimationFrame(() => {
        secondNavigationFrame = window.requestAnimationFrame(() => {
          linkedSection.element?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
          navigationReleaseTimer = window.setTimeout(() => {
            hashNavigationInProgress = false;
            scheduleSync();
          }, 1200);
        });
      });
    };

    const syncHashImmediately = () => {
      const linkedSection = getLinkedSection();
      if (linkedSection.hash) {
        alignLinkedSectionAfterLayout();
      } else {
        hashNavigationInProgress = false;
        setActiveHash("");
        scheduleSync();
      }
    };

    syncHashImmediately();
    window.addEventListener("hashchange", syncHashImmediately);
    window.addEventListener("popstate", syncHashImmediately);
    window.addEventListener("scroll", scheduleSync, { passive: true });
    window.addEventListener("resize", scheduleSync);

    return () => {
      window.cancelAnimationFrame(syncFrame);
      window.cancelAnimationFrame(firstNavigationFrame);
      window.cancelAnimationFrame(secondNavigationFrame);
      window.clearTimeout(navigationReleaseTimer);
      window.removeEventListener("hashchange", syncHashImmediately);
      window.removeEventListener("popstate", syncHashImmediately);
      window.removeEventListener("scroll", scheduleSync);
      window.removeEventListener("resize", scheduleSync);
    };
  }, [pathname]);

  const currentState = getMarketingNavCurrentState(pathname, activeHash);

  const handleMobileNavigation = (
    event: MouseEvent<HTMLAnchorElement>,
    item: (typeof marketingNavigationItems)[number],
  ) => {
    if (pathname === "/" && "sectionId" in item) {
      event.preventDefault();
      mobileOpenRef.current = false;
      setMobileOpen(false);

      const targetHash = `#${item.sectionId}`;
      setActiveHash(targetHash);

      // Let the menu disappear before the browser resolves the anchor. This
      // avoids mobile scroll anchoring leaving the previous section selected.
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          if (window.location.hash.toLowerCase() === targetHash) {
            window.dispatchEvent(new Event("hashchange"));
          } else {
            window.location.hash = targetHash;
          }
        });
      });
      return;
    }

    mobileOpenRef.current = false;
    setMobileOpen(false);
  };

  return (
    <header className="bg-white sticky top-0 z-50 border-b border-outline-variant shadow-sm">
      <div className="flex justify-between items-center w-full max-w-[1200px] mx-auto px-4 sm:px-6 h-[64px] md:h-[72px]">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center shrink-0">
            <BriefcaseIcon className="w-4 h-4 text-white" />
          </div>
          <span className="text-[17px] sm:text-[20px] font-semibold text-primary leading-tight tracking-tight">
            Career Command Center
          </span>
        </Link>

        {/* Center nav links — desktop only */}
        <nav
          aria-label="Primary navigation"
          className="hidden items-center gap-6 md:flex"
        >
          {marketingNavigationItems.map((item) => {
            const current = currentState?.href === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={current ? currentState?.ariaCurrent : undefined}
                className={`border-b-2 py-2 text-sm transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary/50 ${
                  current
                    ? "border-secondary font-semibold text-primary"
                    : "border-transparent font-medium text-on-surface-variant hover:border-outline-variant hover:text-primary"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Right side — desktop buttons */}
        <div className="hidden md:flex items-center gap-3">
          <Link
            href="/signin"
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-primary border border-outline-variant rounded-lg hover:bg-surface-container transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="inline-flex items-center px-5 py-2 text-sm font-semibold bg-secondary text-white rounded-lg hover:opacity-90 transition-all shadow-sm"
          >
            Get started
          </Link>
        </div>

        {/* Mobile: Sign in + hamburger */}
        <div className="flex items-center gap-2 md:hidden">
          <Link
            href="/signin"
            className="inline-flex shrink-0 items-center whitespace-nowrap rounded-lg border border-outline-variant px-3 py-1.5 text-sm font-medium text-primary"
          >
            Sign in
          </Link>
          <button
            onClick={() => {
              const nextOpen = !mobileOpen;
              mobileOpenRef.current = nextOpen;

              if (nextOpen && pathname === "/") {
                const linkedHash = window.location.hash.toLowerCase();
                if (
                  marketingSectionIds.some(
                    (sectionId) => linkedHash === `#${sectionId}`,
                  )
                ) {
                  setActiveHash(linkedHash);
                }
              }

              setMobileOpen(nextOpen);
            }}
            className="shrink-0 rounded-lg p-2 text-on-surface-variant transition-colors hover:bg-surface-container"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {mobileOpen && (
        <div className="absolute inset-x-0 top-full border-t border-outline-variant bg-white px-4 pb-4 pt-2 shadow-lg md:hidden">
          <nav aria-label="Mobile navigation" className="flex flex-col gap-1">
            {marketingNavigationItems.map((item) => {
              const current = currentState?.href === item.href;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={(event) => handleMobileNavigation(event, item)}
                  aria-current={current ? currentState?.ariaCurrent : undefined}
                  className={`border-l-2 px-3 py-3 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary/50 ${
                    current
                      ? "border-secondary bg-secondary/10 font-semibold text-primary"
                      : "border-transparent font-medium text-on-surface-variant hover:bg-surface-container hover:text-primary"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-3 pt-3 border-t border-outline-variant">
            <Link
              href="/signup"
              onClick={() => setMobileOpen(false)}
              className="flex items-center justify-center w-full px-5 py-3 text-sm font-semibold bg-secondary text-white rounded-lg hover:opacity-90 transition-all shadow-sm"
            >
              Get started free
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
