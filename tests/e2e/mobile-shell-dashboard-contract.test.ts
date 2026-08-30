import fs from "node:fs";
import path from "node:path";

const sidebarSource = fs.readFileSync(
  path.join(process.cwd(), "components/shared/Sidebar.tsx"),
  "utf8"
);
const dashboardSource = fs.readFileSync(
  path.join(process.cwd(), "app/(app)/dashboard/page.tsx"),
  "utf8"
);
const workspaceSource = fs.readFileSync(
  path.join(process.cwd(), "app/(app)/workspace/[resumeId]/page.tsx"),
  "utf8"
);

describe("mobile application shell contract", () => {
  it("reserves an in-flow mobile app bar instead of floating over content", () => {
    expect(sidebarSource).toContain('data-testid="mobile-app-bar"');
    expect(sidebarSource).toContain('className="sticky top-0');
    expect(sidebarSource).not.toContain('className="fixed left-4 top-4');
  });

  it("exposes accessible drawer state and full-size controls", () => {
    expect(sidebarSource).toContain('aria-expanded={mobileOpen}');
    expect(sidebarSource).toContain('aria-controls="mobile-navigation"');
    expect(sidebarSource).toContain('id="mobile-navigation"');
    expect(sidebarSource).toContain('className="inline-flex h-11 w-11');
  });

  it("closes with Escape and locks background scrolling", () => {
    expect(sidebarSource).toContain('event.key === "Escape"');
    expect(sidebarSource).toContain('document.body.style.overflow = "hidden"');
    expect(sidebarSource).toContain('document.body.style.overflow = previousOverflow');
  });

  it("uses dynamic mobile viewport height for the editor", () => {
    expect(workspaceSource).toContain("h-[calc(100dvh-3.5rem)] md:h-screen");
  });
});

describe("mobile dashboard contract", () => {
  it("uses a compact mobile hero and hides secondary detail below small screens", () => {
    expect(dashboardSource).toContain("min-h-0 md:min-h-[320px]");
    expect(dashboardSource).toContain("hidden sm:block");
    expect(dashboardSource).toContain('data-testid="mobile-workspace-flow"');
  });

  it("keeps resume actions wrap-safe on narrow screens", () => {
    expect(dashboardSource).toContain("flex flex-wrap");
  });

  it("allows both dashboard grid columns to shrink within narrow viewports", () => {
    expect(dashboardSource).toContain(
      'className="min-w-0 rounded-xl border border-outline-variant/30 bg-surface-lowest"'
    );
    expect(dashboardSource).toContain('className="min-w-0 space-y-5"');
  });
});
