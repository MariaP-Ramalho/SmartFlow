"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Users, UserCheck, UserX, ToggleLeft, ToggleRight,
  Loader2, Clock, ShieldCheck, AlertCircle,
} from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { useRouter } from "next/navigation";
import api from "@/lib/api";

interface UserItem {
  id: string;
  email: string;
  name: string;
  role: string;
  active: boolean;
  pendingApproval: boolean;
  createdAt: string;
}

export default function UsersPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await api.get("/auth/users");
      setUsers(res.data);
    } catch {
      // redirect if not admin
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user && user.role !== "admin") {
      router.push("/");
      return;
    }
    fetchUsers();
  }, [user, router, fetchUsers]);

  const handleAction = async (userId: string, action: "approve" | "reject" | "toggle") => {
    setActionLoading(userId);
    try {
      await api.patch(`/auth/users/${userId}/${action}`);
      await fetchUsers();
    } catch {
      // handled
    } finally {
      setActionLoading(null);
    }
  };

  const pending = users.filter((u) => u.pendingApproval);
  const active = users.filter((u) => !u.pendingApproval);

  const roleBadge = (role: string) => {
    const colors: Record<string, string> = {
      admin: "bg-purple-100 text-purple-700",
      analyst: "bg-blue-100 text-blue-700",
      viewer: "bg-slate-100 text-slate-600",
    };
    return (
      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${colors[role] || colors.viewer}`}>
        {role}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <Users className="h-6 w-6 text-slate-600" />
        <h2 className="text-2xl font-bold text-slate-900">Gestão de Usuários</h2>
      </div>

      {/* Pending Approvals */}
      {pending.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <div className="mb-4 flex items-center gap-2">
            <Clock className="h-5 w-5 text-amber-600" />
            <h3 className="text-lg font-semibold text-amber-800">
              Aguardando Aprovação ({pending.length})
            </h3>
          </div>

          <div className="space-y-3">
            {pending.map((u) => (
              <div
                key={u.id}
                className="flex items-center justify-between rounded-lg border border-amber-200 bg-white p-4"
              >
                <div>
                  <p className="font-medium text-slate-900">{u.name}</p>
                  <p className="text-sm text-slate-500">{u.email}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    Cadastro em {new Date(u.createdAt).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleAction(u.id, "approve")}
                    disabled={actionLoading === u.id}
                    className="flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-60"
                  >
                    {actionLoading === u.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <UserCheck className="h-4 w-4" />
                    )}
                    Aprovar
                  </button>
                  <button
                    onClick={() => handleAction(u.id, "reject")}
                    disabled={actionLoading === u.id}
                    className="flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-60"
                  >
                    <UserX className="h-4 w-4" />
                    Rejeitar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All Users */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-5">
          <h3 className="text-lg font-semibold text-slate-900">
            Todos os Usuários ({active.length})
          </h3>
        </div>

        {active.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-slate-400">
            <AlertCircle className="h-8 w-8" />
            <p>Nenhum usuário cadastrado.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {active.map((u) => (
              <div key={u.id} className="flex items-center justify-between px-5 py-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white ${
                      u.active ? "bg-blue-600" : "bg-slate-400"
                    }`}
                  >
                    {u.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-slate-900">{u.name}</p>
                      {roleBadge(u.role)}
                      {u.role === "admin" && (
                        <ShieldCheck className="h-4 w-4 text-purple-500" />
                      )}
                    </div>
                    <p className="text-sm text-slate-500">{u.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span
                    className={`text-xs font-medium ${
                      u.active ? "text-green-600" : "text-slate-400"
                    }`}
                  >
                    {u.active ? "Ativo" : "Inativo"}
                  </span>
                  {u.role !== "admin" && (
                    <button
                      onClick={() => handleAction(u.id, "toggle")}
                      disabled={actionLoading === u.id}
                      className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-60"
                      title={u.active ? "Desativar" : "Ativar"}
                    >
                      {actionLoading === u.id ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : u.active ? (
                        <ToggleRight className="h-5 w-5 text-green-600" />
                      ) : (
                        <ToggleLeft className="h-5 w-5" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
