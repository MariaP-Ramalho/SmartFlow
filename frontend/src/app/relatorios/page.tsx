"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  RefreshCw, Search, Loader2, ChevronLeft, ChevronRight,
  Filter, X, Download, Calendar, ArrowRightLeft, ChevronDown, ChevronUp,
  TrendingUp, AlertTriangle, CheckCircle, ArrowRight,
} from "lucide-react";
import api from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface AgentAtendimento {
  z90_ate_id: number;
  z90_ate_resumo_do_problema: string | null;
  z90_ate_data_abertura: string;
  z90_ate_data_fechamento: string | null;
  z90_ate_id_status_atendimento: number;
  z90_ate_resumo_da_solucao: string | null;
  z90_ate_transbordo_dev: string | null;
  cliente: string | null;
  sistema: string | null;
  tecnico_atual: string | null;
  transferido: boolean;
}

interface Interacao {
  z90_int_conteudo_mensagem: string;
  z90_int_id_tipo_remetente: number;
  z90_int_data_hora_envio: string;
}

interface DailyStats {
  date: string;
  totalAtendimentos: number;
  resolvidosPeloAgente: number;
  transferidos: number;
  bugs: number;
}

interface SistemaOpt {
  z90_sis_id: number;
  z90_sis_nome_sistema: string;
}

interface TecnicoOpt {
  z90_tec_id: number;
  z90_tec_nome: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

function statusLabel(id: number): { label: string; color: string } {
  switch (id) {
    case 1: return { label: "Aberto", color: "bg-blue-100 text-blue-700" };
    case 2: return { label: "Em Andamento", color: "bg-amber-100 text-amber-700" };
    case 3: return { label: "Fechado", color: "bg-emerald-100 text-emerald-700" };
    default: return { label: "Fechado", color: "bg-emerald-100 text-emerald-700" };
  }
}

function remetenteLabel(tipo: number): { label: string; color: string } {
  switch (tipo) {
    case 1: return { label: "IA", color: "text-purple-600" };
    case 2: return { label: "Analista", color: "text-blue-600" };
    case 3: return { label: "Cliente", color: "text-slate-700" };
    default: return { label: "Sistema", color: "text-slate-400" };
  }
}

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

function weekAgoStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().split("T")[0];
}

const PAGE_SIZE = 50;

