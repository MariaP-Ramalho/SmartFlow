"use client";

import { usePathname } from "next/navigation";
import { Bell, Search, User } from "lucide-react";

const pageTitles: Record<string, string> = {
  "/": "Dashboard",
  "/tickets": "Tickets",
  "/audit": "Auditoria",
  "/policies": "Políticas",
  "/approvals": "Aprovações",
  "/knowledge": "Base de Conhecimento",
};

function resolveTitle(pathname: string): string {
  if (pageTitles[pathname]) return pageTitles[pathname];
  for (const [route, title] of Object.entries(pageTitles)) {
    if (route !== "/" && pathname.startsWith(route)) return title;
  }
  return "Resolve";
}

export function Header() {
  const pathname = usePathname();
  const title = resolveTitle(pathname);

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
      <h1 className="text-xl font-semibold text-slate-900">{title}</h1>

      <div className="flex items-center gap-4">
        <div className="relative hidden md:block">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar..."
            className="h-9 w-64 rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </div>

        <button className="relative rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700">
          <Bell className="h-5 w-5" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />
        </button>

        <button className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white transition-colors hover:bg-blue-700">
          <User className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
