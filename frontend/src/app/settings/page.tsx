"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Lock,
  Loader2,
  Check,
  MessageSquare,
  Save,
  RefreshCw,
  Wifi,
  WifiOff,
  Eye,
  EyeOff,
  Phone,
  Globe,
  Key,
  User,
  Link2,
  Power,
  Zap,
} from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import api from "@/lib/api";

interface WhatsAppConfig {
  uazapiBaseUrl: string;
  uazapiInstanceToken: string;
  managerWhatsApp: string;
  mirrorWhatsAppExtra: string;
  mirrorRecipientCount?: number;
  agentDisplayName: string;
  webhookUrl: string;
  enabled: boolean;
  connected: boolean;
  updatedAt?: string;
}

export default function SettingsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState("");

  const [waConfig, setWaConfig] = useState<WhatsAppConfig | null>(null);
  const [waForm, setWaForm] = useState({
    uazapiBaseUrl: "",
    uazapiInstanceToken: "",
    managerWhatsApp: "",
    mirrorWhatsAppExtra: "",
    agentDisplayName: "",
    webhookUrl: "",
    enabled: true,
  });
  const [waTokenChanged, setWaTokenChanged] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [waLoading, setWaLoading] = useState(false);
  const [waSaving, setWaSaving] = useState(false);
  const [waError, setWaError] = useState("");
  const [waSuccess, setWaSuccess] = useState("");
  const [waTesting, setWaTesting] = useState(false);
  const [waTestResult, setWaTestResult] = useState<{ ok: boolean; detail?: string } | null>(null);

  const loadWhatsAppConfig = useCallback(async () => {
    if (!isAdmin) return;
    setWaLoading(true);
    try {
      const { data } = await api.get("/whatsapp/config");
      setWaConfig(data);
      setWaForm({
        uazapiBaseUrl: data.uazapiBaseUrl || "",
        uazapiInstanceToken: data.uazapiInstanceToken || "",
        managerWhatsApp: data.managerWhatsApp || "",
        mirrorWhatsAppExtra: data.mirrorWhatsAppExtra || "",
        agentDisplayName: data.agentDisplayName || "",
        webhookUrl: data.webhookUrl || "",
        enabled: data.enabled ?? true,
      });
      setWaTokenChanged(false);
    } catch {
      setWaError("Erro ao carregar configuração do WhatsApp.");
    } finally {
      setWaLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    loadWhatsAppConfig();
  }, [loadWhatsAppConfig]);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError("");
    setPwSuccess("");

    if (newPassword.length < 6) {
      setPwError("A nova senha deve ter pelo menos 6 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError("As senhas não coincidem.");
      return;
    }

    setPwLoading(true);
    try {
      await api.patch("/auth/password", { currentPassword, newPassword });
      setPwSuccess("Senha alterada com sucesso.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setPwError(err.response?.data?.message || "Erro ao alterar a senha.");
    } finally {
      setPwLoading(false);
    }
  };

  const handleSaveWhatsApp = async () => {
    setWaError("");
    setWaSuccess("");
    setWaSaving(true);
    try {
      const payload: Record<string, any> = {
        uazapiBaseUrl: waForm.uazapiBaseUrl,
        managerWhatsApp: waForm.managerWhatsApp,
        mirrorWhatsAppExtra: waForm.mirrorWhatsAppExtra,
        agentDisplayName: waForm.agentDisplayName,
        webhookUrl: waForm.webhookUrl,
        enabled: waForm.enabled,
      };
      if (waTokenChanged && waForm.uazapiInstanceToken) {
        payload.uazapiInstanceToken = waForm.uazapiInstanceToken;
      }
      await api.patch("/whatsapp/config", payload);
      setWaSuccess("Configuração salva com sucesso.");
      setTimeout(() => setWaSuccess(""), 4000);
      await loadWhatsAppConfig();
    } catch {
      setWaError("Erro ao salvar configuração.");
    } finally {
      setWaSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setWaTesting(true);
    setWaTestResult(null);
    try {
      const { data } = await api.post("/whatsapp/config/test");
      setWaTestResult({
        ok: data.ok,
        detail: data.ok
          ? `Conectado (${data.baseUrl})`
          : data.error || "Falha na conexão",
      });
    } catch {
      setWaTestResult({ ok: false, detail: "Erro ao testar conexão." });
    } finally {
      setWaTesting(false);
    }
  };

  const handleReload = async () => {
    setWaError("");
    try {
      await api.post("/whatsapp/config/reload");
      setWaSuccess("Conexão recarregada.");
      setTimeout(() => setWaSuccess(""), 3000);
      await loadWhatsAppConfig();
    } catch {
      setWaError("Erro ao recarregar conexão.");
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h2 className="text-2xl font-bold text-slate-900">Configurações</h2>

      {/* Password section */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
            <Lock className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Alterar Senha</h3>
            <p className="text-sm text-slate-500">Logado como {user?.email}</p>
          </div>
        </div>

        <form onSubmit={handleChangePassword} className="space-y-4">
          {pwError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {pwError}
            </div>
          )}
          {pwSuccess && (
            <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              <Check className="h-4 w-4" />
              {pwSuccess}
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Senha atual</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Nova senha</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={6}
              className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Confirmar nova senha</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
              className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <button
            type="submit"
            disabled={pwLoading}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
          >
            {pwLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Alterando...
              </>
            ) : (
              "Alterar Senha"
            )}
          </button>
        </form>
      </div>

      {/* WhatsApp config section (admin only) */}
      {isAdmin && (
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="mb-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
                <MessageSquare className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900">WhatsApp (Uazapi)</h3>
                <p className="text-sm text-slate-500">Configuração da integração com WhatsApp</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {waConfig && (
                <span
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                    waConfig.connected
                      ? "bg-green-100 text-green-700"
                      : "bg-red-100 text-red-700"
                  }`}
                >
                  {waConfig.connected ? (
                    <Wifi className="h-3.5 w-3.5" />
                  ) : (
                    <WifiOff className="h-3.5 w-3.5" />
                  )}
                  {waConfig.connected ? "Conectado" : "Desconectado"}
                </span>
              )}
            </div>
          </div>

          {waLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : (
            <div className="space-y-4">
              {waError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {waError}
                </div>
              )}
              {waSuccess && (
                <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                  <Check className="h-4 w-4" />
                  {waSuccess}
                </div>
              )}

              {/* Enabled toggle */}
              <div className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Power className="h-4 w-4 text-slate-500" />
                  <span className="text-sm font-medium text-slate-700">Integração ativa</span>
                </div>
                <button
                  onClick={() => setWaForm((f) => ({ ...f, enabled: !f.enabled }))}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                    waForm.enabled ? "bg-green-500" : "bg-slate-300"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      waForm.enabled ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {/* Base URL */}
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-700">
                  <Globe className="h-3.5 w-3.5" />
                  URL Base (Uazapi)
                </label>
                <input
                  type="url"
                  value={waForm.uazapiBaseUrl}
                  onChange={(e) => setWaForm((f) => ({ ...f, uazapiBaseUrl: e.target.value }))}
                  placeholder="https://sua-instancia.uazapi.com"
                  className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Instance Token */}
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-700">
                  <Key className="h-3.5 w-3.5" />
                  Token da Instância
                </label>
                <div className="relative">
                  <input
                    type={showToken ? "text" : "password"}
                    value={waForm.uazapiInstanceToken}
                    onChange={(e) => {
                      setWaForm((f) => ({ ...f, uazapiInstanceToken: e.target.value }));
                      setWaTokenChanged(true);
                    }}
                    placeholder={waTokenChanged ? "Digite o novo token" : "••••••••••"}
                    className="w-full rounded-lg border border-slate-300 px-4 py-2.5 pr-10 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {!waTokenChanged && waConfig?.uazapiInstanceToken && (
                  <p className="mt-1 text-xs text-slate-400">
                    Token atual: {waConfig.uazapiInstanceToken} — altere apenas se necessário
                  </p>
                )}
              </div>

              {/* Gestor principal (alertas + espelhamento) */}
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-700">
                  <Phone className="h-3.5 w-3.5" />
                  Gestor principal (Cássio) — alertas e espelhamento
                </label>
                <input
                  type="tel"
                  value={waForm.managerWhatsApp}
                  onChange={(e) => setWaForm((f) => ({ ...f, managerWhatsApp: e.target.value }))}
                  placeholder="5571988791615"
                  className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
                <p className="mt-1 text-xs text-slate-400">
                  Recebe confirmações de bug, pedidos de transferência, falhas do agente e o espelhamento das conversas.
                  Formato: 55 + DDD + número.
                </p>
              </div>

              {/* Espelhamento extra (só cópia cliente/agente) */}
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-700">
                  <Phone className="h-3.5 w-3.5" />
                  Espelhamento adicional (somente conversa)
                </label>
                <textarea
                  value={waForm.mirrorWhatsAppExtra}
                  onChange={(e) => setWaForm((f) => ({ ...f, mirrorWhatsAppExtra: e.target.value }))}
                  placeholder="5571991975400, 5571991660891"
                  rows={2}
                  className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
                <p className="mt-1 text-xs text-slate-400">
                  Números separados por vírgula. Recebem a mesma cópia do cliente e do agente que o gestor principal;
                  não recebem alertas operacionais.
                  {waConfig?.mirrorRecipientCount != null && waConfig.mirrorRecipientCount > 0 && (
                    <span className="mt-1 block font-medium text-slate-500">
                      Total de destinatários do espelhamento (gestor + extras): {waConfig.mirrorRecipientCount}
                    </span>
                  )}
                </p>
              </div>

              {/* Agent Display Name */}
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-700">
                  <User className="h-3.5 w-3.5" />
                  Nome de Exibição do Agente
                </label>
                <input
                  type="text"
                  value={waForm.agentDisplayName}
                  onChange={(e) => setWaForm((f) => ({ ...f, agentDisplayName: e.target.value }))}
                  placeholder="Renato Solves"
                  className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Webhook URL */}
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-700">
                  <Link2 className="h-3.5 w-3.5" />
                  URL do Webhook
                </label>
                <input
                  type="url"
                  value={waForm.webhookUrl}
                  onChange={(e) => setWaForm((f) => ({ ...f, webhookUrl: e.target.value }))}
                  placeholder="https://api-resolve.makernocode.dev/webhook/whatsapp"
                  className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
                <p className="mt-1 text-xs text-slate-400">
                  Configure esta URL no painel da Uazapi como webhook de mensagens recebidas
                </p>
              </div>

              {/* Test result */}
              {waTestResult && (
                <div
                  className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${
                    waTestResult.ok
                      ? "border-green-200 bg-green-50 text-green-700"
                      : "border-red-200 bg-red-50 text-red-700"
                  }`}
                >
                  {waTestResult.ok ? (
                    <Wifi className="h-4 w-4" />
                  ) : (
                    <WifiOff className="h-4 w-4" />
                  )}
                  {waTestResult.detail}
                </div>
              )}

              {/* Updated at */}
              {waConfig?.updatedAt && (
                <p className="text-xs text-slate-400">
                  Última atualização: {new Date(waConfig.updatedAt).toLocaleString("pt-BR")}
                </p>
              )}

              {/* Action buttons */}
              <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
                <button
                  onClick={handleSaveWhatsApp}
                  disabled={waSaving}
                  className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-60"
                >
                  {waSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Salvar
                </button>

                <button
                  onClick={handleTestConnection}
                  disabled={waTesting}
                  className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60"
                >
                  {waTesting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Zap className="h-4 w-4" />
                  )}
                  Testar Conexão
                </button>

                <button
                  onClick={handleReload}
                  className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                >
                  <RefreshCw className="h-4 w-4" />
                  Reconectar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
