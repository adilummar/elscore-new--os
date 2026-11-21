"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  BadgeCheck,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  GraduationCap,
  LayoutGrid,
  ListChecks,
  MessageSquare,
  Shuffle,
  UserPlus,
  Users,
  UsersRound,
  Video,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { isCurrent, primaryNav, secondaryNav } from "@/app/(app)/mentoring/shell-view";

const ICONS: Record<string, LucideIcon> = {
  students: GraduationCap,
  classes: CalendarDays,
  exams: ClipboardCheck,
  meetings: Video,
  complaints: MessageSquare,
  onboarding: UserPlus,
  tasks: ListChecks,
  allocation: Shuffle,
  approvals: BadgeCheck,
  staff: UsersRound,
  overview: LayoutGrid,
};

/** The sections of one student, shown in the sidebar while a student is open. Each opens that student on the matching panel (?panel=). */
export const STUDENT_SECTIONS: ReadonlyArray<{ panel: string; label: string }> = [
  { panel: "checklist", label: "Checklist" },
  { panel: "classes", label: "Daily classes" },
  { panel: "exams", label: "Weekly exams" },
  { panel: "review", label: "Monthly review" },
  { panel: "complaints", label: "Complaints" },
  { panel: "tasks", label: "Tasks" },
  { panel: "history", label: "History" },
];

/** The student id when the path is one student's page (/mentoring/students/<id>), otherwise null. */
export function openStudentId(pathname?: string | null): string | null {
  const match = /^\/mentoring\/students\/([^/]+)\/?$/.exec(pathname ?? "");
  return match ? match[1] : null;
}

/** True on any Mentoring page, including a student's workspace and the Mentoring work lists on the dashboard route. */
export function isMentoringRoute(pathname?: string | null): boolean {
  return !!pathname && (pathname === "/mentoring" || pathname.startsWith("/mentoring/"));
}

/**
 * The Mentoring group of the app sidebar. It lists exactly what the Mentoring page used to show as tabs and links, from the same source
 * (shell-view), so what a person may open is decided in one place. It opens by itself while a Mentoring page is showing.
 */
export function MentoringNav({ hasPermission }: { hasPermission: (permission: string) => boolean }) {
  const pathname = usePathname() ?? "";
  const params = useSearchParams();
  const primary = primaryNav(hasPermission);
  const secondary = secondaryNav(hasPermission);
  const onMentoring = isMentoringRoute(pathname);
  const [expanded, setExpanded] = React.useState<boolean>(onMentoring);
  React.useEffect(() => {
    if (onMentoring) setExpanded(true);
  }, [onMentoring]);
  if (primary.length === 0 && secondary.length === 0) return null;

  const query = { status: params?.get("status"), card: params?.get("card") };
  const studentId = openStudentId(pathname);
  const currentPanel = params?.get("panel") ?? (params?.get("tab") ? null : "checklist");
  const link = (n: { href: string; label: string; section: string }) => {
    const Icon = ICONS[n.section] ?? Users;
    // Off the Mentoring pages nothing here is current: sectionOf treats any path without a section as Classes, which lit Classes on /dashboard.
    const active = onMentoring && isCurrent(n as never, pathname, query);
    return (
      <Link
        key={n.href}
        href={n.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70",
          active ? "bg-primary-hover text-white shadow-sm font-semibold" : "text-primary-soft hover:bg-primary-hover/50 hover:text-white",
        )}
      >
        <Icon className="w-4 h-4 opacity-80" aria-hidden="true" />
        <span>{n.label}</span>
      </Link>
    );
  };

  const studentGroup = studentId && (
            <div role="group" aria-label="This student" className="mb-1 ml-3 flex flex-col gap-0.5 border-l border-primary-hover/40 pl-2" data-testid="student-sections">
              <p className="px-3 pb-0.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-primary-soft/80">This student</p>
              {STUDENT_SECTIONS.map((s) => {
                const active = currentPanel === s.panel;
                return (
                  <Link
                    key={s.panel}
                    href={`/mentoring/students/${studentId}?panel=${s.panel}`}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center rounded-md px-3 py-1.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70",
                      active ? "bg-primary-hover font-semibold text-white" : "text-primary-soft hover:bg-primary-hover/50 hover:text-white",
                    )}
                  >
                    {s.label}
                  </Link>
                );
              })}
            </div>
  );

  return (
    <div className="flex flex-col" data-testid="mentoring-nav">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls="mentoring-nav-items"
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          "flex items-center justify-between w-full px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
          onMentoring ? "text-white bg-primary-hover/40" : "text-primary-soft hover:bg-primary-hover/50 hover:text-white",
        )}
      >
        <div className="flex items-center gap-3">
          <GraduationCap className="w-5 h-5 opacity-90" aria-hidden="true" />
          <span>Mentoring</span>
        </div>
        {expanded ? <ChevronDown className="w-4 h-4 opacity-75" aria-hidden="true" /> : <ChevronRight className="w-4 h-4 opacity-75" aria-hidden="true" />}
      </button>

      {expanded && (
        <div id="mentoring-nav-items" className="flex flex-col gap-1 pl-3 mt-1 ml-4 border-l border-primary-hover/40">
          {primary.map((n) => (
            <React.Fragment key={n.href}>
              {link(n)}
              {n.section === "students" && studentGroup}
            </React.Fragment>
          ))}
          {primary.length > 0 && secondary.length > 0 && <div role="separator" className="my-1 border-t border-primary-hover/40" />}
          {secondary.map(link)}
        </div>
      )}
    </div>
  );
}
