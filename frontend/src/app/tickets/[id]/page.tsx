"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import api from "@/lib/api";
import {
  ArrowLeft,
  User,
  Mail,
  Building2,
  Bot,
  Send,
  ArrowUpRight,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  BookOpen,
  AlertTriangle,
  Activity,
  Shield,
  Target,
  Brain,
  FileText,
  ChevronDown,
  ChevronUp,
  Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

// ─── Types ────────────────────────────────────────────────────

interface ConversationMessage {
  role: "agent" | "customer" | "system";
  content: string;
  timestamp: string;
  metadata?: {
    phase?: string;
    attemptNumber?: number;
    toolsUsed?: string[];
    knowledgeRefs?: string[];
    confidence?: number;
    riskLevel?: string;
  };
}

interface SolutionAttempt {
  attemptNumber: number;
  solution: string;
  knowledgeSourcesUsed: string[];
  clientFeedback?: string;
  outcome: "pending" | "success" | "failed";
  decisionTrace: string;
  proposedAt: string;
  resolvedAt?: string;
}

interface KnowledgeHit {
  documentId: string;
  source: string;
  title: string;
  relevanceScore?: number;
  consultedAt: string;
  usedInAttempt?: number;
}

interface EscalationRecord {
  type: "human" | "dev";
  reason: string;
  clickupTaskId?: string;
  clickupUrl?: string;
  handoffAnalystId?: number;
  escalatedAt: string;
}

interface TicketDetail {
  _id: string;
  id?: string;
  clickupId?: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  category?: string;
  tags: string[];
  customer?: {
    name: string;
    email: string;
    phone?: string;
    company?: string;
    tier?: string;
  };
  systemName?: string;
  zapflowAteId?: number;
  conversationPhase?: string;
  attemptCount?: number;
  evidenceStatus?: string;
  conversation: ConversationMessage[];
  attempts: SolutionAttempt[];
  knowledgeHits: KnowledgeHit[];
  escalations: EscalationRecord[];
  decisionTrace: string[];
  createdAt: string;
  updatedAt: string;
}

const statusMap: Record<string, { label: string; color: string }> = {
  open: { label: "Aberto", color: "bg-blue-100 text-blue-700" },
  in_progress: { label: "Em Progresso", color: "bg-amber-100 text-amber-700" },
  waiting_customer: { label: "Aguard. Cliente", color: "bg-orange-100 text-orange-700" },
  waiting_approval: { label: "Aguard. Aprovação", color: "bg-purple-100 text-purple-700" },
  resolved: { label: "Resolvido", color: "bg-emerald-100 text-emerald-700" },
  closed: { label: "Fechado", color: "bg-slate-100 text-slate-600" },
  escalated: { label: "Escalado", color: "bg-red-100 text-red-700" },
};

const phaseMap: Record<string, { label: string; color: string }> = {
  greeting: { label: "Saudação", color: "bg-sky-100 text-sky-700" },
  understanding: { label: "Compreensão", color: "bg-blue-100 text-blue-700" },
  collecting_evidence: { label: "Coletando Evidência", color: "bg-amber-100 text-amber-700" },
  validating: { label: "Validando", color: "bg-indigo-100 text-indigo-700" },
  diagnosing: { label: "Diagnosticando", color: "bg-purple-100 text-purple-700" },
  proposing_solution: { label: "Propondo Solução", color: "bg-teal-100 text-teal-700" },
  awaiting_confirmation: { label: "Aguard. Confirmação", color: "bg-orange-100 text-orange-700" },
  closing: { label: "Fechamento", color: "bg-emerald-100 text-emerald-700" },
  escalated_human: { label: "Escalado (Humano)", color: "bg-red-100 text-red-700" },
  escalated_dev: { label: "Escalado (Dev)", color: "bg-red-100 text-red-700" },
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ─── Chat Bubble ──────────────────────────────────────────────

function ChatBubble({ msg }: { msg: ConversationMessage }) {
  const isAgent = msg.role === "agent";
  const isSystem = msg.role === "system";

  if (isSystem) {
    return (
      <div className="flex justify-center py-2">
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500">
          {msg.content}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex ${isAgent ? "justify-start" : "justify-end"}`}>
      <div className={`max-w-[80%] space-y-1`}>
        <div
          className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
            isAgent
              ? "rounded-tl-sm bg-white text-slate-800 shadow-sm border border-slate-100"
              : "rounded-tr-sm bg-blue-600 text-white"
          }`}
        >
          {isAgent && (
            <div className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-400">
              <Bot className="h-3 w-3" /> Resolve
            </div>
          )}
          <p className="whitespace-pre-wrap">{msg.content}</p>
        </div>
        <div className={`flex items-center gap-2 px-1 ${isAgent ? "" : "justify-end"}`}>
          <span className="text-[10px] text-slate-400">{formatTime(msg.timestamp)}</span>
          {msg.metadata?.confidence !== undefined && isAgent && (
            <span className="text-[10px] text-slate-400">
              conf: {Math.round(msg.metadata.confidence * 100)}%
            </span>
          )}
          {msg.metadata?.toolsUsed && msg.metadata.toolsUsed.length > 0 && (
            <span className="text-[10px] text-slate-400">
              tools: {msg.metadata.toolsUsed.join(", ")}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────

export default function TicketDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [testMessage, setTestMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [showDecisionTrace, setShowDecisionTrace] = useState(false);
  const [showKnowledgeHits, setShowKnowledgeHits] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const isZapFlow = typeof params.id === "string" && (params.id as string).startsWith("zf-");
  const zapFlowId = isZapFlow ? (params.id as string).replace("zf-", "") : null;

  const fetchTicket = useCallback(async () => {
    try {
      if (zapFlowId) {
        const { data } = await api.get(`/zapflow/atendimentos/${zapFlowId}`);
        if (data.error) { setError(data.error); return; }
        const a = data.atendimento;
        const interacoes = (data.interacoes || []).map((i: any) => ({
          role: i.z90_int_id_tipo_remetente === 3 ? "agent" as const :
                i.z90_int_id_tipo_remetente === 2 ? "customer" as const : "system" as const,
          content: i.z90_int_conteudo_mensagem || "",
          timestamp: i.z90_int_data_hora_envio || new Date().toISOString(),
        }));
        setTicket({
          _id: `zf-${a.z90_ate_id}`,
          title: a.z90_ate_resumo_do_problema || `Atendimento #${a.z90_ate_id}`,
          description: a.z90_ate_descricao || a.z90_ate_resumo_do_problema || "",
          status: a.z90_ate_data_fechamento ? "resolved" : "open",
          priority: "medium",
          tags: [],
          customer: {
            name: data.entidade?.z90_ent_razao_social || "Cliente",
            email: data.entidade?.z90_ent_email_principal || "",
            phone: data.entidade?.z90_ent_telefone_principal || "",
            company: data.entidade?.z90_ent_razao_social || "",
          },
          systemName: data.sistema?.z90_sis_nome_sistema || undefined,
          zapflowAteId: a.z90_ate_id,
          conversationPhase: a.z90_ate_data_fechamento ? "closing" : "understanding",
          attemptCount: 0,
          evidenceStatus: "not_required",
          conversation: interacoes,
          attempts: [],
          knowledgeHits: [],
          escalations: [],
          decisionTrace: [],
          createdAt: a.z90_ate_data_abertura || new Date().toISOString(),
          updatedAt: a.z90_ate_data_abertura || new Date().toISOString(),
        });
      } else {
        const { data } = await api.get(`/tickets/${params.id}`);
        const t = data._id ? data : { ...data, _id: data.id };
        setTicket(t);
      }
    } catch {
      setError("Erro ao carregar ticket");
    } finally {
      setLoading(false);
    }
  }, [params.id, zapFlowId]);

  useEffect(() => {
    if (params.id) fetchTicket();
  }, [params.id, fetchTicket]);

  useEffect(() => {
    const interval = setInterval(fetchTicket, 10000);
    return () => clearInterval(interval);
  }, [fetchTicket]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [ticket?.conversation]);

  async function sendTestMessage() {
    if (!testMessage.trim() || !ticket) return;
    setSending(true);
    try {
      await api.post("/agent/webhook/incoming", {
        zapflowAteId: ticket.zapflowAteId || 0,
        customerPhone: ticket.customer?.phone || "test",
        customerName: ticket.customer?.name || "Teste",
        systemName: ticket.systemName || "Teste",
        message: testMessage,
        isNewConversation: (ticket.conversation?.length || 0) === 0,
      });
      setTestMessage("");
      await fetchTicket();
    } catch (err) {
      console.error("Failed to send test message", err);
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="space-y-4">
        <button onClick={() => router.back()} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </button>
        <div className="flex items-center justify-center py-20">
          <p className="text-red-500">{error || "Ticket não encontrado"}</p>
        </div>
      </div>
    );
  }

  const phase = phaseMap[ticket.conversationPhase || "greeting"] || { label: ticket.conversationPhase, color: "bg-slate-100 text-slate-600" };
  const status = statusMap[ticket.status] || { label: ticket.status, color: "bg-slate-100 text-slate-600" };
  const isTerminal = ["closing", "escalated_human", "escalated_dev"].includes(ticket.conversationPhase || "");

  return (
    <div className="space-y-4">
      <button onClick={() => router.back()} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </button>

      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white px-5 py-3 shadow-sm border border-slate-100">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-slate-900 truncate max-w-md">{ticket.title}</h1>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${status.color}`}>{status.label}</span>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${phase.color}`}>{phase.label}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          {ticket.systemName && <span className="font-medium text-slate-700">{ticket.systemName}</span>}
          {ticket.customer?.name && <span>| {ticket.customer.name}</span>}
          {ticket.zapflowAteId && <span>| ZF#{ticket.zapflowAteId}</span>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Chat area */}
        <div className="flex flex-col xl:col-span-2" style={{ height: "calc(100vh - 220px)" }}>
          <Card className="flex flex-1 flex-col overflow-hidden">
            <CardHeader className="shrink-0 border-b border-slate-100 py-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Bot className="h-4 w-4 text-blue-500" /> Conversa
                  <span className="text-xs font-normal text-slate-400">
                    ({ticket.conversation?.length || 0} mensagens)
                  </span>
                </CardTitle>
                <Button variant="outline" size="sm" onClick={fetchTicket}>
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardHeader>

            <CardContent className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50">
              {(!ticket.conversation || ticket.conversation.length === 0) && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Bot className="h-12 w-12 text-slate-300 mb-3" />
                  <p className="text-sm text-slate-500">Nenhuma mensagem ainda.</p>
                  <p className="text-xs text-slate-400 mt-1">Envie uma mensagem de teste abaixo.</p>
                </div>
              )}
              {ticket.conversation?.map((msg, i) => (
                <ChatBubble key={i} msg={msg} />
              ))}
              <div ref={chatEndRef} />
            </CardContent>

            {/* Test input */}
            <div className="shrink-0 border-t border-slate-100 bg-white p-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendTestMessage()}
                  placeholder={isTerminal ? "Conversa encerrada" : "Simular mensagem do cliente..."}
                  disabled={isTerminal || sending}
                  className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 disabled:bg-slate-50 disabled:text-slate-400"
                />
                <Button
                  onClick={sendTestMessage}
                  disabled={!testMessage.trim() || isTerminal || sending}
                  size="sm"
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </Card>
        </div>

        {/* Governance sidebar */}
        <div className="space-y-4 overflow-y-auto" style={{ maxHeight: "calc(100vh - 220px)" }}>
          {/* Governance overview */}
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Activity className="h-4 w-4 text-purple-500" /> Governança
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-slate-50 p-3 text-center">
                  <p className="text-2xl font-bold text-slate-800">{ticket.attemptCount || 0}</p>
                  <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">/ 3 tentativas</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3 text-center">
                  <p className={`text-xs font-semibold ${
                    ticket.evidenceStatus === "sufficient" ? "text-emerald-600" :
                    ticket.evidenceStatus === "insufficient" ? "text-red-600" :
                    ticket.evidenceStatus === "requested" ? "text-amber-600" :
                    "text-slate-500"
                  }`}>
                    {ticket.evidenceStatus === "not_required" ? "Não necessária" :
                     ticket.evidenceStatus === "required" ? "Necessária" :
                     ticket.evidenceStatus === "requested" ? "Solicitada" :
                     ticket.evidenceStatus === "received" ? "Recebida" :
                     ticket.evidenceStatus === "sufficient" ? "Suficiente" :
                     ticket.evidenceStatus === "insufficient" ? "Insuficiente" :
                     "—"}
                  </p>
                  <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mt-1">Evidência</p>
                </div>
              </div>

              {/* Attempts */}
              {ticket.attempts && ticket.attempts.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Tentativas</p>
                  <div className="space-y-2">
                    {ticket.attempts.map((a) => (
                      <div key={a.attemptNumber} className="rounded-lg border border-slate-100 bg-white p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Target className="h-3.5 w-3.5 text-slate-400" />
                            <span className="text-xs font-medium">#{a.attemptNumber}</span>
                          </div>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            a.outcome === "success" ? "bg-emerald-100 text-emerald-700" :
                            a.outcome === "failed" ? "bg-red-100 text-red-700" :
                            "bg-amber-100 text-amber-700"
                          }`}>
                            {a.outcome === "success" ? "Sucesso" : a.outcome === "failed" ? "Falhou" : "Pendente"}
                          </span>
                        </div>
                        <p className="mt-1.5 text-xs text-slate-600 line-clamp-2">{a.solution}</p>
                        {a.clientFeedback && (
                          <p className="mt-1 text-xs text-slate-400 italic">"{a.clientFeedback}"</p>
                        )}
                        {a.knowledgeSourcesUsed.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {a.knowledgeSourcesUsed.map((s, i) => (
                              <span key={i} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{s}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Escalations */}
          {ticket.escalations && ticket.escalations.length > 0 && (
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <AlertTriangle className="h-4 w-4 text-red-500" /> Escalações
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {ticket.escalations.map((e, i) => (
                  <div key={i} className="rounded-lg border border-red-100 bg-red-50/50 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-red-700">
                        {e.type === "human" ? "Analista Humano" : "Desenvolvimento"}
                      </span>
                      <span className="text-[10px] text-red-400">{formatDateTime(e.escalatedAt)}</span>
                    </div>
                    <p className="mt-1 text-xs text-red-600">{e.reason}</p>
                    {e.clickupUrl && (
                      <a href={e.clickupUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-[10px] text-blue-600 hover:underline">
                        <FileText className="h-3 w-3" /> ClickUp Task
                      </a>
                    )}
                    {e.handoffAnalystId && (
                      <p className="mt-1 text-[10px] text-red-400">Analista ID: {e.handoffAnalystId}</p>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Knowledge hits */}
          {ticket.knowledgeHits && ticket.knowledgeHits.length > 0 && (
            <Card>
              <CardHeader className="py-3 cursor-pointer" onClick={() => setShowKnowledgeHits(!showKnowledgeHits)}>
                <CardTitle className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-teal-500" /> Base de Conhecimento
                    <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-medium text-teal-700">
                      {ticket.knowledgeHits.length}
                    </span>
                  </span>
                  {showKnowledgeHits ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                </CardTitle>
              </CardHeader>
              {showKnowledgeHits && (
                <CardContent className="space-y-2">
                  {ticket.knowledgeHits.map((h, i) => (
                    <div key={i} className="rounded-lg bg-slate-50 p-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-medium text-slate-700 line-clamp-1">{h.title}</p>
                        {h.relevanceScore != null && (
                          <span className="shrink-0 rounded bg-teal-100 px-1.5 py-0.5 text-[10px] text-teal-700">
                            {Math.round(h.relevanceScore * 100)}%
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-400">
                        <span className="rounded bg-slate-200 px-1 py-0.5">{h.source}</span>
                        {h.usedInAttempt && <span>Tentativa #{h.usedInAttempt}</span>}
                      </div>
                    </div>
                  ))}
                </CardContent>
              )}
            </Card>
          )}

          {/* Decision trace */}
          {ticket.decisionTrace && ticket.decisionTrace.length > 0 && (
            <Card>
              <CardHeader className="py-3 cursor-pointer" onClick={() => setShowDecisionTrace(!showDecisionTrace)}>
                <CardTitle className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <Brain className="h-4 w-4 text-indigo-500" /> Rastreio de Decisões
                    <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-medium text-indigo-700">
                      {ticket.decisionTrace.length}
                    </span>
                  </span>
                  {showDecisionTrace ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                </CardTitle>
              </CardHeader>
              {showDecisionTrace && (
                <CardContent>
                  <div className="space-y-1.5 max-h-64 overflow-y-auto">
                    {ticket.decisionTrace.map((d, i) => (
                      <p key={i} className="rounded bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-600 font-mono leading-snug">
                        {d}
                      </p>
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>
          )}

          {/* Customer info */}
          {ticket.customer && (
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <User className="h-4 w-4 text-slate-400" /> Cliente
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <User className="h-3.5 w-3.5 text-slate-400" />
                  <span className="text-slate-700">{ticket.customer.name}</span>
                </div>
                {ticket.customer.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5 text-slate-400" />
                    <span className="text-slate-600 text-xs">{ticket.customer.email}</span>
                  </div>
                )}
                {ticket.customer.company && (
                  <div className="flex items-center gap-2">
                    <Building2 className="h-3.5 w-3.5 text-slate-400" />
                    <span className="text-slate-700">{ticket.customer.company}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Quick actions */}
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Ações</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                variant="danger"
                size="sm"
                className="w-full justify-start"
                onClick={async () => {
                  try {
                    await api.post("/agent/webhook/escalate", {
                      zapflowAteId: ticket.zapflowAteId || 0,
                      reason: "manual_operator_escalation",
                    });
                    await fetchTicket();
                  } catch {}
                }}
              >
                <ArrowUpRight className="h-4 w-4" /> Escalar para Humano
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
