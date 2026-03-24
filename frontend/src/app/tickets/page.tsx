"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Search, Loader2, ChevronLeft, ChevronRight, Filter, X } from "lucide-react";
import api from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

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

interface SistemaOpt {
  z90_sis_id: number;
  z90_sis_nome_sistema: string;
}

interface TecnicoOpt {
  z90_tec_id: number;
  z90_tec_nome: string;
}

const STATUS_OPTIONS = [
  { value: "", label: "Todos os status" },
  { value: "1", label: "Aberto" },
  { value: "2", label: "Em andamento" },
  { value: "3", label: "Fechado" },
  { value: "4", label: "Cancelado" },
];

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

const PAGE_SIZE = 50;

export default function TicketsPage() {
  const router = useRouter();
  const [atendimentos, setAtendimentos] = useState<Atendimento[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sistemas, setSistemas] = useState<SistemaOpt[]>([]);
  const [tecnicos, setTecnicos] = useState<TecnicoOpt[]>([]);
  const [filtroAbertos, setFiltroAbertos] = useState(false);
  const [sistemaId, setSistemaId] = useState("");
  const [tecnicoId, setTecnicoId] = useState("");
  const [statusId, setStatusId] = useState("");
  const [busca, setBusca] = useState("");
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [buscaDebounced, setBuscaDebounced] = useState("");

  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setBuscaDebounced(busca.trim());
      setPage(1);
    }, 450);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [busca]);

  const loadFilterOptions = useCallback(async () => {
    try {
      const [sRes, tRes] = await Promise.all([
        api.get("/zapflow/sistemas"),
        api.get("/zapflow/tecnicos"),
      ]);
      setSistemas(sRes.data?.data || []);
      setTecnicos(tRes.data?.data || []);
    } catch {
      setSistemas([]);
      setTecnicos([]);
    }
  }, []);

  useEffect(() => {
    loadFilterOptions();
  }, [loadFilterOptions]);

  const fetchAtendimentos = useCallback(
    async (showSpinner = false) => {
      try {
        if (showSpinner) setRefreshing(true);
        const params: Record<string, string | number> = {
          limit: PAGE_SIZE,
          page,
        };
        if (filtroAbertos) params.abertos = "true";
        if (sistemaId) params.sistemaId = Number(sistemaId);
        if (tecnicoId) params.tecnicoId = Number(tecnicoId);
        if (statusId) params.statusId = Number(statusId);
        if (buscaDebounced) params.search = buscaDebounced;

        const { data } = await api.get("/zapflow/atendimentos", { params });
        setAtendimentos(data.data || []);
        setTotal(typeof data.total === "number" ? data.total : data.data?.length ?? 0);
      } catch {
        console.error("Erro ao carregar atendimentos");
        setAtendimentos([]);
        setTotal(0);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [page, filtroAbertos, sistemaId, tecnicoId, statusId, buscaDebounced],
  );

  useEffect(() => {
    fetchAtendimentos();
  }, [fetchAtendimentos]);

  useEffect(() => {
    const interval = setInterval(() => fetchAtendimentos(), 45000);
    return () => clearInterval(interval);
  }, [fetchAtendimentos]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const clearFilters = () => {
    setSistemaId("");
    setTecnicoId("");
    setStatusId("");
    setBusca("");
    setBuscaDebounced("");
    setFiltroAbertos(false);
    setPage(1);
  };

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
            {total} atendimento(s) encontrado(s)
            {totalPages > 1 ? ` · Página ${page} de ${totalPages}` : ""}
          </p>
        </div>
        <Button variant="outline" size="md" onClick={() => fetchAtendimentos(true)} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Atualizando..." : "Atualizar"}
        </Button>
      </div>

      <Card>
        <CardContent className="pt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
            <Filter className="h-3.5 w-3.5" />
            Filtros
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">
                Sistema
              </span>
              <select
                value={sistemaId}
                onChange={(e) => {
                  setSistemaId(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
              >
                <option value="">Todos</option>
                {sistemas.map((s) => (
                  <option key={s.z90_sis_id} value={String(s.z90_sis_id)}>
                    {s.z90_sis_nome_sistema}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">
                Técnico
              </span>
              <select
                value={tecnicoId}
                onChange={(e) => {
                  setTecnicoId(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
              >
                <option value="">Todos</option>
                {tecnicos.map((t) => (
                  <option key={t.z90_tec_id} value={String(t.z90_tec_id)}>
                    {t.z90_tec_nome}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">
                Status
              </span>
              <select
                value={statusId}
                onChange={(e) => {
                  setStatusId(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value || "all"} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">
                Situação
              </span>
              <div className="flex rounded-lg border border-slate-200 p-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setFiltroAbertos(false);
                    setPage(1);
                  }}
                  className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                    !filtroAbertos ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  Todos
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFiltroAbertos(true);
                    setPage(1);
                  }}
                  className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                    filtroAbertos ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  Só abertos
                </button>
              </div>
            </label>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="relative min-w-[220px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por ID, cliente, sistema, técnico ou texto do problema..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={clearFilters}
              className="shrink-0"
            >
              <X className="h-4 w-4" />
              Limpar filtros
            </Button>
          </div>
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft className="h-4 w-4" />
            Anterior
          </Button>
          <span className="text-sm text-slate-600">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Próxima
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

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
                {atendimentos.map((a) => {
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
                {atendimentos.length === 0 && (
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
