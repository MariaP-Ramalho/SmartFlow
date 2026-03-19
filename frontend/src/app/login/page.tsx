"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Eye, EyeOff, Loader2 } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import api from "@/lib/api";

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { data } = await api.post("/auth/login", { email, password });
      login(data.token, data.user);
    } catch (err: any) {
      const msg = err.response?.data?.message;
      setError(msg || "Erro ao fazer login. Verifique suas credenciais.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900">
      <div className="w-full max-w-md px-6">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600">
            <CheckCircle2 className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Resolve</h1>
          <p className="text-sm text-slate-400">
            Plataforma de resolução inteligente
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-slate-700 bg-slate-800 p-8 shadow-2xl"
        >
          <h2 className="mb-6 text-center text-lg font-semibold text-white">
            Entrar na plataforma
          </h2>

          {error && (
            <div className="mb-4 rounded-lg border border-red-800 bg-red-900/30 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <div className="mb-4">
            <label
              htmlFor="email"
              className="mb-1.5 block text-sm font-medium text-slate-300"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              required
              autoFocus
              className="w-full rounded-lg border border-slate-600 bg-slate-700 px-4 py-2.5 text-sm text-white placeholder-slate-400 outline-none transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="mb-6">
            <label
              htmlFor="password"
              className="mb-1.5 block text-sm font-medium text-slate-300"
            >
              Senha
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full rounded-lg border border-slate-600 bg-slate-700 px-4 py-2.5 pr-11 text-sm text-white placeholder-slate-400 outline-none transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                tabIndex={-1}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Entrando...
              </>
            ) : (
              "Entrar"
            )}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-slate-400">
          Não tem conta?{" "}
          <Link
            href="/register"
            className="font-medium text-blue-400 hover:text-blue-300"
          >
            Criar conta
          </Link>
        </p>

        <p className="mt-4 text-center text-xs text-slate-500">
          Resolve-to-Close &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
