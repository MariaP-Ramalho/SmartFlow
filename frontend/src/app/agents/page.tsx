"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Bot,
  Plus,
  Pencil,
  Trash2,
  Zap,
  Loader2,
  Check,
  X,
  Copy,
  Globe,
  Key,
  Phone,
  User,
  Eye,
  EyeOff,
  Wifi,
  WifiOff,
  Power,
  BookOpen,
} from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import api from "@/lib/api";

interface Agent {
  slug: string;
  name: string;
  enabled: boolean;
  uazapiBaseUrl: string;
  managerWhatsApp: string;
  mirrorWhatsAppExtra: string;
  agentDisplayName: string;
  chatModel: string;
  bufferDelayMs: number;
  maxAttempts: number;
  maxToolIterations: number;
  knowledgeTag: string;
  inactivityTimeoutMs: number;
  inactivityMaxWarnings: number;
  webhookUrl: string;
  createdAt?: string;
  updatedAt?: string;
}

interface AgentForm {
  slug: string;
  name: string;
  enabled: boolean;
  uazapiBaseUrl: string;
  uazapiInstanceToken: string;
  managerWhatsApp: string;
  mirrorWhatsAppExtra: string;
  agentDisplayName: string;
  systemPrompt: string;
  customInstructions: string;
  chatModel: string;
  bufferDelayMs: number;
  maxAttempts: number;
  maxToolIterations: number;
  knowledgeTag: string;
  inactivityTimeoutMs: number;
  inactivityMaxWarnings: number;
}

const emptyForm: AgentForm = {
  slug: "",
  name: "",
  enabled: true,
  uazapiBaseUrl: "",
  uazapiInstanceToken: "",
  managerWhatsApp: "",
  mirrorWhatsAppExtra: "",
  agentDisplayName: "Agente IA",
  systemPrompt: "",
  customInstructions: "",
  chatModel: "gpt-4o",
  bufferDelayMs: 15000,
  maxAttempts: 3,
  maxToolIterations: 5,
  knowledgeTag: "",
  inactivityTimeoutMs: 600000,
  inactivityMaxWarnings: 3,
};

