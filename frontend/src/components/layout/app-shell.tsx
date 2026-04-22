"use client";

import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { Sidebar } from "./sidebar";
import { Header } from "./header";

const PUBLIC_ROUTES = ["/login", "/register"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();

  const isPublic = PUBLIC_ROUTES.includes(pathname);

  /* Enquanto a sessão hidrata, só repassa a página (overlay fica no AuthProvider). */
  if (loading) {
    return <>{children}</>;
  }

  /* Evita montar páginas autenticadas sem usuário (401 + possível tela “vazia” / flash). */
  if (!user && !isPublic) {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center px-4"
        style={{
          backgroundColor: "hsl(var(--background))",
          color: "hsl(var(--foreground))",
        }}
      >
        <div
          className="h-8 w-8 animate-spin rounded-full"
          style={{
            border: "2px solid hsl(var(--primary))",
            borderTopColor: "transparent",
            borderRadius: "9999px",
          }}
        />
        <p className="mt-4 max-w-sm text-center text-sm opacity-90">
          Redirecionando para o login…
        </p>
      </div>
    );
  }

  if (!user || isPublic) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen min-h-0 overflow-hidden">
      <Sidebar />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <Header />
        <main className="min-h-0 flex-1 overflow-y-auto bg-[hsl(var(--background))] p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
