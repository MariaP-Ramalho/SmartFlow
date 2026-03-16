"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import api from "@/lib/api";
import {
  Clock,
  CheckCircle2,
  XCircle,
  Timer,
  AlertTriangle,
  ShieldCheck,
  User,
  Package,
} from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import type { RiskLevel } from "@/types";

interface PendingApproval {
  id: string;
  actionType: string;
  caseId: string;
  ticketTitle: string;
  customerName: string;
  policyName: string;
  riskLevel: RiskLevel;
  requestedAt: string;
  context: {
    amount?: number;
    product?: string;
    reason?: string;
    [key: string]: unknown;
  };
}

interface ResolvedApproval {
  id: string;
  actionType: string;
  caseId: string;
  status: "approved" | "rejected";
  resolvedBy: string;
  resolvedAt: string;
  reason: string;
}

const riskBadgeMap: Record<RiskLevel, { label: string; variant: "success" | "warning" | "danger" }> = {
  low: { label: "Baixo", variant: "success" },
  medium: { label: "Médio", variant: "warning" },
  high: { label: "Alto", variant: "danger" },
  critical: { label: "Crítico", variant: "danger" },
};

const actionTypeLabels: Record<string, string> = {
  refund: "Reembolso",
  replacement: "Substituição",
  discount: "Desconto",
  warranty_extension: "Extensão de Garantia",
  escalation: "Escalação",
  account_credit: "Crédito em Conta",
};


function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}min atrás`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h atrás`;
  const days = Math.floor(hours / 24);
  return `${days}d atrás`;
}