export default function AgentsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [form, setForm] = useState<AgentForm>({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [showToken, setShowToken] = useState(false);

  const [testingSlug, setTestingSlug] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; detail: string }>>({});

  const loadAgents = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/whatsapp/agents");
      setAgents(data);
    } catch {
      setError("Erro ao carregar agentes.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  const openCreateModal = () => {
    setEditingSlug(null);
    setForm({ ...emptyForm });
    setShowToken(false);
    setShowModal(true);
  };

  const openEditModal = async (slug: string) => {
    try {
      const { data } = await api.get(`/whatsapp/agents/${slug}`);
      setEditingSlug(slug);
      setForm({
        slug: data.slug,
        name: data.name || "",
        enabled: data.enabled ?? true,
        uazapiBaseUrl: data.uazapiBaseUrl || "",
        uazapiInstanceToken: "",
        managerWhatsApp: data.managerWhatsApp || "",
        mirrorWhatsAppExtra: data.mirrorWhatsAppExtra || "",
        agentDisplayName: data.agentDisplayName || "",
        systemPrompt: data.systemPrompt || "",
        customInstructions: data.customInstructions || "",
        chatModel: data.chatModel || "gpt-4o",
        bufferDelayMs: data.bufferDelayMs ?? 15000,
        maxAttempts: data.maxAttempts ?? 3,
        maxToolIterations: data.maxToolIterations ?? 5,
        knowledgeTag: data.knowledgeTag || "",
        inactivityTimeoutMs: data.inactivityTimeoutMs ?? 600000,
        inactivityMaxWarnings: data.inactivityMaxWarnings ?? 3,
      });
      setShowToken(false);
      setShowModal(true);
    } catch {
      setError("Erro ao carregar dados do agente.");
    }
  };

  const handleSave = async () => {
    setError("");
    setSaving(true);
    try {
      if (editingSlug) {
        const { slug: _s, ...updates } = form;
        if (!updates.uazapiInstanceToken) {
          delete (updates as any).uazapiInstanceToken;
        }
        await api.patch(`/whatsapp/agents/${editingSlug}`, updates);
        setSuccess("Agente atualizado com sucesso.");
      } else {
        if (!form.slug || !form.name || !form.uazapiBaseUrl || !form.uazapiInstanceToken) {
          setError("Preencha slug, nome, URL base e token.");
          setSaving(false);
          return;
        }
        await api.post("/whatsapp/agents", form);
        setSuccess("Agente criado com sucesso.");
      }
      setShowModal(false);
      await loadAgents();
      setTimeout(() => setSuccess(""), 4000);
    } catch (err: any) {
      setError(err.response?.data?.message || "Erro ao salvar agente.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (slug: string) => {
    if (!confirm(`Tem certeza que deseja excluir o agente "${slug}"?`)) return;
    try {
      await api.delete(`/whatsapp/agents/${slug}`);
      setSuccess("Agente excluído.");
      await loadAgents();
      setTimeout(() => setSuccess(""), 4000);
    } catch {
      setError("Erro ao excluir agente.");
    }
  };

  const handleTestConnection = async (slug: string) => {
    setTestingSlug(slug);
    try {
      const { data } = await api.post(`/whatsapp/agents/${slug}/test`);
      setTestResults((prev) => ({
        ...prev,
        [slug]: { ok: data.ok, detail: data.ok ? "Conectado" : data.error || "Falha" },
      }));
    } catch {
      setTestResults((prev) => ({
        ...prev,
        [slug]: { ok: false, detail: "Erro ao testar" },
      }));
    } finally {
      setTestingSlug(null);
    }
  };

  const copyWebhookUrl = (webhookUrl: string) => {
    const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3003";
    navigator.clipboard.writeText(`${base}${webhookUrl}`);
    setSuccess("URL do webhook copiada!");
    setTimeout(() => setSuccess(""), 3000);
  };

  const inputClass =
    "w-full rounded-lg border border-slate-700 px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500";

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <p className="text-slate-500">Acesso restrito a administradores.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-100">Agentes WhatsApp</h2>
          <p className="text-sm text-slate-500">
            Gerencie seus agentes de atendimento via WhatsApp
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Novo Agente
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-800/60 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {error}
          <button onClick={() => setError("")} className="ml-2 font-medium hover:underline">
            Fechar
          </button>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-800/60 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-300">
          <Check className="h-4 w-4" />
          {success}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : agents.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/80 p-12 text-center">
          <Bot className="mx-auto h-12 w-12 text-slate-300" />
          <h3 className="mt-4 text-lg font-semibold text-slate-100">Nenhum agente cadastrado</h3>
          <p className="mt-2 text-sm text-slate-500">
            Crie seu primeiro agente para começar a receber atendimentos via WhatsApp.
          </p>
          <button
            onClick={openCreateModal}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Criar Agente
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {agents.map((agent) => (
            <div
              key={agent.slug}
              className="rounded-xl border border-slate-800 bg-slate-900/80 p-5 transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                      agent.enabled ? "bg-blue-950/60" : "bg-slate-800"
                    }`}
                  >
                    <Bot className={`h-5 w-5 ${agent.enabled ? "text-blue-600" : "text-slate-400"}`} />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-slate-100">{agent.name}</h3>
                    <p className="text-sm text-slate-500">
                      <span className="font-mono text-xs">{agent.slug}</span>
                      {" Â· "}
                      {agent.agentDisplayName}
                      {" Â· "}
                      {agent.chatModel}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      agent.enabled
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    <Power className="h-3 w-3" />
                    {agent.enabled ? "Ativo" : "Inativo"}
                  </span>
                  {testResults[agent.slug] && (
                    <span
                      className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        testResults[agent.slug].ok
                          ? "bg-emerald-950/60 text-emerald-300"
                          : "bg-red-950/60 text-red-300"
                      }`}
                    >
                      {testResults[agent.slug].ok ? (
                        <Wifi className="h-3 w-3" />
                      ) : (
                        <WifiOff className="h-3 w-3" />
                      )}
                      {testResults[agent.slug].detail}
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                <span className="flex items-center gap-1">
                  <Globe className="h-3 w-3" />
                  {agent.uazapiBaseUrl || "Sem URL"}
                </span>
                {agent.managerWhatsApp && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {agent.managerWhatsApp}
                  </span>
                )}
                {agent.knowledgeTag && (
                  <span className="flex items-center gap-1">
                    <BookOpen className="h-3 w-3" />
                    {agent.knowledgeTag}
                  </span>
                )}
              </div>

              <div className="mt-3 flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2">
                <span className="text-xs font-medium text-slate-500">Webhook:</span>
                <code className="flex-1 truncate text-xs text-slate-300">
                  {(process.env.NEXT_PUBLIC_API_URL || "http://localhost:3003") + agent.webhookUrl}
                </code>
                <button
                  onClick={() => copyWebhookUrl(agent.webhookUrl)}
                  className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-400"
                  title="Copiar URL"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="mt-4 flex items-center gap-2 border-t border-slate-800 pt-3">
                <button
                  onClick={() => openEditModal(agent.slug)}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-900/50"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Editar
                </button>
                <button
                  onClick={() => handleTestConnection(agent.slug)}
                  disabled={testingSlug === agent.slug}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-900/50 disabled:opacity-50"
                >
                  {testingSlug === agent.slug ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Zap className="h-3.5 w-3.5" />
                  )}
                  Testar
                </button>
                <button
                  onClick={() => handleDelete(agent.slug)}
                  className="flex items-center gap-1.5 rounded-lg border border-red-800/60 bg-slate-900/80 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-950/40"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Excluir
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-16">
          <div className="w-full max-w-2xl rounded-xl border border-slate-800 bg-slate-900/80 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
              <h3 className="text-lg font-semibold text-slate-100">
                {editingSlug ? `Editar Agente — ${editingSlug}` : "Novo Agente"}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800/50 hover:text-slate-400"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[70vh] space-y-4 overflow-y-auto px-6 py-4">
              {!editingSlug && (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-300">
                    Slug (identificador único, sem espaços)
                  </label>
                  <input
                    type="text"
                    value={form.slug}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
                      }))
                    }
                    placeholder="suporte-folhas"
                    className={inputClass}
                  />
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-300">Nome do Agente</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Suporte Folhas"
                  className={inputClass}
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border border-slate-800 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Power className="h-4 w-4 text-slate-500" />
                  <span className="text-sm font-medium text-slate-300">Agente ativo</span>
                </div>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, enabled: !f.enabled }))}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                    form.enabled ? "bg-green-500" : "bg-slate-600"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-slate-900/80 shadow transition ${
                      form.enabled ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
                <h4 className="mb-3 text-sm font-semibold text-slate-300">Conexão Uazapi</h4>
                <div className="space-y-3">
                  <div>
                    <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-400">
                      <Globe className="h-3 w-3" /> URL Base
                    </label>
                    <input
                      type="url"
                      value={form.uazapiBaseUrl}
                      onChange={(e) => setForm((f) => ({ ...f, uazapiBaseUrl: e.target.value }))}
                      placeholder="https://instancia.uazapi.com"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-400">
                      <Key className="h-3 w-3" /> Token
                    </label>
                    <div className="relative">
                      <input
                        type={showToken ? "text" : "password"}
                        value={form.uazapiInstanceToken}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, uazapiInstanceToken: e.target.value }))
                        }
                        placeholder={editingSlug ? "Deixe vazio para manter o atual" : "Token da instância"}
                        className={inputClass + " pr-10"}
                      />
                      <button
                        type="button"
                        onClick={() => setShowToken(!showToken)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-400"
                      >
                        {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
                <h4 className="mb-3 text-sm font-semibold text-slate-300">WhatsApp</h4>
                <div className="space-y-3">
                  <div>
                    <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-400">
                      <User className="h-3 w-3" /> Nome de Exibição
                    </label>
                    <input
                      type="text"
                      value={form.agentDisplayName}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, agentDisplayName: e.target.value }))
                      }
                      placeholder="Assistente Folhas"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-400">
                      <Phone className="h-3 w-3" /> Gestor (alertas)
                    </label>
                    <input
                      type="tel"
                      value={form.managerWhatsApp}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, managerWhatsApp: e.target.value }))
                      }
                      placeholder="5571988791615"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-400">
                      <Phone className="h-3 w-3" /> Espelhamento extra
                    </label>
                    <input
                      type="text"
                      value={form.mirrorWhatsAppExtra}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, mirrorWhatsAppExtra: e.target.value }))
                      }
                      placeholder="5571991975400, 5571991660891"
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
                <h4 className="mb-3 text-sm font-semibold text-slate-300">Comportamento</h4>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-400">
                        Modelo LLM
                      </label>
                      <input
                        type="text"
                        value={form.chatModel}
                        onChange={(e) => setForm((f) => ({ ...f, chatModel: e.target.value }))}
                        placeholder="gpt-4o"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-400">
                        Tag do Conhecimento
                      </label>
                      <input
                        type="text"
                        value={form.knowledgeTag}
                        onChange={(e) => setForm((f) => ({ ...f, knowledgeTag: e.target.value }))}
                        placeholder="folhas"
                        className={inputClass}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-400">
                        Buffer (ms)
                      </label>
                      <input
                        type="number"
                        value={form.bufferDelayMs}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, bufferDelayMs: parseInt(e.target.value) || 15000 }))
                        }
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-400">
                        Max Tentativas
                      </label>
                      <input
                        type="number"
                        value={form.maxAttempts}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, maxAttempts: parseInt(e.target.value) || 3 }))
                        }
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-400">
                        Max Iterações
                      </label>
                      <input
                        type="number"
                        value={form.maxToolIterations}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            maxToolIterations: parseInt(e.target.value) || 5,
                          }))
                        }
                        className={inputClass}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-400">
                      System Prompt
                    </label>
                    <textarea
                      value={form.systemPrompt}
                      onChange={(e) => setForm((f) => ({ ...f, systemPrompt: e.target.value }))}
                      placeholder="Instruções do sistema para o agente... (deixe vazio para usar o padrão)"
                      rows={4}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-400">
                      Instruções Adicionais
                    </label>
                    <textarea
                      value={form.customInstructions}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, customInstructions: e.target.value }))
                      }
                      placeholder="Instruções extras do administrador..."
                      rows={2}
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-800 px-6 py-4">
              <button
                onClick={() => setShowModal(false)}
                className="rounded-lg border border-slate-700 bg-slate-900/80 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-900/50"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                {editingSlug ? "Salvar Alterações" : "Criar Agente"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
