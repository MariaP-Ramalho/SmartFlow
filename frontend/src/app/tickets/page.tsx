"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Search, Loader2 } from "lucide-react";
import api from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

interface Atendimento {
  z90_ate_id: number;
  z90_ate_resumo_do_problema: string | null;
  z90_ate_data_abertura: string;
  z90_ate_data_fechamento: string | null;
  z90_ate_id_status_atendimento: number;
  z90_ate_resumo_da_solucao: string | null;
  z90_ate_avaliacao_cliente: number | null;
  cliente: string | null;
  sistema: string | null;
  tecnico: string | null;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusLabel(id: number): { label: string; color: string } {
  switch (id) {
    case 1: return { label: "Aberto", color: "bg-blue-100 text-blue-700" };
    case 2: return { label: "Em Andamento", color: "bg-amber-100 text-amber-700" };
    case 3: return { label: "Fechado", color: "bg-emerald-100 text-emerald-700" };
    case 4: return { label: "Cancelado", color: "bg-red-100 text-red-700" };
    default: return { label: `Status ${id}`, color: "bg-slate-100 text-slate-600" };
  }
}

export default function TicketsPage() {
  const router = useRouter();
  const [atendimentos, setAtendimentos] = useState<Atendimento[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filtroAbertos, setFiltroAbertos] = useState(false);
  const [busca, setBusca] = useState("");

  const fetchAtendimentos = useCallback(async (showSpinner = false) => {
    try {
      if (showSpinner) setRefreshing(true);
      const { data } = await api.get("/zapflow/atendimentos", {
        params: { limit: 100, abertos: filtroAbertos ? "true" : "false" },
      });
      setAtendimentos(data.data || []);
    } catch {
      console.error("Erro ao carregar atendimentos");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filtroAbertos]);

  useEffect(() => {
    fetchAtendimentos();
  }, [fetchAtendimentos]);

  useEffect(() => {
    const interval = setInterval(() => fetchAtendimentos(), 30000);
    return () => clearInterval(interval);
  }, [fetchAtendimentos]);

  const filtered = busca
    ? atendimentos.filter(
        (a) =>
          String(a.z90_ate_id).includes(busca) ||
          (a.cliente || "").toLowerCase().includes(busca.toLowerCase()) ||
          (a.sistema || "").toLowerCase().includes(busca.toLowerCase()) ||
          (a.z90_ate_resumo_do_problema || "").toLowerCase().includes(busca.toLowerCase()),
      )
    : atendimentos;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Atendimentos</h1>
          <p className="mt-1 text-sm text-slate-500">
            {filtered.length} atendimentos do ZapFlow
          </p>
        </div>
        <Button variant="outline" size="md" onClick={() => fetchAtendimentos(true)} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Atualizando..." : "Atualizar"}
        </Button>
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por ID, cliente, sistema ou problema..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setFiltroAbertos(false)}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  !filtroAbertos ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                Todos
              </button>
              <button
                onClick={() => setFiltroAbertos(true)}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  filtroAbertos ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                Apenas Abertos
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/50">
                  <th className="px-4 py-3 text-left font-medium text-slate-500">ID</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500">Cliente</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500">Sistema</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500">Problema</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500">Técnico</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500">Abertura</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => {
                  const st = statusLabel(a.z90_ate_id_status_atendimento);
                  return (
                    <tr
                      key={a.z90_ate_id}
                      className="border-b border-slate-50 hover:bg-blue-50/50 cursor-pointer transition-colors"
                      onClick={() => router.push(`/tickets/zf-${a.z90_ate_id}`)}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">#{a.z90_ate_id}</td>
                      <td className="px-4 py-3 font-medium text-slate-700">{a.cliente || "—"}</td>
                      <td className="px-4 py-3">
                        <Badge variant="info">{a.sistema || "—"}</Badge>
                      </td>
                      <td className="px-4 py-3 max-w-xs truncate text-slate-600">
                        {a.z90_ate_resumo_do_problema || "Sem descrição"}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{a.tecnico || "—"}</td>
                      <td className="px-4 py-3 text-xs text-slate-400">
                        {a.z90_ate_data_abertura ? formatDate(a.z90_ate_data_abertura) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium ${st.color}`}>
                          {st.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                      Nenhum atendimento encontrado
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
