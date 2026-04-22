"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Bot,
  Brain,
  Wrench,
  BookOpen,
  AlertCircle,
  ChevronRight,
  Loader2,
  Search,
  History,
  MessageSquare,
  ArrowLeft,
  Calendar,
  Hash,
  Settings,
  Save,
  RotateCcw,
  RotateCw,
  Check,
  Database,
} from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/auth-provider";

interface AgentSourcesMeta {
  toolsUsed?: string[];
  knowledge?: { id: string; title: string; source?: string }[];
  pastCases?: { atendimentoId: number; sistema?: string; problemaPreview?: string }[];
}

interface HistorySession {
  sessionId: string;
  systemName: string;
  customerName: string;
  messageCount: number;
  lastMessage: string;
  toolsUsed: string[];
  knowledgeSourcesUsed: string[];
  status: string;
  attemptCount: number;
  createdAt: string;
  updatedAt: string;
}

interface HistoryDetail {
  sessionId: string;
  systemName: string;
  customerName: string;
  messages: { role: string; content: string; timestamp: string; meta?: AgentSourcesMeta }[];
  toolsUsed: string[];
  knowledgeSourcesUsed: string[];
  status: string;
  attemptCount: number;
  createdAt: string;
  updatedAt: string;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function MessageSourcesPanel({ meta }: { meta?: AgentSourcesMeta | null }) {
  if (!meta) {
    return <p className="text-xs leading-relaxed text-slate-500 italic">Registro de fontes não disponível para esta mensagem.</p>;
  }
  const toolsUsed = meta.toolsUsed ?? [];
  const knowledge = meta.knowledge ?? [];
  const pastCases = meta.pastCases ?? [];
  if (toolsUsed.length === 0 && knowledge.length === 0 && pastCases.length === 0) {
    return <p className="text-xs leading-relaxed text-slate-500">Nenhuma ferramenta de busca usada nesta resposta.</p>;
  }
  return (
    <div className="space-y-3 text-left">
      {toolsUsed.length > 0 && (
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-amber-400">Ferramentas</p>
          <ul className="flex flex-wrap gap-1.5">
            {toolsUsed.map((t) => (
              <li key={t} className="rounded-full border border-amber-800/60 bg-amber-950/50 px-2 py-0.5 text-[10px] font-medium text-amber-300">{t}</li>
            ))}
          </ul>
        </div>
      )}
      {knowledge.length > 0 && (
        <div>
          <p className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-purple-300">
            <BookOpen className="h-3 w-3" /> Base de conhecimento
          </p>
          <ul className="space-y-2">
            {knowledge.map((doc) => (
              <li key={doc.id} className="rounded-lg border border-purple-800/50 bg-purple-950/40 px-3 py-2 text-xs text-slate-200">
                <span className="font-medium text-purple-200">{doc.title}</span>
                {doc.source && <span className="mt-0.5 block text-[10px] text-purple-400/90">Categoria: {doc.source}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {pastCases.length > 0 && (
        <div>
          <p className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-sky-300">
            <Database className="h-3 w-3" /> Casos ZapFlow
          </p>
          <ul className="space-y-2">
            {pastCases.map((c) => (
              <li key={c.atendimentoId} className="rounded-lg border border-sky-800/50 bg-sky-950/40 px-3 py-2 text-xs text-slate-200">
                <span className="font-semibold text-sky-200">#{c.atendimentoId}</span>
                {c.sistema && <span className="ml-2 text-[10px] text-sky-300/90">· {c.sistema}</span>}
                {c.problemaPreview && <p className="mt-1 text-[11px] leading-snug text-slate-500 line-clamp-4">{c.problemaPreview}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-emerald-950/50 text-emerald-300 border-emerald-800/60",
    resolved: "bg-blue-950/50 text-blue-300 border-blue-800/60",
    escalated: "bg-amber-950/50 text-amber-300 border-amber-800/60",
  };
  return (
    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${map[status] || map.active}`}>
      {status === "active" ? "Ativo" : status === "resolved" ? "Resolvido" : "Escalado"}
    </span>
  );
}

interface AgentConfigData {
  systemPrompt: string;
  bufferDelayMs: number;
  chatModel: string;
  maxAttempts: number;
  maxToolIterations: number;
  agentDisplayName: string;
  customInstructions: string;
  updatedAt?: string;
}

export default function AgentPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [tab, setTab] = useState<"history" | "config">("history");

  const [historySessions, setHistorySessions] = useState<HistorySession[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyDetail, setHistoryDetail] = useState<HistoryDetail | null>(null);
  const [historyDetailLoading, setHistoryDetailLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotalPages, setHistoryTotalPages] = useState(1);
  const [historySelectedMsg, setHistorySelectedMsg] = useState<number | null>(null);
  const [historySearch, setHistorySearch] = useState("");
  const [historyStatusFilter, setHistoryStatusFilter] = useState<string>("");

  const [agentConfig, setAgentConfig] = useState<AgentConfigData | null>(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const [configSuccess, setConfigSuccess] = useState("");
  const [configError, setConfigError] = useState("");

  const loadConfig = useCallback(async () => {
    setConfigLoading(true);
    setConfigError("");
    try {
      const { data } = await api.get("/agent/chat/config");
      setAgentConfig(data);
    } catch {
      setConfigError("Erro ao carregar configurações.");
    } finally {
      setConfigLoading(false);
    }
  }, []);

  const saveConfig = async () => {
    if (!agentConfig) return;
    setConfigSaving(true);
    setConfigSuccess("");
    setConfigError("");
    try {
      await api.patch("/agent/chat/config", agentConfig);
      setConfigSuccess("Configurações salvas com sucesso.");
      setTimeout(() => setConfigSuccess(""), 3000);
    } catch {
      setConfigError("Erro ao salvar configurações.");
    } finally {
      setConfigSaving(false);
    }
  };

  const resetConfig = async () => {
    setConfigSaving(true);
    setConfigSuccess("");
    setConfigError("");
    try {
      await api.post("/agent/chat/config/reset");
      await loadConfig();
      setConfigSuccess("Configurações resetadas para o padrão.");
      setTimeout(() => setConfigSuccess(""), 3000);
    } catch {
      setConfigError("Erro ao resetar configurações.");
    } finally {
      setConfigSaving(false);
    }
  };

  const loadHistory = useCallback(async (page: number) => {
    setHistoryLoading(true);
    try {
      const { data } = await api.get(`/agent/chat/history?page=${page}&limit=15`);
      setHistorySessions(data.sessions || []);
      setHistoryPage(data.page || 1);
      setHistoryTotalPages(data.totalPages || 1);
    } catch {
      setHistorySessions([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "history") loadHistory(1);
    if (tab === "config" && isAdmin) loadConfig();
  }, [tab, isAdmin, loadConfig, loadHistory]);

  const loadSessionDetail = async (sid: string) => {
    setHistoryDetailLoading(true);
    try {
      setHistorySelectedMsg(null);
      const { data } = await api.get(`/agent/chat/history/${sid}`);
      setHistoryDetail(data);
    } catch {
      setHistoryDetail(null);
    } finally {
      setHistoryDetailLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-7.5rem)]">
      <div className="flex items-center gap-1 mb-3 border-b border-slate-800 pb-2">
        <button
          onClick={() => { setTab("history"); setHistoryDetail(null); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            tab === "history" ? "bg-blue-950/60 text-blue-300" : "text-slate-500 hover:text-slate-300 hover:bg-slate-900/50"
          }`}
        >
          <History className="h-4 w-4" /> Histórico
        </button>
        {isAdmin && (
          <button
            onClick={() => setTab("config")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === "config" ? "bg-blue-950/60 text-blue-300" : "text-slate-500 hover:text-slate-300 hover:bg-slate-900/50"
            }`}
          >
            <Settings className="h-4 w-4" /> Configurações
          </button>
        )}
      </div>

      {/* ─── History List ─── */}
      {tab === "history" && !historyDetail && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="mb-3 flex items-center justify-between">
            <h1 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <History className="h-5 w-5 text-blue-500" /> Histórico de Conversas
            </h1>
            <Button variant="outline" size="sm" onClick={() => loadHistory(historyPage)}>
              <RotateCcw className="h-3.5 w-3.5" /> Atualizar
            </Button>
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
              <input
                type="text" value={historySearch} onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Buscar por cliente, sistema ou mensagem..."
                className="w-full rounded-lg border border-slate-800 py-1.5 pl-9 pr-3 text-xs outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-500/30"
              />
            </div>
            <select
              value={historyStatusFilter} onChange={(e) => setHistoryStatusFilter(e.target.value)}
              className="rounded-lg border border-slate-800 bg-slate-900/90 px-3 py-1.5 text-xs outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-500/30"
            >
              <option value="">Todos os status</option>
              <option value="active">Ativo</option>
              <option value="resolved">Resolvido</option>
              <option value="escalated">Escalado</option>
            </select>
          </div>

          {historyLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
              <span className="ml-2 text-sm text-slate-500">Carregando...</span>
            </div>
          ) : (() => {
            const q = historySearch.toLowerCase().trim();
            const filtered = historySessions.filter((s) => {
              if (historyStatusFilter && s.status !== historyStatusFilter) return false;
              if (!q) return true;
              return (
                (s.customerName || "").toLowerCase().includes(q) ||
                (s.systemName || "").toLowerCase().includes(q) ||
                (s.lastMessage || "").toLowerCase().includes(q) ||
                (s.sessionId || "").toLowerCase().includes(q)
              );
            });
            if (filtered.length === 0) {
              return (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <MessageSquare className="h-16 w-16 text-slate-200 mb-4" />
                  <p className="text-sm font-medium text-slate-500">
                    {historySessions.length === 0 ? "Nenhuma conversa ainda" : "Nenhuma conversa encontrada"}
                  </p>
                </div>
              );
            }
            return (
              <>
                <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                  {filtered.map((s) => (
                    <div
                      key={s.sessionId} onClick={() => loadSessionDetail(s.sessionId)}
                      className="flex items-center gap-3 p-3 rounded-xl border border-slate-800 bg-slate-900/90 hover:border-blue-600/50 hover:shadow-sm cursor-pointer transition-all"
                    >
                      <div className="shrink-0">
                        <div className="h-9 w-9 rounded-full bg-blue-950/60 flex items-center justify-center ring-1 ring-blue-800/50">
                          <MessageSquare className="h-4 w-4 text-blue-500" />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-sm font-medium text-slate-200 truncate">{s.customerName}</span>
                          <span className="text-[11px] text-slate-500">{s.systemName}</span>
                          <StatusBadge status={s.status} />
                        </div>
                        <p className="text-xs text-slate-500 truncate">{s.lastMessage || "Sem mensagens"}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-[10px] text-slate-500 flex items-center gap-1"><Calendar className="h-3 w-3" />{formatDate(s.createdAt)}</span>
                          <span className="text-[10px] text-slate-500 flex items-center gap-1"><Hash className="h-3 w-3" />{s.messageCount} msgs</span>
                          {s.toolsUsed?.length > 0 && (
                            <span className="text-[10px] text-amber-500 flex items-center gap-1"><Wrench className="h-3 w-3" />{s.toolsUsed.length} tools</span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-slate-300" />
                    </div>
                  ))}
                </div>
                {historyTotalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 mt-3 pt-3 border-t border-slate-800">
                    <Button variant="outline" size="sm" disabled={historyPage <= 1} onClick={() => loadHistory(historyPage - 1)}>Anterior</Button>
                    <span className="text-xs text-slate-500">Pág. {historyPage}/{historyTotalPages}</span>
                    <Button variant="outline" size="sm" disabled={historyPage >= historyTotalPages} onClick={() => loadHistory(historyPage + 1)}>Próxima</Button>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* ─── History Detail ─── */}
      {tab === "history" && historyDetail && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="mb-3 flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => { setHistorySelectedMsg(null); setHistoryDetail(null); }}>
              <ArrowLeft className="h-4 w-4" /> Voltar
            </Button>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-200">{historyDetail.customerName}</span>
                <span className="text-xs text-slate-500">{historyDetail.systemName}</span>
                <StatusBadge status={historyDetail.status} />
              </div>
              <div className="flex items-center gap-3 mt-0.5">
                <span className="text-[10px] text-slate-500">ID: {historyDetail.sessionId.slice(0, 12)}...</span>
                <span className="text-[10px] text-slate-500">Criado em: {formatDate(historyDetail.createdAt)}</span>
                <span className="text-[10px] text-slate-500">Tentativas: {historyDetail.attemptCount}</span>
              </div>
            </div>
          </div>

          {historyDetail.toolsUsed?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {historyDetail.toolsUsed.map((t, i) => (
                <span key={i} className="rounded-full bg-amber-950/50 border border-amber-800/60 px-2 py-0.5 text-[10px] font-medium text-amber-300 flex items-center gap-1">
                  <Wrench className="h-2.5 w-2.5" />{t}
                </span>
              ))}
              {historyDetail.knowledgeSourcesUsed?.map((s, i) => (
                <span key={i} className="rounded-full bg-purple-950/50 border border-purple-800/60 px-2 py-0.5 text-[10px] font-medium text-purple-300 flex items-center gap-1">
                  <BookOpen className="h-2.5 w-2.5" />{s}
                </span>
              ))}
            </div>
          )}

          {historyDetailLoading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-blue-400" /></div>
          ) : (
            <div className="flex-1 overflow-y-auto rounded-xl border border-slate-800 bg-gradient-to-b from-slate-900/80 to-slate-950 p-4 space-y-3">
              {historyDetail.messages?.map((msg, i) => {
                const isUser = msg.role === "user";
                const isAgentSelected = !isUser && historySelectedMsg === i;
                return (
                  <div key={i} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                    <div className="max-w-[85%] min-w-0">
                      <button
                        type="button" disabled={isUser}
                        onClick={() => { if (!isUser) setHistorySelectedMsg(isAgentSelected ? null : i); }}
                        className={`w-full text-left rounded-2xl px-4 py-2.5 text-sm leading-relaxed transition-all ${
                          isUser
                            ? "rounded-tr-sm bg-blue-600 text-white cursor-default"
                            : `rounded-tl-sm bg-slate-900/90 text-slate-200 shadow-sm border ${
                                isAgentSelected ? "border-blue-500 ring-2 ring-blue-500/30" : "border-slate-800 hover:border-slate-700 cursor-pointer"
                              }`
                        }`}
                      >
                        {!isUser && (
                          <div className="mb-1 flex items-center justify-between gap-2 text-[10px] font-medium text-slate-500">
                            <span className="flex items-center gap-1"><Bot className="h-3 w-3" /> SmartFlow</span>
                            <span className="font-normal text-blue-500 opacity-80">ver fontes</span>
                          </div>
                        )}
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      </button>
                      {msg.timestamp && (
                        <div className={`px-1 mt-1 ${isUser ? "text-right" : ""}`}>
                          <span className="text-[10px] text-slate-300">{formatTime(msg.timestamp)}</span>
                        </div>
                      )}
                      {isAgentSelected && (
                        <div className="mt-2 rounded-xl border border-slate-800 bg-slate-900/50 p-3 shadow-sm">
                          <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">Fontes desta resposta</p>
                          <MessageSourcesPanel meta={msg.meta} />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── Config Tab ─── */}
      {tab === "config" && isAdmin && (
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl space-y-6">
            <div>
              <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                <Settings className="h-6 w-6 text-slate-500" /> Configurações da Triagem
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">Ajuste o comportamento, personalidade e parâmetros do agente</p>
            </div>

            {configLoading ? (
              <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-blue-400" /></div>
            ) : !agentConfig ? (
              <div className="text-center py-16 text-slate-500">
                <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                <p>Não foi possível carregar as configurações.</p>
              </div>
            ) : (
              <>
                {configError && <div className="rounded-lg border border-red-800/60 bg-red-950/40 px-4 py-3 text-sm text-red-300">{configError}</div>}
                {configSuccess && (
                  <div className="flex items-center gap-2 rounded-lg border border-emerald-800/60 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-300">
                    <Check className="h-4 w-4" />{configSuccess}
                  </div>
                )}

                <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-5">
                  <h3 className="text-base font-semibold text-slate-100 mb-4">Parâmetros Gerais</h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-300">Nome do Agente</label>
                      <input type="text" value={agentConfig.agentDisplayName}
                        onChange={(e) => setAgentConfig({ ...agentConfig, agentDisplayName: e.target.value })}
                        className="w-full rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-sm text-slate-200 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
                      <p className="mt-1 text-[11px] text-slate-500">Nome exibido nas mensagens espelhadas</p>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-300">Delay de Buffer (ms)</label>
                      <input type="number" value={agentConfig.bufferDelayMs} min={0} max={30000}
                        onChange={(e) => setAgentConfig({ ...agentConfig, bufferDelayMs: parseInt(e.target.value) || 0 })}
                        className="w-full rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-sm text-slate-200 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
                      <p className="mt-1 text-[11px] text-slate-500">Tempo de espera antes de processar</p>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-300">Modelo LLM</label>
                      <input type="text" value={agentConfig.chatModel}
                        onChange={(e) => setAgentConfig({ ...agentConfig, chatModel: e.target.value })}
                        className="w-full rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-sm text-slate-200 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
                      <p className="mt-1 text-[11px] text-slate-500">Ex: gpt-4o, gpt-4o-mini</p>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-300">Máximo de Tentativas</label>
                      <input type="number" value={agentConfig.maxAttempts} min={1} max={10}
                        onChange={(e) => setAgentConfig({ ...agentConfig, maxAttempts: parseInt(e.target.value) || 3 })}
                        className="w-full rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-sm text-slate-200 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
                      <p className="mt-1 text-[11px] text-slate-500">Antes de escalar para analista humano</p>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-300">Máximo de Iterações (Tools)</label>
                      <input type="number" value={agentConfig.maxToolIterations} min={1} max={20}
                        onChange={(e) => setAgentConfig({ ...agentConfig, maxToolIterations: parseInt(e.target.value) || 5 })}
                        className="w-full rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-sm text-slate-200 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
                      <p className="mt-1 text-[11px] text-slate-500">Ciclos de raciocínio + tools por mensagem</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-5">
                  <h3 className="text-base font-semibold text-slate-100 mb-1">Instruções Adicionais</h3>
                  <p className="text-xs text-slate-500 mb-3">Instruções extras adicionadas ao final do prompt.</p>
                  <textarea value={agentConfig.customInstructions}
                    onChange={(e) => setAgentConfig({ ...agentConfig, customInstructions: e.target.value })}
                    rows={4} placeholder="Ex: Sempre pergunte o nome do município antes de sugerir soluções."
                    className="w-full rounded-lg border border-slate-700 bg-slate-950/50 px-4 py-3 text-sm text-slate-200 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-mono" />
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-5">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-base font-semibold text-slate-100">Prompt do Sistema</h3>
                    <span className="text-[11px] text-slate-500 font-mono">{agentConfig.systemPrompt.length} caracteres</span>
                  </div>
                  <p className="text-xs text-slate-500 mb-3">Prompt principal que define a personalidade e comportamento do agente.</p>
                  <textarea value={agentConfig.systemPrompt}
                    onChange={(e) => setAgentConfig({ ...agentConfig, systemPrompt: e.target.value })}
                    rows={20}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950/50 px-4 py-3 text-sm text-slate-200 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-mono leading-relaxed" />
                </div>

                <div className="flex items-center justify-between pb-4">
                  <button onClick={resetConfig} disabled={configSaving}
                    className="flex items-center gap-2 rounded-lg border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-900/50 disabled:opacity-60">
                    <RotateCw className="h-4 w-4" /> Resetar para Padrão
                  </button>
                  <button onClick={saveConfig} disabled={configSaving}
                    className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60">
                    {configSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Salvar Configurações
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
