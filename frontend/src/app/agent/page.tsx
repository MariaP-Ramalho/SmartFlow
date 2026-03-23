"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Bot,
  Send,
  RotateCcw,
  Brain,
  Wrench,
  BookOpen,
  AlertCircle,
  Clock,
  ChevronRight,
  Loader2,
  Zap,
  Search,
  ArrowRight,
  History,
  MessageSquare,
  ArrowLeft,
  Calendar,
  Hash,
  Settings,
  Save,
  RotateCw,
  Check,
} from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/auth-provider";

interface ReasoningStep {
  type: "thinking" | "tool_call" | "tool_result" | "knowledge_hit" | "llm_response" | "phase_change" | "error";
  timestamp: string;
  durationMs?: number;
  content: string;
  details?: Record<string, any>;
}

interface ChatMessage {
  role: "user" | "agent";
  content: string;
  timestamp: string;
  reasoningSteps?: ReasoningStep[];
  toolsUsed?: string[];
  knowledgeSources?: string[];
  durationMs?: number;
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
  messages: { role: string; content: string; timestamp: string }[];
  toolsUsed: string[];
  knowledgeSourcesUsed: string[];
  status: string;
  attemptCount: number;
  createdAt: string;
  updatedAt: string;
}

const STEP_ICONS: Record<string, typeof Brain> = {
  thinking: Brain,
  tool_call: Wrench,
  tool_result: ArrowRight,
  knowledge_hit: BookOpen,
  llm_response: Zap,
  phase_change: ChevronRight,
  error: AlertCircle,
};

const STEP_COLORS: Record<string, string> = {
  thinking: "text-blue-500 bg-blue-50 border-blue-200",
  tool_call: "text-amber-600 bg-amber-50 border-amber-200",
  tool_result: "text-emerald-600 bg-emerald-50 border-emerald-200",
  knowledge_hit: "text-purple-600 bg-purple-50 border-purple-200",
  llm_response: "text-cyan-600 bg-cyan-50 border-cyan-200",
  phase_change: "text-indigo-600 bg-indigo-50 border-indigo-200",
  error: "text-red-600 bg-red-50 border-red-200",
};

