"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Activity,
  Clock,
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  Zap,
  Loader2,
} from "lucide-react";
import api from "@/lib/api";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface AuditEntry {
  _id: string;
  caseId: string;
  action: string;
  actor: string;
  details?: Record<string, unknown>;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  durationMs?: number;
  error?: string;
  createdAt: string;
}

const actionLabels: Record<string, { label: string; variant: "default" | "success" | "warning" | "danger" | "info" }> = {
  conversation_started: { label: "Conversa Iniciada", variant: "info" },
  conversation_turn: { label: "Turno de Conversa", variant: "default" },
  tool_search_knowledge: { label: "Busca Conhecimento", variant: "info" },
  tool_manage_ticket: { label: "Gerenciar Ticket", variant: "default" },
  tool_run_diagnostic: { label: "Diagnóstico", variant: "info" },
  tool_check_policy: { label: "Verificar Política", variant: "warning" },
  tool_create_dev_bug: { label: "Bug Dev Criado", variant: "danger" },
  daily_report_mongodb: { label: "Relatório Diário (Mongo)", variant: "default" },
  daily_report_zapflow: { label: "Relatório Diário (ZapFlow)", variant: "default" },
  case_started: { label: "Caso Iniciado", variant: "info" },
  case_resolved: { label: "Caso Resolvido", variant: "success" },
  case_escalated: { label: "Caso Escalado", variant: "danger" },
  case_completed: { label: "Caso Completo", variant: "success" },
  case_failed: { label: "Caso Falhou", variant: "danger" },
  llm_query: { label: "Consulta LLM", variant: "default" },
  tool_call: { label: "Chamada de Tool", variant: "default" },
  knowledge_search: { label: "Busca Conhecimento", variant: "info" },
  error: { label: "Erro", variant: "danger" },
};

const actorLabels: Record<string, { label: string; variant: "default" | "success" | "warning" | "danger" | "info" }> = {
  agent: { label: "Agente IA", variant: "info" },
  human: { label: "Humano", variant: "default" },
  system: { label: "Sistema", variant: "warning" },
};

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function detailsToString(details: any): string {
  if (!details) return "";
  if (typeof details === "string") return details;
  const parts: string[] = [];
  for (const [key, val] of Object.entries(details)) {
    if (val !== null && val !== undefined) {
      parts.push(`${key}: ${typeof val === "object" ? JSON.stringify(val) : String(val)}`);
    }
  }
  return parts.join(" | ");
}

