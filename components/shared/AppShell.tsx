"use client";

import { type CSSProperties, useEffect, useState } from "react";
import Sidebar from "@/components/shared/Sidebar";

const SIDEBAR_STORAGE_KEY = "career-command-sidebar-collapsed";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true");
  }, []);

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      return next;
    });
  }

  return (
    <div
      className="career-app-shell min-h-screen bg-background"
      style={
        {
          "--app-sidebar-width": collapsed ? "4rem" : "14rem",
        } as CSSProperties
      }
    >
      <Sidebar collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
      <div className="app-content transition-[margin] duration-200">{children}</div>
    </div>
  );
}
