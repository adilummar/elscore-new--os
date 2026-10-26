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
  Calendar,
  Briefcase,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { logout } from "@/lib/api/auth";
import { usePermissions } from "@/components/providers/AuthProvider";
import { getHrSubItems, isHrRouteActive, isNavItemActive } from "./sidebar-navigation";

export function Sidebar({ user }: { user: any }) {
  const pathname = usePathname();
  const router = useRouter();
  const { hasPermission } = usePermissions();

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  const hasMarketingRole = user?.roles?.some((r: string) => ['MARKETING_HEAD', 'PERFORMANCE_MARKETER', 'CEO', 'CO_FOUNDER'].includes(r));

  const isCeo = user?.roles?.includes('CEO') || hasPermission('analytics.ceo.read');
  const hrSubItems = getHrSubItems(hasPermission, Boolean(isCeo));
  const isHrRoute = isHrRouteActive(pathname);

  const [isHrExpanded, setIsHrExpanded] = React.useState<boolean>(() => isHrRouteActive(pathname));

  React.useEffect(() => {
    if (isHrRouteActive(pathname)) {
      setIsHrExpanded(true);
    }
  }, [pathname]);

  const topNavItems = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { name: "Attendance", href: "/attendance", icon: Clock },
    ...(hasPermission("leave.request.own") || hasPermission("leave.read.all") ? [{ name: "Leaves", href: "/leaves", icon: Calendar }] : []),
    ...(hasPermission("attendance.read.team") || hasPermission("employee.read-all") ? [{ name: "Staffs", href: "/staffs", icon: Users }] : []),
  ];

  const bottomNavItems = [
    ...(hasPermission("target.read.own") || hasPermission("target.read.team") || hasPermission("lead.read") ? [{ name: "Sales", href: "/sales", icon: Users }] : []),
    ...(hasPermission("lead.read") || hasPermission("lead.read-all") ? [{ name: "Leads", href: "/leads", icon: Users }] : []),
    ...(hasPermission("followup.read") || hasPermission("followup.read-all") ? [{ name: "Follow-ups", href: "/follow-ups", icon: UserPlus }] : []),
    ...(hasPermission("demo.read") || hasPermission("demo.read_own") || hasPermission("demo.read_assigned") || hasPermission("demo.manage_all") ? [{ name: "Demos", href: "/demos", icon: FileText }] : []),
    ...(hasMarketingRole || hasPermission("analytics.ceo.read") ? [{ name: "Marketing", href: "/marketing", icon: BarChart3 }] : []),
    ...(hasPermission("report.view") || hasPermission("analytics.ceo.read") || hasPermission("target.read.team") ? [{ name: "Reports", href: "/reports", icon: BarChart3 }] : []),
    ...(hasPermission("role.manage") || hasPermission("settings.read") || hasPermission("audit.view") || hasPermission("user.read") || hasPermission("employee.read-all") || hasPermission("reference.manage") ? [{ name: "Settings", href: "/settings", icon: Settings }] : []),
  ];

  return (
    <aside className="w-64 bg-primary text-white flex flex-col h-full border-r border-primary-hover shadow-lg">
      <div className="h-16 flex-shrink-0 flex items-center px-6 border-b border-primary-hover">
        <span className="font-bold text-xl tracking-tight">EL SCORE OS</span>
      </div>
      <div className="flex-1 overflow-y-auto py-4 flex flex-col gap-1 px-3 custom-scrollbar">
        {topNavItems.map((item) => {
          const isActive = isNavItemActive(item.href, pathname);
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

        {hrSubItems.length > 0 && (
          <div className="flex flex-col">
            <button
              type="button"
              aria-expanded={isHrExpanded}
              onClick={() => setIsHrExpanded((prev) => !prev)}
              className={cn(
                "flex items-center justify-between w-full px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                isHrRoute
                  ? "text-white bg-primary-hover/40"
                  : "text-primary-soft hover:bg-primary-hover/50 hover:text-white"
              )}
            >
              <div className="flex items-center gap-3">
                <Briefcase className="w-5 h-5 opacity-90" />
                <span>HR Management</span>
              </div>
              {isHrExpanded ? (
                <ChevronDown className="w-4 h-4 opacity-75" />
              ) : (
                <ChevronRight className="w-4 h-4 opacity-75" />
              )}
            </button>

            {isHrExpanded && (
              <div className="flex flex-col gap-1 pl-3 mt-1 ml-4 border-l border-primary-hover/40">
                {hrSubItems.map((subItem) => {
                  const isSubActive =
                    pathname === subItem.href ||
                    pathname.startsWith(subItem.href + '/') ||
                    (subItem.href === '/settings/employees' && (pathname === '/employees' || pathname.startsWith('/employees/')));
                  return (
                    <Link
                      key={subItem.name}
                      href={subItem.href}
                      className={cn(
                        "flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-medium transition-colors",
                        isSubActive
                          ? "bg-primary-hover text-white shadow-sm font-semibold"
                          : "text-primary-soft hover:bg-primary-hover/50 hover:text-white"
                      )}
                    >
                      <subItem.icon className="w-4 h-4 opacity-80" />
                      <span>{subItem.name}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {bottomNavItems.map((item) => {
          const isActive = isNavItemActive(item.href, pathname);
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