export default function AuditPage() {
  const [auditData, setAuditData] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [actorFilter, setActorFilter] = useState<string>("all");
  const [searchCaseId, setSearchCaseId] = useState("");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const fetchAudit = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const params: Record<string, string> = {};
      if (actionFilter !== "all") params.action = actionFilter;
      if (actorFilter !== "all") params.actor = actorFilter;
      if (searchCaseId) params.caseId = searchCaseId;
      const { data: res } = await api.get("/audit", { params });
      const entries = res.data || res || [];
      setAuditData(
        entries.map((e: any) => ({ ...e, _id: e._id || e.id || String(Math.random()) })),
      );
    } catch {
      setError("Erro ao carregar registros de auditoria");
    } finally {
      setLoading(false);
    }
  }, [actionFilter, actorFilter, searchCaseId]);

  useEffect(() => {
    fetchAudit();
  }, [fetchAudit]);

  const stats = useMemo(() => {
    const totalEvents = auditData.length;
    const withDuration = auditData.filter((e) => e.durationMs != null);
    const avgDuration =
      withDuration.length > 0
        ? Math.round(withDuration.reduce((sum, e) => sum + (e.durationMs || 0), 0) / withDuration.length)
        : 0;
    const actionCounts: Record<string, number> = {};
    auditData.forEach((e) => {
      actionCounts[e.action] = (actionCounts[e.action] || 0) + 1;
    });
    const mostCommon = Object.entries(actionCounts).sort((a, b) => b[1] - a[1])[0];
    return {
      totalEvents,
      avgDuration,
      mostCommonAction: mostCommon
        ? actionLabels[mostCommon[0]]?.label ?? mostCommon[0]
        : "—",
    };
  }, [auditData]);

  const uniqueActions = useMemo(() => {
    return [...new Set(auditData.map((e) => e.action))].sort();
  }, [auditData]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Trilha de Auditoria</h1>
        <p className="mt-1 text-sm text-slate-500">
          Registro completo de todas as ações do sistema
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={Activity} label="Total de Eventos" value={stats.totalEvents} />
        <StatCard icon={Clock} label="Duração Média" value={`${stats.avgDuration}ms`} />
        <StatCard icon={Zap} label="Ação Mais Comum" value={stats.mostCommonAction} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5 text-slate-400" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">Tipo de Ação</label>
              <select
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="all">Todas</option>
                {uniqueActions.map((a) => (
                  <option key={a} value={a}>
                    {actionLabels[a]?.label ?? a}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">Ator</label>
              <select
                value={actorFilter}
                onChange={(e) => setActorFilter(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="all">Todos</option>
                <option value="agent">Agente IA</option>
                <option value="human">Humano</option>
                <option value="system">Sistema</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">Buscar Caso</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="ID do caso..."
                  value={searchCaseId}
                  onChange={(e) => setSearchCaseId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Registros de Auditoria</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : auditData.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              Nenhum registro encontrado
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/50">
                    <th className="px-3 py-2.5 text-left font-medium text-slate-500">Data/Hora</th>
                    <th className="px-3 py-2.5 text-left font-medium text-slate-500">Caso</th>
                    <th className="px-3 py-2.5 text-left font-medium text-slate-500">Ação</th>
                    <th className="px-3 py-2.5 text-left font-medium text-slate-500">Ator</th>
                    <th className="px-3 py-2.5 text-right font-medium text-slate-500">Duração</th>
                    <th className="px-3 py-2.5 text-left font-medium text-slate-500">Detalhes</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {auditData.map((entry) => {
                    const actionInfo = actionLabels[entry.action] || {
                      label: entry.action,
                      variant: "default" as const,
                    };
                    const actorInfo = actorLabels[entry.actor] || {
                      label: entry.actor,
                      variant: "default" as const,
                    };
                    const isExpanded = expandedRow === entry._id;

                    return (
                      <tr key={entry._id} className="group">
                        <td colSpan={7} className="p-0">
                          <div
                            className="flex items-center border-b border-slate-50 px-3 py-2.5 hover:bg-slate-50 cursor-pointer transition-colors"
                            onClick={() => setExpandedRow(isExpanded ? null : entry._id)}
                          >
                            <span className="w-44 text-xs text-slate-500 shrink-0">
                              {formatTimestamp(entry.createdAt)}
                            </span>
                            <span className="w-28 font-mono text-xs text-blue-600 shrink-0 truncate">
                              {entry.caseId?.slice(0, 8)}...
                            </span>
                            <span className="w-40 shrink-0">
                              <Badge variant={actionInfo.variant}>{actionInfo.label}</Badge>
                            </span>
                            <span className="w-28 shrink-0">
                              <Badge variant={actorInfo.variant}>{actorInfo.label}</Badge>
                            </span>
                            <span className="w-20 text-right font-mono text-xs text-slate-500 shrink-0">
                              {entry.durationMs != null ? `${entry.durationMs}ms` : "—"}
                            </span>
                            <span className="flex-1 ml-3 text-xs text-slate-600 truncate">
                              {detailsToString(entry.details)}
                            </span>
                            <span className="w-6 shrink-0 text-slate-400">
                              {isExpanded ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </span>
                          </div>

                          {isExpanded && (
                            <div className="border-b border-slate-200 bg-slate-50 px-6 py-4">
                              <div className="mb-3">
                                <h4 className="text-sm font-semibold text-slate-700">
                                  Detalhes Completos
                                </h4>
                                {entry.error && (
                                  <p className="mt-1 text-sm text-red-600">Erro: {entry.error}</p>
                                )}
                              </div>
                              {entry.details && (
                                <div className="mb-3">
                                  <p className="mb-1 text-xs font-medium text-slate-500">Detalhes</p>
                                  <pre className="overflow-x-auto rounded-lg bg-white p-3 text-xs text-slate-700 border border-slate-200">
                                    {JSON.stringify(entry.details, null, 2)}
                                  </pre>
                                </div>
                              )}
                              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                                {entry.input && (
                                  <div>
                                    <p className="mb-1 text-xs font-medium text-slate-500">
                                      Entrada (Input)
                                    </p>
                                    <pre className="overflow-x-auto rounded-lg bg-white p-3 text-xs text-slate-700 border border-slate-200">
                                      {JSON.stringify(entry.input, null, 2)}
                                    </pre>
                                  </div>
                                )}
                                {entry.output && (
                                  <div>
                                    <p className="mb-1 text-xs font-medium text-slate-500">
                                      Saída (Output)
                                    </p>
                                    <pre className="overflow-x-auto rounded-lg bg-white p-3 text-xs text-slate-700 border border-slate-200">
                                      {JSON.stringify(entry.output, null, 2)}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
