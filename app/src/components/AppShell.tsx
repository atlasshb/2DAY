"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { StatusStrip } from "@/components/StatusStrip";
import { TabBar } from "@/components/TabBar";
import { NudgeBanner } from "@/components/NudgeBanner";
import { Snackbar } from "@/components/Snackbar";
import { useStore } from "@/lib/store";

export function AppShell({ children }: { children: ReactNode }) {
  const { mode } = useStore();
  const pathname = usePathname();
  const contentRef = useRef<HTMLDivElement>(null);

  // Reset scroll position on tab change, mirroring the prototype's go()
  // which does `$('content').scrollTop = 0` on every screen switch.
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <div className="app" data-mode={mode} id="app">
      <StatusStrip />
      <div className="content" id="content" ref={contentRef}>
        {children}
      </div>
      <NudgeBanner />
      <Snackbar />
      <TabBar />
    </div>
  );
}