const STEP_LABELS: Record<string, string> = {
  thinking: "Raciocínio",
  tool_call: "Chamada de Ferramenta",
  tool_result: "Resultado da Ferramenta",
  knowledge_hit: "Conhecimento Encontrado",
  llm_response: "Resposta Final",
  phase_change: "Mudança de Fase",
  error: "Erro",
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
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

function StepItem({ step }: { step: ReasoningStep }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = STEP_ICONS[step.type] || Brain;
  const colors = STEP_COLORS[step.type] || STEP_COLORS.thinking;
  const label = STEP_LABELS[step.type] || step.type;

  return (
    <div
      className={`rounded-lg border p-3 transition-all cursor-pointer hover:shadow-sm ${colors}`}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-start gap-2">
        <div className="mt-0.5 shrink-0">
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wider opacity-70">
              {label}
            </span>
            {step.durationMs != null && (
              <span className="text-[10px] opacity-50 flex items-center gap-0.5">
                <Clock className="h-2.5 w-2.5" />
                {step.durationMs}ms
              </span>
            )}
          </div>
          <p className="text-xs leading-relaxed opacity-90">{step.content}</p>

          {expanded && step.details && (
            <div className="mt-2 rounded-md bg-white/60 p-2 text-[11px] font-mono overflow-x-auto border border-current/10">
              <pre className="whitespace-pre-wrap break-words">
                {JSON.stringify(step.details, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-green-50 text-green-700 border-green-200",
    resolved: "bg-blue-50 text-blue-700 border-blue-200",
    escalated: "bg-amber-50 text-amber-700 border-amber-200",
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
  const [tab, setTab] = useState<"chat" | "history" | "config">("chat");

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [selectedMsg, setSelectedMsg] = useState<number | null>(null);
  const [systemName, setSystemName] = useState("Sistema de Teste");
  const [customerName, setCustomerName] = useState("Usuário Teste");
  const [buffering, setBuffering] = useState(false);
  const [bufferCountdown, setBufferCountdown] = useState(0);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messageBuffer = useRef<string[]>([]);
  const bufferTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const [historySessions, setHistorySessions] = useState<HistorySession[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyDetail, setHistoryDetail] = useState<HistoryDetail | null>(null);
  const [historyDetailLoading, setHistoryDetailLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotalPages, setHistoryTotalPages] = useState(1);

  // Config state
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

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (tab === "history") {
      loadHistory(1);
    }
    if (tab === "config" && isAdmin) {
      loadConfig();
    }
  }, [tab, isAdmin, loadConfig]);

  const loadHistory = async (page: number) => {
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
  };

  const loadSessionDetail = async (sid: string) => {
    setHistoryDetailLoading(true);
    try {
      const { data } = await api.get(`/agent/chat/history/${sid}`);
      setHistoryDetail(data);
    } catch {
      setHistoryDetail(null);
    } finally {
      setHistoryDetailLoading(false);
    }
  };

  const BUFFER_DELAY_MS = 4000;

  const flushBuffer = useCallback(async () => {
    if (messageBuffer.current.length === 0) return;

    const combinedText = messageBuffer.current.join("\n");
    messageBuffer.current = [];
    setBuffering(false);
    setBufferCountdown(0);
    if (countdownInterval.current) {
      clearInterval(countdownInterval.current);
      countdownInterval.current = null;
    }

    setSending(true);

    try {
      const { data } = await api.post("/agent/chat", {
        message: combinedText,
        sessionId: sessionId || undefined,
        systemName,
        customerName,
      });

      if (data.sessionId && !sessionId) {
        setSessionId(data.sessionId);
      }

      const agentMsg: ChatMessage = {
        role: "agent",
        content: data.reply,
        timestamp: new Date().toISOString(),
        reasoningSteps: data.reasoningSteps || [],
        toolsUsed: data.toolsUsed || [],
        knowledgeSources: data.knowledgeSourcesUsed || [],
        durationMs: data.totalDurationMs,
      };

      setMessages((prev) => {
        const updated = [...prev, agentMsg];
        setSelectedMsg(updated.length - 1);
        return updated;
      });
    } catch (err) {
      const errorMsg: ChatMessage = {
        role: "agent",
        content: "Erro ao comunicar com o agente. Verifique se o backend está rodando.",
        timestamp: new Date().toISOString(),
        reasoningSteps: [
          {
            type: "error",
            timestamp: new Date().toISOString(),
            content: `Erro de comunicação: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }, [sessionId, systemName, customerName, messages.length]);

  const sendMessage = useCallback(() => {
    const text = input.trim();
    if (!text || sending) return;

    const userMsg: ChatMessage = {
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");

    messageBuffer.current.push(text);
    setBuffering(true);

    if (bufferTimer.current) {
      clearTimeout(bufferTimer.current);
    }
    if (countdownInterval.current) {
      clearInterval(countdownInterval.current);
    }

    setBufferCountdown(BUFFER_DELAY_MS);
    const startTime = Date.now();
    countdownInterval.current = setInterval(() => {
      const remaining = Math.max(0, BUFFER_DELAY_MS - (Date.now() - startTime));
      setBufferCountdown(remaining);
      if (remaining <= 0 && countdownInterval.current) {
        clearInterval(countdownInterval.current);
        countdownInterval.current = null;
      }
    }, 100);

    bufferTimer.current = setTimeout(() => {
      bufferTimer.current = null;
      flushBuffer();
    }, BUFFER_DELAY_MS);

    inputRef.current?.focus();
  }, [input, sending, flushBuffer]);

  const resetChat = useCallback(async () => {
    if (sessionId) {
      try {
        await api.post("/agent/chat/reset", { sessionId });
      } catch {}
    }
    setMessages([]);
    setSessionId(null);
    setSelectedMsg(null);
    inputRef.current?.focus();
  }, [sessionId]);

  const selectedSteps = selectedMsg !== null ? messages[selectedMsg]?.reasoningSteps : undefined;

  return (
    <div className="flex flex-col h-[calc(100vh-2rem)]">
      {/* Tab bar */}
      <div className="flex items-center gap-1 mb-3 border-b border-slate-200 pb-2">
        <button
          onClick={() => { setTab("chat"); setHistoryDetail(null); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            tab === "chat"
              ? "bg-blue-50 text-blue-700"
              : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
          }`}
        >
          <MessageSquare className="h-4 w-4" />
          Chat
        </button>
        <button
          onClick={() => setTab("history")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            tab === "history"
              ? "bg-blue-50 text-blue-700"
              : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
          }`}
        >
          <History className="h-4 w-4" />
          Histórico
        </button>
        {isAdmin && (
          <button
            onClick={() => setTab("config")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === "config"
                ? "bg-blue-50 text-blue-700"
                : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
            }`}
          >
            <Settings className="h-4 w-4" />
            Configurações
          </button>
        )}
      </div>

      {tab === "chat" && (
        <div className="flex flex-1 gap-4 min-h-0">
          {/* Left: Chat */}
          <div className="flex w-1/2 flex-col min-w-0">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <Bot className="h-6 w-6 text-blue-500" />
                  Agente Resolve
                </h1>
                <p className="text-xs text-slate-400 mt-0.5">
                  {sessionId ? `Sessão: ${sessionId.slice(0, 8)}...` : "Nova conversa"}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={resetChat}>
                <RotateCcw className="h-3.5 w-3.5" />
                Nova Conversa
              </Button>
            </div>

            <div className="mb-3 flex gap-2">
              <input
                type="text"
                value={systemName}
                onChange={(e) => setSystemName(e.target.value)}
                placeholder="Nome do sistema"
                className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-blue-400"
              />
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Nome do cliente"
                className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-blue-400"
              />
            </div>

            <div className="flex-1 overflow-y-auto rounded-xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-4 space-y-3">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <Bot className="h-16 w-16 text-slate-200 mb-4" />
                  <p className="text-sm font-medium text-slate-400">
                    Envie uma mensagem para começar
                  </p>
                  <p className="text-xs text-slate-300 mt-1 max-w-xs">
                    O agente irá responder e você poderá ver os passos de raciocínio no painel ao lado
                  </p>
                </div>
              )}

              {messages.map((msg, i) => {
                const isUser = msg.role === "user";
                const isSelected = selectedMsg === i;
                const hasSteps = msg.reasoningSteps && msg.reasoningSteps.length > 0;

                return (
                  <div key={i} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[85%] group cursor-pointer transition-all ${
                        isSelected && !isUser ? "scale-[1.01]" : ""
                      }`}
                      onClick={() => !isUser && hasSteps && setSelectedMsg(isSelected ? null : i)}
                    >
                      <div
                        className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                          isUser
                            ? "rounded-tr-sm bg-blue-600 text-white"
                            : `rounded-tl-sm bg-white text-slate-800 shadow-sm border ${
                                isSelected ? "border-blue-300 ring-2 ring-blue-100" : "border-slate-100"
                              }`
                        }`}
                      >
                        {!isUser && (
                          <div className="mb-1 flex items-center gap-1 text-[10px] font-medium text-slate-400">
                            <Bot className="h-3 w-3" /> Resolve
                          </div>
                        )}
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      </div>

                      <div className={`flex items-center gap-2 px-1 mt-1 ${isUser ? "justify-end" : ""}`}>
                        <span className="text-[10px] text-slate-300">{formatTime(msg.timestamp)}</span>
                        {msg.durationMs != null && (
                          <span className="text-[10px] text-slate-300 flex items-center gap-0.5">
                            <Clock className="h-2.5 w-2.5" />
                            {(msg.durationMs / 1000).toFixed(1)}s
                          </span>
                        )}
                        {msg.toolsUsed && msg.toolsUsed.length > 0 && (
                          <span className="text-[10px] text-amber-400 flex items-center gap-0.5">
                            <Wrench className="h-2.5 w-2.5" />
                            {msg.toolsUsed.length}
                          </span>
                        )}
                        {hasSteps && !isUser && (
                          <span className="text-[10px] text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity">
                            clique para ver raciocínio
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {buffering && !sending && (
                <div className="flex justify-center">
                  <div className="rounded-full bg-amber-50 border border-amber-200 px-4 py-1.5">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                      <span className="text-xs text-amber-600">
                        Aguardando mais mensagens... {(bufferCountdown / 1000).toFixed(1)}s
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {sending && (
                <div className="flex justify-start">
                  <div className="rounded-2xl rounded-tl-sm bg-white px-4 py-3 shadow-sm border border-slate-100">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                      <span className="text-xs text-slate-400">Agente pensando...</span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            <div className="mt-3 flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
                placeholder="Digite sua mensagem..."
                disabled={sending}
                className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:opacity-50 disabled:bg-slate-50"
              />
              <Button onClick={sendMessage} disabled={sending || !input.trim()} className="rounded-xl px-4">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {/* Right: Reasoning Panel */}
          <div className="flex w-1/2 flex-col min-w-0">
            <div className="mb-3">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Brain className="h-5 w-5 text-purple-500" />
                Raciocínio do Agente
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Clique em uma mensagem do agente para ver os passos
              </p>
            </div>

            <div className="flex-1 overflow-y-auto rounded-xl border border-slate-200 bg-white p-4">
              {!selectedSteps || selectedSteps.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <Search className="h-12 w-12 text-slate-200 mb-3" />
                  <p className="text-sm font-medium text-slate-400">
                    Selecione uma mensagem do agente
                  </p>
                  <p className="text-xs text-slate-300 mt-1 max-w-xs">
                    Os passos de raciocínio, buscas de conhecimento e chamadas de ferramentas aparecerão aqui
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
                    <span className="text-xs font-medium text-slate-500">
                      {selectedSteps.length} passo(s) de raciocínio
                    </span>
                    {selectedMsg !== null && messages[selectedMsg]?.durationMs != null && (
                      <span className="text-xs text-slate-400 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Tempo total: {((messages[selectedMsg].durationMs || 0) / 1000).toFixed(1)}s
                      </span>
                    )}
                  </div>

                  {selectedMsg !== null && messages[selectedMsg] && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {messages[selectedMsg].toolsUsed?.map((t, i) => (
                        <span
                          key={i}
                          className="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-medium text-amber-700 flex items-center gap-1"
                        >
                          <Wrench className="h-2.5 w-2.5" />
                          {t}
                        </span>
                      ))}
                      {messages[selectedMsg].knowledgeSources?.map((s, i) => (
                        <span
                          key={i}
                          className="rounded-full bg-purple-50 border border-purple-200 px-2 py-0.5 text-[10px] font-medium text-purple-700 flex items-center gap-1"
                        >
                          <BookOpen className="h-2.5 w-2.5" />
                          {s}
                        </span>
                      ))}
                    </div>
                  )}

                  {selectedSteps.map((step, i) => (
                    <StepItem key={i} step={step} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === "history" && !historyDetail && (
        <div className="flex-1 overflow-y-auto">
          <div className="mb-4 flex items-center justify-between">
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <History className="h-6 w-6 text-blue-500" />
              Histórico de Conversas
            </h1>
            <Button variant="outline" size="sm" onClick={() => loadHistory(historyPage)}>
              <RotateCcw className="h-3.5 w-3.5" />
              Atualizar
            </Button>
          </div>

          {historyLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
              <span className="ml-2 text-sm text-slate-400">Carregando...</span>
            </div>
          ) : historySessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <MessageSquare className="h-16 w-16 text-slate-200 mb-4" />
              <p className="text-sm font-medium text-slate-400">Nenhuma conversa ainda</p>
              <p className="text-xs text-slate-300 mt-1">
                Inicie uma conversa na aba Chat para ver o histórico aqui
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {historySessions.map((s) => (
                  <div
                    key={s.sessionId}
                    onClick={() => loadSessionDetail(s.sessionId)}
                    className="flex items-center gap-4 p-4 rounded-xl border border-slate-200 bg-white hover:border-blue-200 hover:shadow-sm cursor-pointer transition-all"
                  >
                    <div className="shrink-0">
                      <div className="h-10 w-10 rounded-full bg-blue-50 flex items-center justify-center">
                        <MessageSquare className="h-5 w-5 text-blue-500" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-slate-800 truncate">
                          {s.customerName}
                        </span>
                        <span className="text-xs text-slate-400">{s.systemName}</span>
                        <StatusBadge status={s.status} />
                      </div>
                      <p className="text-xs text-slate-500 truncate">{s.lastMessage || "Sem mensagens"}</p>
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="text-[10px] text-slate-400 flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDate(s.createdAt)}
                        </span>
                        <span className="text-[10px] text-slate-400 flex items-center gap-1">
                          <Hash className="h-3 w-3" />
                          {s.messageCount} msgs
                        </span>
                        {s.toolsUsed?.length > 0 && (
                          <span className="text-[10px] text-amber-500 flex items-center gap-1">
                            <Wrench className="h-3 w-3" />
                            {s.toolsUsed.length} tools
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-300" />
                  </div>
                ))}
              </div>

              {historyTotalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={historyPage <= 1}
                    onClick={() => loadHistory(historyPage - 1)}
                  >
                    Anterior
                  </Button>
                  <span className="text-xs text-slate-400">
                    Página {historyPage} de {historyTotalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={historyPage >= historyTotalPages}
                    onClick={() => loadHistory(historyPage + 1)}
                  >
                    Próxima
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {tab === "history" && historyDetail && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="mb-3 flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setHistoryDetail(null)}
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Button>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-800">
                  {historyDetail.customerName}
                </span>
                <span className="text-xs text-slate-400">{historyDetail.systemName}</span>
                <StatusBadge status={historyDetail.status} />
              </div>
              <div className="flex items-center gap-3 mt-0.5">
                <span className="text-[10px] text-slate-400">
                  ID: {historyDetail.sessionId.slice(0, 12)}...
                </span>
                <span className="text-[10px] text-slate-400">
                  Criado em: {formatDate(historyDetail.createdAt)}
                </span>
                <span className="text-[10px] text-slate-400">
                  Tentativas: {historyDetail.attemptCount}
                </span>
              </div>
            </div>
          </div>

          {historyDetail.toolsUsed?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {historyDetail.toolsUsed.map((t, i) => (
                <span
                  key={i}
                  className="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-medium text-amber-700 flex items-center gap-1"
                >
                  <Wrench className="h-2.5 w-2.5" />
                  {t}
                </span>
              ))}
              {historyDetail.knowledgeSourcesUsed?.map((s, i) => (
                <span
                  key={i}
                  className="rounded-full bg-purple-50 border border-purple-200 px-2 py-0.5 text-[10px] font-medium text-purple-700 flex items-center gap-1"
                >
                  <BookOpen className="h-2.5 w-2.5" />
                  {s}
                </span>
              ))}
            </div>
          )}

          {historyDetailLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto rounded-xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-4 space-y-3">
              {historyDetail.messages?.map((msg, i) => {
                const isUser = msg.role === "user";
                return (
                  <div key={i} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                    <div className="max-w-[75%]">
                      <div
                        className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                          isUser
                            ? "rounded-tr-sm bg-blue-600 text-white"
                            : "rounded-tl-sm bg-white text-slate-800 shadow-sm border border-slate-100"
                        }`}
                      >
                        {!isUser && (
                          <div className="mb-1 flex items-center gap-1 text-[10px] font-medium text-slate-400">
                            <Bot className="h-3 w-3" /> Resolve
                          </div>
                        )}
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      </div>
                      {msg.timestamp && (
                        <div className={`px-1 mt-1 ${isUser ? "text-right" : ""}`}>
                          <span className="text-[10px] text-slate-300">
                            {formatTime(msg.timestamp)}
                          </span>
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

      {/* Config Tab */}
      {tab === "config" && isAdmin && (
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <Settings className="h-6 w-6 text-slate-600" />
                  Configurações do Agente
                </h1>
                <p className="text-xs text-slate-400 mt-0.5">
                  Ajuste o comportamento, personalidade e parâmetros do agente
                </p>
              </div>
            </div>

            {configLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
              </div>
            ) : !agentConfig ? (
              <div className="text-center py-16 text-slate-400">
                <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                <p>Não foi possível carregar as configurações.</p>
              </div>
            ) : (
              <>
                {configError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {configError}
                  </div>
                )}
                {configSuccess && (
                  <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                    <Check className="h-4 w-4" />
                    {configSuccess}
                  </div>
                )}

                {/* Parameters */}
                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <h3 className="text-base font-semibold text-slate-900 mb-4">Parâmetros Gerais</h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">
                        Nome do Agente
                      </label>
                      <input
                        type="text"
                        value={agentConfig.agentDisplayName}
                        onChange={(e) =>
                          setAgentConfig({ ...agentConfig, agentDisplayName: e.target.value })
                        }
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      />
                      <p className="mt-1 text-[11px] text-slate-400">
                        Nome exibido nas mensagens espelhadas
                      </p>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">
                        Delay de Buffer (ms)
                      </label>
                      <input
                        type="number"
                        value={agentConfig.bufferDelayMs}
                        onChange={(e) =>
                          setAgentConfig({ ...agentConfig, bufferDelayMs: parseInt(e.target.value) || 0 })
                        }
                        min={0}
                        max={30000}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      />
                      <p className="mt-1 text-[11px] text-slate-400">
                        Tempo de espera antes de processar (concatena mensagens)
                      </p>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">
                        Modelo LLM
                      </label>
                      <input
                        type="text"
                        value={agentConfig.chatModel}
                        onChange={(e) =>
                          setAgentConfig({ ...agentConfig, chatModel: e.target.value })
                        }
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      />
                      <p className="mt-1 text-[11px] text-slate-400">
                        Ex: gpt-4o, gpt-5.2, claude-3-opus
                      </p>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">
                        Máximo de Tentativas
                      </label>
                      <input
                        type="number"
                        value={agentConfig.maxAttempts}
                        onChange={(e) =>
                          setAgentConfig({ ...agentConfig, maxAttempts: parseInt(e.target.value) || 3 })
                        }
                        min={1}
                        max={10}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      />
                      <p className="mt-1 text-[11px] text-slate-400">
                        Tentativas antes de escalar para analista humano
                      </p>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">
                        Máximo de Iterações (Tools)
                      </label>
                      <input
                        type="number"
                        value={agentConfig.maxToolIterations}
                        onChange={(e) =>
                          setAgentConfig({ ...agentConfig, maxToolIterations: parseInt(e.target.value) || 5 })
                        }
                        min={1}
                        max={20}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      />
                      <p className="mt-1 text-[11px] text-slate-400">
                        Ciclos de raciocínio + tools por mensagem
                      </p>
                    </div>
                  </div>
                </div>

                {/* Custom Instructions */}
                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <h3 className="text-base font-semibold text-slate-900 mb-1">
                    Instruções Adicionais
                  </h3>
                  <p className="text-xs text-slate-400 mb-3">
                    Instruções extras que serão adicionadas ao final do prompt. Use para ajustes rápidos sem alterar o prompt principal.
                  </p>
                  <textarea
                    value={agentConfig.customInstructions}
                    onChange={(e) =>
                      setAgentConfig({ ...agentConfig, customInstructions: e.target.value })
                    }
                    rows={4}
                    placeholder="Ex: Sempre pergunte o nome do município antes de sugerir soluções."
                    className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-mono"
                  />
                </div>

                {/* System Prompt */}
                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-base font-semibold text-slate-900">
                      Prompt do Sistema
                    </h3>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {agentConfig.systemPrompt.length} caracteres
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mb-3">
                    Prompt principal que define a personalidade e comportamento do agente. Variáveis disponíveis:{" "}
                    <code className="text-[11px] bg-slate-100 px-1 rounded">{"{{systemName}}"}</code>,{" "}
                    <code className="text-[11px] bg-slate-100 px-1 rounded">{"{{customerName}}"}</code>,{" "}
                    <code className="text-[11px] bg-slate-100 px-1 rounded">{"{{attemptCount}}"}</code>
                  </p>
                  <textarea
                    value={agentConfig.systemPrompt}
                    onChange={(e) =>
                      setAgentConfig({ ...agentConfig, systemPrompt: e.target.value })
                    }
                    rows={20}
                    className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-mono leading-relaxed"
                  />
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between pb-4">
                  <button
                    onClick={resetConfig}
                    disabled={configSaving}
                    className="flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60"
                  >
                    <RotateCw className="h-4 w-4" />
                    Resetar para Padrão
                  </button>
                  <button
                    onClick={saveConfig}
                    disabled={configSaving}
                    className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
                  >
                    {configSaving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
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
