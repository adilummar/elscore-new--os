"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  UserPlus,
  FileText,
  BarChart3,
  Settings,
  LogOut,
  Clock,
} from "lucide-react";
import { logout } from "@/lib/api/auth";
import { usePermissions } from "@/components/providers/AuthProvider";

export function Sidebar({ user }: { user: any }) {
  const pathname = usePathname();
  const router = useRouter();
  const { hasPermission } = usePermissions();

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  const hasMarketingRole = user?.roles?.some((r: string) => ['MARKETING_HEAD', 'PERFORMANCE_MARKETER', 'CEO', 'CO_FOUNDER'].includes(r));

  const navItems = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { name: "Attendance", href: "/attendance", icon: Clock },
    ...(hasPermission("attendance.read.team") || hasPermission("employee.read-all") ? [{ name: "Staffs", href: "/staffs", icon: Users }] : []),
    ...(hasPermission("target.read.own") || hasPermission("target.read.team") || hasPermission("lead.read") ? [{ name: "Sales", href: "/sales", icon: Users }] : []),
    ...(hasPermission("lead.read") || hasPermission("lead.read-all") ? [{ name: "Leads", href: "/leads", icon: Users }] : []),
    ...(hasPermission("followup.read") || hasPermission("followup.read-all") ? [{ name: "Follow-ups", href: "/follow-ups", icon: UserPlus }] : []),
    ...(hasPermission("demo.read") || hasPermission("demo.read_own") || hasPermission("demo.read_assigned") || hasPermission("demo.manage_all") ? [{ name: "Demos", href: "/demos", icon: FileText }] : []),
    ...(hasMarketingRole || hasPermission("analytics.ceo.read") ? [{ name: "Marketing", href: "/marketing", icon: BarChart3 }] : []),
    ...(hasPermission("report.view") || hasPermission("analytics.ceo.read") || hasPermission("target.read.team") ? [{ name: "Reports", href: "/reports", icon: BarChart3 }] : []),
    ...(hasPermission("employee.read-all") || hasPermission("analytics.ceo.read") ? [{ name: "HR / Employees", href: "/employees", icon: Users }] : []),
    ...(hasPermission("tutor_lead.read") || hasPermission("tutor_lead.manage") ? [{ name: "Tutor HR", href: "/tutor-hr", icon: Users }] : []),
  ];

  if (hasPermission("role.manage") || hasPermission("settings.read") || hasPermission("audit.view") || hasPermission("user.read") || hasPermission("employee.read-all") || hasPermission("reference.manage")) {
    navItems.push({ name: "Settings", href: "/settings", icon: Settings });
  }

  return (
    <aside className="w-64 bg-primary text-white flex flex-col h-full border-r border-primary-hover shadow-lg">
      <div className="h-16 flex-shrink-0 flex items-center px-6 border-b border-primary-hover">
        <span className="font-bold text-xl tracking-tight">EL SCORE OS</span>
      </div>
      <div className="flex-1 overflow-y-auto py-4 flex flex-col gap-1 px-3 custom-scrollbar">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary-hover text-white shadow-sm"
                  : "text-primary-soft hover:bg-primary-hover/50 hover:text-white"
              )}
            >
              <item.icon className="w-5 h-5 opacity-90" />
              {item.name}
            </Link>
          );
        })}
      </div>
      <div className="p-4 border-t border-primary-hover flex-shrink-0">
        <div className="mb-4 px-3 flex flex-col gap-1 overflow-hidden">
          <p className="text-sm font-medium text-white truncate">{user?.email}</p>
          <p className="text-xs text-primary-soft truncate">
            {user?.roles?.join(', ')}
          </p>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 w-full rounded-md text-sm font-medium text-primary-soft hover:bg-primary-hover/50 hover:text-white transition-colors"
        >
          <LogOut className="w-5 h-5 opacity-90" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