export default function RelatoriosPage() {
  const [atendimentos, setAtendimentos] = useState<AgentAtendimento[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [tecnicos, setTecnicos] = useState<TecnicoOpt[]>([]);
  const [sistemas, setSistemas] = useState<SistemaOpt[]>([]);
  const [tecnicoId, setTecnicoId] = useState("");
  const [sistemaId, setSistemaId] = useState("");
  const [statusId, setStatusId] = useState("");
  const [dataInicio, setDataInicio] = useState(weekAgoStr());
  const [dataFim, setDataFim] = useState(todayStr());
  const [apenasTransferidos, setApenasTransferidos] = useState(false);
  const [busca, setBusca] = useState("");
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [buscaDebounced, setBuscaDebounced] = useState("");

  const [stats, setStats] = useState<DailyStats | null>(null);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [interacoes, setInteracoes] = useState<Record<number, Interacao[]>>({});
  const [loadingInteracoes, setLoadingInteracoes] = useState<number | null>(null);

  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setBuscaDebounced(busca.trim());
      setPage(1);
    }, 450);
    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); };
  }, [busca]);

  const loadFilterOptions = useCallback(async () => {
    try {
      const [sRes, tRes, agentRes] = await Promise.all([
        api.get("/zapflow/sistemas"),
        api.get("/zapflow/tecnicos"),
        api.get("/zapflow/relatorio/agente-id"),
      ]);
      const rawSistemas: SistemaOpt[] = sRes.data?.data || [];
      const rawTecnicos: TecnicoOpt[] = tRes.data?.data || [];
      rawSistemas.sort((a, b) => (a.z90_sis_nome_sistema || "").localeCompare(b.z90_sis_nome_sistema || "", "pt-BR"));
      rawTecnicos.sort((a, b) => (a.z90_tec_nome || "").localeCompare(b.z90_tec_nome || "", "pt-BR"));
      setSistemas(rawSistemas);
      setTecnicos(rawTecnicos);

      if (!tecnicoId) {
        const resolvedId = agentRes.data?.tecnicoId;
        if (resolvedId) {
          setTecnicoId(String(resolvedId));
        } else if (rawTecnicos.length > 0) {
          const renato = rawTecnicos.find((t) => t.z90_tec_nome.toLowerCase().includes("renato"));
          setTecnicoId(String(renato ? renato.z90_tec_id : rawTecnicos[0].z90_tec_id));
        }
      }
    } catch {
      setSistemas([]);
      setTecnicos([]);
    }
  }, []);

  useEffect(() => { loadFilterOptions(); }, [loadFilterOptions]);

  const fetchData = useCallback(async (showSpinner = false) => {
    if (!tecnicoId) return;
    try {
      if (showSpinner) setRefreshing(true);
      const params: Record<string, string | number | boolean> = {
        tecnicoId: Number(tecnicoId),
        limit: PAGE_SIZE,
        page,
      };
      if (dataInicio) params.dataInicio = dataInicio;
      if (dataFim) params.dataFim = dataFim;
      if (sistemaId) params.sistemaId = Number(sistemaId);
      if (statusId) params.statusId = Number(statusId);
      if (apenasTransferidos) params.transferidos = true;
      if (buscaDebounced) params.search = buscaDebounced;

      const [dataRes, statsRes] = await Promise.all([
        api.get("/zapflow/relatorio/agente", { params }),
        api.get("/zapflow/relatorio/agente/stats", { params: { tecnicoId: Number(tecnicoId), date: todayStr() } }),
      ]);

      setAtendimentos(dataRes.data?.data || []);
      setTotal(typeof dataRes.data?.total === "number" ? dataRes.data.total : 0);
      setStats(statsRes.data || null);
    } catch {
      setAtendimentos([]);
      setTotal(0);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tecnicoId, page, dataInicio, dataFim, sistemaId, statusId, apenasTransferidos, buscaDebounced]);

  useEffect(() => { if (tecnicoId) fetchData(); }, [fetchData]);

  const toggleInteracoes = async (ateId: number) => {
    if (expandedRow === ateId) {
      setExpandedRow(null);
      return;
    }
    setExpandedRow(ateId);
    if (interacoes[ateId]) return;

    setLoadingInteracoes(ateId);
    try {
      const { data } = await api.get(`/zapflow/atendimentos/${ateId}`);
      setInteracoes((prev) => ({ ...prev, [ateId]: data.interacoes || [] }));
    } catch {
      setInteracoes((prev) => ({ ...prev, [ateId]: [] }));
    } finally {
      setLoadingInteracoes(null);
    }
  };

  const exportCSV = async () => {
    if (!tecnicoId) return;
    try {
      const params: Record<string, string> = { tecnicoId };
      if (dataInicio) params.dataInicio = dataInicio;
      if (dataFim) params.dataFim = dataFim;
      if (sistemaId) params.sistemaId = sistemaId;
      if (statusId) params.statusId = statusId;
      if (apenasTransferidos) params.transferidos = "true";
      if (buscaDebounced) params.search = buscaDebounced;

      const response = await api.get("/zapflow/relatorio/agente/export", {
        params,
        responseType: "blob",
      });

      const blob = new Blob([response.data], { type: "text/csv;charset=utf-8" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `relatorio-agente-${dataInicio || "inicio"}-${dataFim || "fim"}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch {
      alert("Erro ao exportar relatório. Tente novamente.");
    }
  };

  const clearFilters = () => {
    setSistemaId("");
    setStatusId("");
    setApenasTransferidos(false);
    setBusca("");
    setBuscaDebounced("");
    setDataInicio(weekAgoStr());
    setDataFim(todayStr());
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

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
          <h1 className="text-2xl font-bold text-slate-900">Relatório do Agente</h1>
          <p className="mt-1 text-sm text-slate-500">
            Todos os atendimentos iniciados pelo agente, incluindo transferidos
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="md" onClick={exportCSV} disabled={!tecnicoId}>
            <Download className="h-4 w-4" />
            Exportar CSV
          </Button>
          <Button variant="outline" size="md" onClick={() => fetchData(true)} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Atualizando..." : "Atualizar"}
          </Button>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-blue-50 p-2">
                  <TrendingUp className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900">{stats.totalAtendimentos}</p>
                  <p className="text-xs text-slate-500">Total Hoje</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-emerald-50 p-2">
                  <CheckCircle className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900">{stats.resolvidosPeloAgente}</p>
                  <p className="text-xs text-slate-500">Resolvidos</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-amber-50 p-2">
                  <ArrowRightLeft className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900">{stats.transferidos}</p>
                  <p className="text-xs text-slate-500">Transferidos</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-red-50 p-2">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900">{stats.bugs}</p>
                  <p className="text-xs text-slate-500">Bugs Identificados</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardContent className="pt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
            <Filter className="h-3.5 w-3.5" />
            Filtros
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">
                Técnico / Agente
              </span>
              <select
                value={tecnicoId}
                onChange={(e) => { setTecnicoId(e.target.value); setPage(1); }}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
              >
                <option value="">Selecione</option>
                {tecnicos.map((t) => (
                  <option key={t.z90_tec_id} value={String(t.z90_tec_id)}>{t.z90_tec_nome}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">
                Sistema
              </span>
              <select
                value={sistemaId}
                onChange={(e) => { setSistemaId(e.target.value); setPage(1); }}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
              >
                <option value="">Todos</option>
                {sistemas.map((s) => (
                  <option key={s.z90_sis_id} value={String(s.z90_sis_id)}>{s.z90_sis_nome_sistema}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">
                Data Início
              </span>
              <input
                type="date"
                value={dataInicio}
                onChange={(e) => { setDataInicio(e.target.value); setPage(1); }}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-400">
                Data Fim
              </span>
              <input
                type="date"
                value={dataFim}
                onChange={(e) => { setDataFim(e.target.value); setPage(1); }}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="relative min-w-[220px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por ID, cliente, sistema ou problema..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
              />
            </div>

            <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm cursor-pointer hover:bg-slate-50">
              <input
                type="checkbox"
                checked={apenasTransferidos}
                onChange={(e) => { setApenasTransferidos(e.target.checked); setPage(1); }}
                className="rounded border-slate-300"
              />
              <ArrowRightLeft className="h-3.5 w-3.5 text-amber-500" />
              Apenas transferidos
            </label>

            <Button variant="outline" size="md" onClick={clearFilters} className="shrink-0">
              <X className="h-4 w-4" />
              Limpar
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {total} atendimento(s) encontrado(s)
          {totalPages > 1 ? ` · Página ${page} de ${totalPages}` : ""}
        </p>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              <ChevronLeft className="h-4 w-4" /> Anterior
            </Button>
            <span className="text-sm text-slate-600">{page} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
              Próxima <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/50">
                  <th className="w-[40px] px-2 py-3"></th>
                  <th className="whitespace-nowrap px-4 py-3 text-left font-medium text-slate-500 w-[70px]">ID</th>
                  <th className="whitespace-nowrap px-4 py-3 text-left font-medium text-slate-500">Cliente</th>
                  <th className="whitespace-nowrap px-4 py-3 text-left font-medium text-slate-500">Sistema</th>
                  <th className="whitespace-nowrap px-4 py-3 text-left font-medium text-slate-500">Problema</th>
                  <th className="whitespace-nowrap px-4 py-3 text-left font-medium text-slate-500">Técnico Atual</th>
                  <th className="whitespace-nowrap px-4 py-3 text-center font-medium text-slate-500 w-[110px]">Situação</th>
                  <th className="whitespace-nowrap px-4 py-3 text-left font-medium text-slate-500 w-[130px]">Abertura</th>
                  <th className="whitespace-nowrap px-4 py-3 text-center font-medium text-slate-500 w-[100px]">Status</th>
                </tr>
              </thead>
              <tbody>
                {atendimentos.map((a) => {
                  const st = statusLabel(a.z90_ate_id_status_atendimento);
                  const isExpanded = expandedRow === a.z90_ate_id;
                  const caseInteracoes = interacoes[a.z90_ate_id];

                  return (
                    <>
                      <tr
                        key={a.z90_ate_id}
                        className="border-b border-slate-100 hover:bg-blue-50/40 cursor-pointer transition-colors"
                        onClick={() => toggleInteracoes(a.z90_ate_id)}
                      >
                        <td className="px-2 py-2.5 text-center">
                          {loadingInteracoes === a.z90_ate_id ? (
                            <Loader2 className="h-4 w-4 animate-spin text-slate-400 mx-auto" />
                          ) : isExpanded ? (
                            <ChevronUp className="h-4 w-4 text-slate-400 mx-auto" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-slate-400 mx-auto" />
                          )}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs text-slate-500">#{a.z90_ate_id}</td>
                        <td className="px-4 py-2.5 font-medium text-slate-700 max-w-[180px] truncate">{a.cliente || "—"}</td>
                        <td className="px-4 py-2.5">
                          <Badge variant="info">{a.sistema || "—"}</Badge>
                        </td>
                        <td className="px-4 py-2.5 max-w-[260px] truncate text-slate-600">
                          {a.z90_ate_resumo_do_problema || "Sem descrição"}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600 max-w-[140px] truncate">{a.tecnico_atual || "—"}</td>
                        <td className="px-4 py-2.5 text-center">
                          {a.transferido ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-semibold text-amber-700">
                              <ArrowRight className="h-3 w-3" /> Transferido
                            </span>
                          ) : (
                            <span className="inline-block rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                              Próprio
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-slate-400 whitespace-nowrap">
                          {a.z90_ate_data_abertura ? formatDate(a.z90_ate_data_abertura) : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${st.color}`}>
                            {st.label}
                          </span>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${a.z90_ate_id}-detail`} className="bg-slate-50/80">
                          <td colSpan={9} className="px-6 py-4">
                            <div className="space-y-3">
                              {a.z90_ate_resumo_da_solucao && (
                                <div className="rounded-lg bg-white p-3 border border-slate-200">
                                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400 mb-1">Solução</p>
                                  <p className="text-sm text-slate-700">{a.z90_ate_resumo_da_solucao}</p>
                                </div>
                              )}
                              <div className="rounded-lg bg-white p-3 border border-slate-200">
                                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400 mb-2">
                                  Interações ({caseInteracoes?.length || 0})
                                </p>
                                {!caseInteracoes ? (
                                  <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                                ) : caseInteracoes.length === 0 ? (
                                  <p className="text-sm text-slate-400">Nenhuma interação encontrada</p>
                                ) : (
                                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                                    {caseInteracoes.map((int, idx) => {
                                      const rem = remetenteLabel(int.z90_int_id_tipo_remetente);
                                      return (
                                        <div key={idx} className="flex gap-3 text-sm">
                                          <span className="text-[10px] text-slate-400 whitespace-nowrap mt-0.5 w-[50px] shrink-0">
                                            {int.z90_int_data_hora_envio
                                              ? new Date(int.z90_int_data_hora_envio).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
                                              : ""}
                                          </span>
                                          <span className={`text-xs font-semibold w-[60px] shrink-0 ${rem.color}`}>
                                            {rem.label}
                                          </span>
                                          <span className="text-slate-600 break-words min-w-0">
                                            {int.z90_int_conteudo_mensagem || "—"}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
                {atendimentos.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-slate-400">
                      Nenhum atendimento encontrado para o agente selecionado
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
