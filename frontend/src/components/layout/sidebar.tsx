"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  Sparkles,
  MessagesSquare,
  Library,
  ClipboardList,
  LineChart,
  ScrollText,
  BookMarked,
  UsersRound,
  SlidersHorizontal,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { SmartFlowLogo } from "@/components/brand/smart-flow-logo";
import { useAuth } from "@/components/auth/auth-provider";
import type { LucideIcon } from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  { label: "Agentes", href: "/agents", icon: Sparkles, adminOnly: true },
  { label: "Histórico de Conversas", href: "/agent", icon: MessagesSquare },
  { label: "Aprendizado", href: "/aprendizado", icon: Library },
  { label: "Atendimentos", href: "/tickets", icon: ClipboardList },
  { label: "Relatórios", href: "/relatorios", icon: LineChart },
  { label: "Auditoria", href: "/audit", icon: ScrollText },
  { label: "Base de Conhecimento", href: "/knowledge", icon: BookMarked },
  { label: "Usuários", href: "/users", icon: UsersRound, adminOnly: true },
  { label: "Configurações", href: "/settings", icon: SlidersHorizontal },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const { user } = useAuth();

  const visibleItems = navItems.filter(
    (item) => !item.adminOnly || user?.role === "admin",
  );

  return (
    <aside
      className={cn(
        "flex h-screen flex-col border-r border-slate-800 bg-slate-900 transition-all duration-300",
        collapsed ? "w-16" : "w-64"
      )}
    >
      <Link
        href="/"
        className={cn(
          "flex h-16 min-h-16 items-center gap-2 border-b border-slate-800 px-4 transition-opacity hover:opacity-95",
          collapsed && "justify-center px-2",
        )}
        title="SmartFlow — início"
      >
        <SmartFlowLogo
          className={cn("rounded-xl shadow-md", collapsed ? "h-9 w-9" : "h-9 w-9")}
          showWordmark={!collapsed}
          wordmarkClassName="text-slate-100"
        />
      </Link>

      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-4">
        {visibleItems.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-blue-600/20 text-blue-400"
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              )}
              title={collapsed ? item.label : undefined}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-800 p-2">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex w-full items-center justify-center rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
        >
          {collapsed ? (
            <ChevronsRight className="h-5 w-5" />
          ) : (
            <ChevronsLeft className="h-5 w-5" />
          )}
        </button>
      </div>
    </aside>
  );
}
