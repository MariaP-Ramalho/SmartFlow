"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Plus,
  Pencil,
  Trash2,
  X,
  CheckCircle2,
  XCircle,
  ListChecks,
} from "lucide-react";
import api from "@/lib/api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { RiskLevel, PolicyTrigger, PolicyCondition } from "@/types";

interface PolicyItem {
  id: string;
  name: string;
  description: string;
  trigger: PolicyTrigger;
  conditions: PolicyCondition[];
  riskLevel: RiskLevel;
  requiresApproval: boolean;
  approvers: string[];
  maxAutoAmount: number;
  active: boolean;
}

const riskBadgeMap: Record<RiskLevel, { label: string; variant: "success" | "warning" | "danger" }> = {
  low: { label: "Baixo", variant: "success" },
  medium: { label: "Médio", variant: "warning" },
  high: { label: "Alto", variant: "danger" },
  critical: { label: "Crítico", variant: "danger" },
};

const triggerLabels: Record<PolicyTrigger, string> = {
  refund: "Reembolso",
  replacement: "Substituição",
  discount: "Desconto",
  warranty_extension: "Extensão de Garantia",
  escalation: "Escalação",
  account_credit: "Crédito em Conta",
};


const emptyForm: Omit<PolicyItem, "id"> = {
  name: "",
  description: "",
  trigger: "refund",
  conditions: [],
  riskLevel: "low",
  requiresApproval: false,
  approvers: [],
  maxAutoAmount: 0,
  active: true,
};

export default function PoliciesPage() {
  const [policies, setPolicies] = useState<PolicyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<PolicyItem, "id">>(emptyForm);
  const [approversText, setApproversText] = useState("");

  const fetchPolicies = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const { data: res } = await api.get("/policies");
      setPolicies(res.data || res);
    } catch {
      setError("Erro ao carregar políticas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPolicies(); }, [fetchPolicies]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setApproversText("");
    setShowForm(true);
  }

  function openEdit(policy: PolicyItem) {
    setEditingId(policy.id);
    setForm({
      name: policy.name,
      description: policy.description,
      trigger: policy.trigger,
      conditions: policy.conditions,
      riskLevel: policy.riskLevel,
      requiresApproval: policy.requiresApproval,
      approvers: policy.approvers,
      maxAutoAmount: policy.maxAutoAmount,
      active: policy.active,
    });
    setApproversText(policy.approvers.join(", "));
    setShowForm(true);
  }

  async function handleSave() {
    const approvers = approversText.split(",").map((s) => s.trim()).filter(Boolean);
    try {
      if (editingId) {
        await api.patch(`/policies/${editingId}`, { ...form, approvers });
      } else {
        await api.post("/policies", { ...form, approvers });
      }
      setShowForm(false);
      await fetchPolicies();
    } catch {
      setError("Erro ao salvar política");
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.patch(`/policies/${id}`, { active: false });
      await fetchPolicies();
    } catch {
      setError("Erro ao excluir política");
    }
  }

  async function toggleActive(id: string) {
    try {
      await api.post(`/policies/${id}/toggle`);
      await fetchPolicies();
    } catch {
      setError("Erro ao alterar status da política");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Políticas de Aprovação</h1>
          <p className="mt-1 text-sm text-slate-500">
            Gerencie as regras de aprovação automática e manual
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Nova Política
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {showForm && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{editingId ? "Editar Política" : "Nova Política"}</CardTitle>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-medium text-slate-600">Nome</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="Nome da política"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600">Gatilho</label>
                <select
                  value={form.trigger}
                  onChange={(e) => setForm({ ...form, trigger: e.target.value as PolicyTrigger })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {(Object.keys(triggerLabels) as PolicyTrigger[]).map((t) => (
                    <option key={t} value={t}>{triggerLabels[t]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600">Nível de Risco</label>
                <select
                  value={form.riskLevel}
                  onChange={(e) => setForm({ ...form, riskLevel: e.target.value as RiskLevel })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="low">Baixo</option>
                  <option value="medium">Médio</option>
                  <option value="high">Alto</option>
                  <option value="critical">Crítico</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600">Aprovadores (separados por vírgula)</label>
                <input
                  type="text"
                  value={approversText}
                  onChange={(e) => setApproversText(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="Carlos Mendes, Ana Costa"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600">Valor Máximo Automático (R$)</label>
                <input
                  type="number"
                  value={form.maxAutoAmount}
                  onChange={(e) => setForm({ ...form, maxAutoAmount: Number(e.target.value) })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  min={0}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-medium text-slate-600">Descrição</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="Descreva a política..."
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="requiresApproval"
                  checked={form.requiresApproval}
                  onChange={(e) => setForm({ ...form, requiresApproval: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="requiresApproval" className="text-sm text-slate-700">
                  Requer aprovação manual
                </label>
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <Button onClick={handleSave}>{editingId ? "Salvar Alterações" : "Criar Política"}</Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <p className="text-slate-500">Carregando...</p>
        </div>
      ) : policies.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 py-16">
          <Shield className="mb-3 h-10 w-10 text-slate-300" />
          <p className="text-sm font-medium text-slate-500">Nenhuma política cadastrada</p>
          <p className="text-xs text-slate-400">Crie uma nova política para começar</p>
        </div>
      ) : (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {policies.map((policy) => {
          const risk = riskBadgeMap[policy.riskLevel];
          return (
            <Card key={policy.id} className={!policy.active ? "opacity-60" : ""}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-base">{policy.name}</CardTitle>
                    <p className="mt-1 text-xs text-slate-500">{policy.id}</p>
                  </div>
                  <button
                    onClick={() => toggleActive(policy.id)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                      policy.active ? "bg-blue-600" : "bg-slate-200"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                        policy.active ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              </CardHeader>
              <CardContent>
                <p className="mb-4 text-sm text-slate-600 line-clamp-2">{policy.description}</p>

                <div className="mb-4 flex flex-wrap gap-2">
                  <Badge variant="info">{triggerLabels[policy.trigger]}</Badge>
                  <Badge variant={risk.variant}>{risk.label}</Badge>
                  {policy.requiresApproval && (
                    <Badge variant="warning">
                      <Shield className="mr-1 h-3 w-3" />
                      Aprovação
                    </Badge>
                  )}
                </div>

                <div className="mb-4 space-y-2 text-xs text-slate-500">
                  <div className="flex items-center gap-1.5">
                    <ListChecks className="h-3.5 w-3.5" />
                    <span>{policy.conditions.length} {policy.conditions.length === 1 ? "condição" : "condições"}</span>
                  </div>
                  {policy.maxAutoAmount > 0 && (
                    <div className="flex items-center gap-1.5">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      <span>Auto até R$ {policy.maxAutoAmount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  {policy.approvers.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <ShieldAlert className="h-3.5 w-3.5" />
                      <span>{policy.approvers.join(", ")}</span>
                    </div>
                  )}
                </div>

                <div className="flex gap-2 border-t border-slate-100 pt-4">
                  <Button variant="outline" size="sm" onClick={() => openEdit(policy)}>
                    <Pencil className="h-3.5 w-3.5" />
                    Editar
                  </Button>
                  <Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => handleDelete(policy.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                    Excluir
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      )}
    </div>
  );
}
