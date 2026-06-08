"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  UtensilsCrossed,
  Table2,
  Users,
  Tag,
  BarChart3,
  Settings,
  LogOut,
  ShoppingBag,
} from "lucide-react";
import AuthGuard from "@/components/AuthGuard";
import { useAuthStore } from "@/stores/auth";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/owner", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/owner/orders", label: "Orders", icon: ShoppingBag },
  { href: "/owner/tables", label: "Tables", icon: Table2 },
  { href: "/owner/menu", label: "Menu", icon: UtensilsCrossed },
  { href: "/owner/promos", label: "Promos", icon: Tag },
  { href: "/owner/staff", label: "Staff", icon: Users },
  { href: "/owner/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/owner/settings", label: "Settings", icon: Settings },
];

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard allowedRoles={["owner"]}>
      <OwnerShell>{children}</OwnerShell>
    </AuthGuard>
  );
}

function OwnerShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();

  function handleLogout() {
    logout();
    router.replace("/login");
  }

  return (
    <div className="flex h-screen bg-bg overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 bg-bg-surface border-r border-border flex flex-col">
        <div className="px-6 py-5 border-b border-border">
          <span className="font-display text-xl font-bold text-teal">EasyServe</span>
          <p className="text-muted text-xs mt-0.5">Owner Dashboard</p>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {nav.map(({ href, label, icon: Icon, exact }) => {
            const active = exact ? pathname === href : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors",
                  active
                    ? "bg-teal/10 text-teal"
                    : "text-muted hover:text-text hover:bg-bg-hover"
                )}
              >
                <Icon size={18} />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="px-3 py-4 border-t border-border space-y-1">
          <div className="px-3 py-2">
            <p className="text-text-soft text-sm font-medium truncate">{user?.full_name}</p>
            <p className="text-muted text-xs truncate">{user?.email}</p>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <LogOut size={18} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-8 max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
