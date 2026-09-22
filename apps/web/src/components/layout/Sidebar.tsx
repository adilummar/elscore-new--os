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

  const navItems = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { name: "Attendance", href: "/attendance", icon: Clock },
    ...(hasPermission("attendance.read.team") || hasPermission("employee.read") ? [{ name: "Staffs", href: "/staffs", icon: Users }] : []),
    { name: "Sales", href: "/sales", icon: Users },
    { name: "Leads", href: "/leads", icon: Users },
    { name: "Follow-ups", href: "/follow-ups", icon: UserPlus },
    { name: "Demos", href: "/demos", icon: FileText },
    { name: "Marketing", href: "/marketing", icon: BarChart3 },
    { name: "Reports", href: "/reports", icon: BarChart3 },
    ...(hasPermission("employee.read") || hasPermission("analytics.ceo.read") ? [{ name: "HR / Employees", href: "/employees", icon: Users }] : []),
  ];

  if (hasPermission("role.manage") || hasPermission("settings.read") || hasPermission("employee.read")) {
    navItems.push({ name: "Settings", href: "/settings", icon: Settings });
  }

  return (
    <aside className="w-64 bg-primary text-white flex flex-col h-full border-r border-primary-hover shadow-lg">
      <div className="h-16 flex-shrink-0 flex items-center px-6 border-b border-primary-hover">
        <span className="font-bold text-xl tracking-tight">EL SCORE OS</span>
      </div>
      <div className="flex-1 overflow-y-auto py-4 flex flex-col gap-1 px-3">
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
