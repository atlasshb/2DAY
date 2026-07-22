"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { StatusStrip } from "@/components/StatusStrip";
import { TabBar } from "@/components/TabBar";
import { NudgeBanner } from "@/components/NudgeBanner";
import { Snackbar } from "@/components/Snackbar";
import { DemoBadge } from "@/components/DemoBadge";
import { useStore } from "@/lib/store";
import { useFieldBrain } from "@/lib/nudges";

export function AppShell({ children }: { children: ReactNode }) {
  const { mode } = useStore();
  const pathname = usePathname();
  const contentRef = useRef<HTMLDivElement>(null);

  // Drive the on-device field brain (@2day/core rules → nudge banner).
  useFieldBrain();

  // Reset scroll position on tab change, mirroring the prototype's go()
  // which does `$('content').scrollTop = 0` on every screen switch.
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <div className="app" data-mode={mode} id="app">
      <DemoBadge />
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
