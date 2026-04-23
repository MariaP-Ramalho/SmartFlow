"use client";

import { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";
import { isPublicPath } from "@/lib/public-routes";

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: () => {},
  logout: () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    try {
      const token = localStorage.getItem("auth_token");
      const storedUser = localStorage.getItem("auth_user");

      if (token && storedUser) {
        try {
          setUser(JSON.parse(storedUser));
        } catch {
          localStorage.removeItem("auth_token");
          localStorage.removeItem("auth_user");
        }
      }
    } catch {
      /* localStorage indisponível (modo privado / política) — segue sem sessão */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (loading) return;

    const isPublic = isPublicPath(pathname);

    if (!user && !isPublic) {
      router.push("/login");
    }

    if (user && isPublic) {
      router.push("/");
    }
  }, [user, loading, pathname, router]);

  const login = useCallback(
    (token: string, userData: User) => {
      localStorage.setItem("auth_token", token);
      localStorage.setItem("auth_user", JSON.stringify(userData));
      setUser(userData);
      router.push("/");
    },
    [router],
  );

  const logout = useCallback(() => {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_user");
    setUser(null);
    router.push("/login");
  }, [router]);

  const value = useMemo(
    () => ({ user, loading, login, logout }),
    [user, loading, login, logout],
  );

  /* Overlay só em rotas privadas: em /login e /register não bloqueia a UI (evita “tela vazia” se CSS/JS falhar parcialmente). */
  const showSessionOverlay = loading && !isPublicPath(pathname);

  return (
    <AuthContext.Provider value={value}>
      {showSessionOverlay && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center"
          style={{ backgroundColor: "hsl(var(--background))" }}
          aria-busy="true"
          aria-label="Carregando sessão"
        >
          <div
            className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"
            style={{ borderRadius: "9999px" }}
          />
        </div>
      )}
      {children}
    </AuthContext.Provider>
  );
}
