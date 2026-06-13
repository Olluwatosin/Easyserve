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
  Moon,
} from "lucide-react";
import AuthGuard from "@/components/AuthGuard";
import { EsLogo } from "@/components/EsLogo";
import { useAuthStore } from "@/stores/auth";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/owner", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/owner/tonight", label: "Tonight", icon: Moon },
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

function GradientDivider() {
  return (
    <div
      className="mx-4 h-px flex-shrink-0"
      style={{ background: "linear-gradient(90deg, transparent, #1E2D42 40%, #1E2D42 60%, transparent)" }}
    />
  );
}

function OwnerShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();

  const currentPage = nav.find(({ href, exact }) =>
    exact ? pathname === href : pathname.startsWith(href)
  );

  const initials = user?.full_name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() ?? "??";

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  function handleLogout() {
    logout();
    router.replace("/login");
  }

  return (
    <div className="flex h-screen bg-bg overflow-hidden">
      {/* ── Sidebar ── */}
      <aside
        className="w-[220px] flex-shrink-0 flex flex-col border-r border-border"
        style={{ background: "linear-gradient(180deg, #0E1820 0%, #080D14 100%)" }}
      >
        {/* Logo */}
        <div className="px-4 pt-5 pb-4">
          <div className="flex items-center gap-2.5">
            <EsLogo size={32} />
            <div>
              <p className="font-display font-bold text-sm leading-none" style={{ color: "var(--text)" }}>
                EasyServe
              </p>
              <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                Owner Portal
              </p>
            </div>
          </div>
        </div>

        <GradientDivider />

        {/* Nav */}
        <nav className="flex-1 px-2.5 py-3 space-y-0.5 overflow-y-auto no-scrollbar">
          {nav.map(({ href, label, icon: Icon, exact }) => {
            const active = exact ? pathname === href : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-2.5 py-2 rounded-xl text-sm font-medium transition-all duration-150",
                  active
                    ? "bg-teal/10 text-teal border-l-2 border-teal"
                    : "text-muted hover:bg-bg-hover/70 hover:text-text",
                  active ? "pl-[10px] pr-3" : "px-3"
                )}
              >
                <Icon size={15} className="flex-shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>

        <GradientDivider />

        {/* User */}
        <div className="px-2.5 py-3 space-y-0.5">
          <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
              style={{
                background: "rgba(0,212,180,0.12)",
                border: "1px solid rgba(0,212,180,0.25)",
                color: "var(--teal)",
              }}
            >
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p
                className="text-xs font-semibold truncate leading-none"
                style={{ color: "var(--text)" }}
              >
                {user?.full_name}
              </p>
              <p className="text-xs mt-0.5 truncate" style={{ color: "var(--muted)" }}>
                {user?.email}
              </p>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-sm font-medium transition-colors duration-150"
            style={{ color: "var(--muted)" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "#f87171";
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(239,68,68,0.08)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "var(--muted)";
              (e.currentTarget as HTMLButtonElement).style.background = "transparent";
            }}
          >
            <LogOut size={14} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top header */}
        <header
          className="flex-shrink-0 border-b border-border px-7 py-3 flex items-center justify-between"
          style={{ background: "rgba(8,13,20,0.85)", backdropFilter: "blur(12px)" }}
        >
          <div className="flex items-center gap-3">
            <p className="font-display font-semibold text-sm" style={{ color: "var(--text)" }}>
              {currentPage?.label ?? "Dashboard"}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              {today}
            </span>
            <div className="flex items-center gap-1.5">
              <span
                className="w-1.5 h-1.5 rounded-full bg-teal animate-status-blink"
                style={{ boxShadow: "0 0 6px rgba(0,212,180,0.6)" }}
              />
              <span className="text-xs font-medium text-teal">Live</span>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="p-7 max-w-7xl mx-auto animate-fade-in">{children}</div>
        </main>
      </div>
    </div>
  );
}
