"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogIcon, PlanIcon, RouteIcon, StatsIcon, TodayIcon } from "@/components/icons";

const TABS = [
  { href: "/", label: "Today", Icon: TodayIcon },
  { href: "/plan", label: "Plan", Icon: PlanIcon },
  { href: "/route", label: "Route", Icon: RouteIcon },
  { href: "/log", label: "Log", Icon: LogIcon },
  { href: "/stats", label: "Stats", Icon: StatsIcon },
] as const;

export function TabBar() {
  const pathname = usePathname();

  return (
    <nav className="tabbar" aria-label="Main">
      {TABS.map(({ href, label, Icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={`tab${active ? " active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            <Icon />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