export default function ApprovalsPage() {
  const [pending, setPending] = useState<PendingApproval[]>([]);
  const [resolved, setResolved] = useState<ResolvedApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [confirmAction, setConfirmAction] = useState<{ id: string; type: "approve" | "reject" } | null>(null);

  const fetchApprovals = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const { data: res } = await api.get("/approvals");
      const all: (PendingApproval & { status?: string })[] = res.data || res;
      setPending(all.filter((a) => !a.status || a.status === "pending") as PendingApproval[]);
      setResolved(all.filter((a) => a.status === "approved" || a.status === "rejected") as unknown as ResolvedApproval[]);
    } catch {
      setError("Erro ao carregar aprovações");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchApprovals(); }, [fetchApprovals]);

  const approvedToday = resolved.filter((r) => {
    const today = new Date().toISOString().split("T")[0];
    return r.status === "approved" && r.resolvedAt?.startsWith(today);
  }).length;

  const rejectedToday = resolved.filter((r) => {
    const today = new Date().toISOString().split("T")[0];
    return r.status === "rejected" && r.resolvedAt?.startsWith(today);
  }).length;

  async function handleResolve(id: string, status: "approved" | "rejected") {
    try {
      await api.patch(`/approvals/${id}/resolve`, {
        status,
        reason: status === "approved" ? "Aprovado manualmente" : "Rejeitado manualmente",
      });
      setConfirmAction(null);
      await fetchApprovals();
    } catch {
      setError("Erro ao resolver aprovação");
    }
  }

  const resolvedColumns: Column<ResolvedApproval>[] = [
    {
      key: "actionType",
      header: "Ação",
      render: (val) => <span className="text-sm">{actionTypeLabels[val as string] ?? (val as string)}</span>,
    },
    {
      key: "caseId",
      header: "Caso",
      render: (val) => (
        <Link href={`/tickets/${val}`} className="font-mono text-xs text-blue-600 hover:underline">
          {val as string}
        </Link>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (val) =>
        val === "approved" ? (
          <Badge variant="success">Aprovado</Badge>
        ) : (
          <Badge variant="danger">Rejeitado</Badge>
        ),
    },
    {
      key: "resolvedBy",
      header: "Resolvido Por",
      render: (val) => <span className="text-sm text-slate-600">{val as string}</span>,
    },
    {
      key: "resolvedAt",
      header: "Resolvido Em",
      render: (val) => <span className="text-xs text-slate-500">{formatDateTime(val as string)}</span>,
    },
    {
      key: "reason",
      header: "Motivo",
      className: "max-w-xs",
      render: (val) => <span className="text-xs text-slate-600 line-clamp-1">{val as string}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Fila de Aprovações</h1>
        <p className="mt-1 text-sm text-slate-500">
          Gerencie solicitações pendentes de aprovação
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <p className="text-slate-500">Carregando...</p>
        </div>
      ) : (
      <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Clock} label="Pendentes" value={pending.length} />
        <StatCard icon={CheckCircle2} label="Aprovados Hoje" value={approvedToday} />
        <StatCard icon={XCircle} label="Rejeitados Hoje" value={rejectedToday} />
        <StatCard icon={Timer} label="Tempo Médio de Resposta" value="42min" />
      </div>

      <div>
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Aprovações Pendentes</h2>
        {pending.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <ShieldCheck className="mx-auto mb-3 h-10 w-10 text-emerald-400" />
              <p className="text-sm text-slate-500">Nenhuma aprovação pendente</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {pending.map((item) => {
              const risk = riskBadgeMap[item.riskLevel];
              const isConfirming = confirmAction?.id === item.id;

              return (
                <Card key={item.id}>
                  <CardContent className="pt-6">
                    <div className="mb-3 flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge variant="info">{actionTypeLabels[item.actionType] ?? item.actionType}</Badge>
                          <Badge variant={risk.variant}>{risk.label}</Badge>
                        </div>
                        <Link
                          href={`/tickets/${item.caseId}`}
                          className="mt-2 block font-mono text-xs text-blue-600 hover:underline"
                        >
                          {item.caseId}
                        </Link>
                      </div>
                      <span className="text-xs text-slate-400">{timeAgo(item.requestedAt)}</span>
                    </div>

                    <h3 className="mb-1 text-sm font-semibold text-slate-800">{item.ticketTitle}</h3>

                    <div className="mb-3 space-y-1 text-xs text-slate-500">
                      <div className="flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5" />
                        <span>{item.customerName}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        <span>{item.policyName}</span>
                      </div>
                    </div>

                    <div className="mb-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                      {item.context.amount && (
                        <div className="flex items-center gap-1.5 mb-1">
                          <Package className="h-3.5 w-3.5 text-slate-400" />
                          <span className="font-medium">Valor:</span> R$ {item.context.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </div>
                      )}
                      {item.context.product && (
                        <div className="flex items-center gap-1.5 mb-1">
                          <Package className="h-3.5 w-3.5 text-slate-400" />
                          <span className="font-medium">Produto:</span> {item.context.product}
                        </div>
                      )}
                      {item.context.reason && (
                        <div className="flex items-center gap-1.5">
                          <AlertTriangle className="h-3.5 w-3.5 text-slate-400" />
                          <span>{item.context.reason}</span>
                        </div>
                      )}
                    </div>

                    {isConfirming ? (
                      <div className="rounded-lg border border-slate-200 bg-white p-3">
                        <p className="mb-3 text-sm font-medium text-slate-700">
                          {confirmAction.type === "approve"
                            ? "Confirmar aprovação?"
                            : "Confirmar rejeição?"}
                        </p>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant={confirmAction.type === "approve" ? "primary" : "danger"}
                            onClick={() => handleResolve(item.id, confirmAction.type === "approve" ? "approved" : "rejected")}
                          >
                            {confirmAction.type === "approve" ? "Sim, Aprovar" : "Sim, Rejeitar"}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setConfirmAction(null)}>
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2 border-t border-slate-100 pt-4">
                        <Button
                          size="sm"
                          variant="primary"
                          className="bg-emerald-600 hover:bg-emerald-700 focus-visible:ring-emerald-500"
                          onClick={() => setConfirmAction({ id: item.id, type: "approve" })}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Aprovar
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => setConfirmAction({ id: item.id, type: "reject" })}
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Rejeitar
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Aprovações Recentes</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable<ResolvedApproval>
            columns={resolvedColumns}
            data={resolved}
            emptyMessage="Nenhuma aprovação resolvida recentemente."
          />
        </CardContent>
      </Card>
      </>
      )}
    </div>
  );
}
